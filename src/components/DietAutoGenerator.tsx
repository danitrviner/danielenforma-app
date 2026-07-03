import React, { useState } from 'react';
import { OnboardingData, Recipe, Diet, DietItem, FoodCategory } from '../types';
import { queryIndyaForGenerator, createDiet } from '../dbService';
import { ingredientMatch } from '../utils/foodPrefs';
import { fitScore } from '../utils/recipeMatch';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  athleteEmail: string;
  onboarding: OnboardingData;
  onSaved: (diet: Diet) => void;
  onCancel: () => void;
}

type GenStep = 'config' | 'generating' | 'reviewing';
type MealCount = 3 | 4 | 5;

interface MealSlot {
  intakeType: number;
  name: string;
  pct: number;
}

interface Candidate {
  recipe: Recipe;
  bestScale: number;
  bestScore: number;
  bestExch: { HC: number; PROT: number; GRASA: number };
}

interface DraftMeal {
  intakeType: number;
  name: string;
  pct: number;
  target: { HC: number; PROT: number; GRASA: number };
  candidates: Candidate[];
  recipe: Recipe | null;
  scale: number;
  exch: { HC: number; PROT: number; GRASA: number };
  usedFallback: boolean;  // true when best recipe has disliked ingredients (no alternatives)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS: Record<MealCount, MealSlot[]> = {
  3: [
    { intakeType: 1, name: 'Desayuno',     pct: 25 },
    { intakeType: 3, name: 'Comida',       pct: 45 },
    { intakeType: 5, name: 'Cena',         pct: 30 },
  ],
  4: [
    { intakeType: 1, name: 'Desayuno',     pct: 20 },
    { intakeType: 2, name: 'Media mañana', pct: 10 },
    { intakeType: 3, name: 'Comida',       pct: 40 },
    { intakeType: 5, name: 'Cena',         pct: 30 },
  ],
  5: [
    { intakeType: 1, name: 'Desayuno',     pct: 20 },
    { intakeType: 2, name: 'Media mañana', pct: 10 },
    { intakeType: 3, name: 'Comida',       pct: 35 },
    { intakeType: 4, name: 'Merienda',     pct: 10 },
    { intakeType: 5, name: 'Cena',         pct: 25 },
  ],
};

const SCALES = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

// ── Pure helpers ──────────────────────────────────────────────────────────────

const rQ = (x: number) => Math.round(x / 0.25) * 0.25;

function dailyBudget(ob: OnboardingData) {
  return {
    HC:    rQ(ob.macroGrams.hc    / 25),
    PROT:  rQ(ob.macroGrams.prot  / 25),
    GRASA: rQ(ob.macroGrams.grasa / 11),
  };
}

function mealTarget(daily: { HC: number; PROT: number; GRASA: number }, pct: number) {
  return {
    HC:    rQ(daily.HC    * pct / 100),
    PROT:  rQ(daily.PROT  * pct / 100),
    GRASA: rQ(daily.GRASA * pct / 100),
  };
}

function sExch(recipe: Recipe, scale: number) {
  const e = recipe.exchanges ?? { HC: 0, PROT: 0, GRASA: 0 };
  return { HC: rQ(e.HC * scale), PROT: rQ(e.PROT * scale), GRASA: rQ(e.GRASA * scale) };
}

function scoreCandidate(r: Recipe, target: { HC: number; PROT: number; GRASA: number }, ob: OnboardingData): Candidate {
  let best = { scale: 1.0, exch: sExch(r, 1.0), sc: Infinity };
  for (const s of SCALES) {
    const exch = sExch(r, s);
    const sc = fitScore(target, exch);
    if (sc < best.sc) best = { scale: s, exch, sc };
  }
  const bonus = (ob.likedFoods ?? []).reduce((acc, food) =>
    acc + (ingredientMatch(r, food) ? 0.5 : 0),
    0,
  );
  return { recipe: r, bestScale: best.scale, bestScore: best.sc - bonus, bestExch: best.exch };
}

function filterAndRank(
  pool: Recipe[],
  target: { HC: number; PROT: number; GRASA: number },
  ob: OnboardingData,
): { candidates: Candidate[]; usedFallback: boolean } {
  const allergies = ob.allergies      ?? [];
  const dislikes  = ob.dislikedFoods  ?? [];

  // Always exclude allergies (safety)
  const safe = pool.filter(r =>
    r.exchanges && !allergies.some(f => ingredientMatch(r, f)),
  );

  // First try without disliked ingredients
  const strict = safe.filter(r => !dislikes.some(f => ingredientMatch(r, f)));
  const usedFallback = strict.length === 0 && safe.length > 0;
  const toScore = usedFallback ? safe : strict;

  return {
    candidates: toScore
      .map(r => scoreCandidate(r, target, ob))
      .sort((a, b) => a.bestScore - b.bestScore),
    usedFallback,
  };
}

function makeItems(recipe: Recipe, scale: number): DietItem[] {
  const e = recipe.exchanges ?? { HC: 0, PROT: 0, GRASA: 0 };
  const label = `${recipe.name}${scale !== 1 ? ` ×${scale}` : ''}`;
  const result: DietItem[] = [];
  for (const cat of ['HC', 'PROT', 'GRASA'] as const) {
    const qty = rQ(e[cat] * scale);
    if (qty > 0) result.push({ category: cat as FoodCategory, foodLabel: label, quantity: qty });
  }
  return result;
}

function devCls(target: number, actual: number): string {
  if (target === 0 && actual === 0) return 'text-[#c6c9ab]';
  if (target === 0) return 'text-amber-400';
  const dev = Math.abs(actual - target) / target;
  return dev <= 0.05 ? 'text-emerald-400' : dev <= 0.20 ? 'text-amber-400' : 'text-red-400';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DietAutoGenerator({ athleteEmail, onboarding, onSaved, onCancel }: Props) {
  const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const [step,     setStep]     = useState<GenStep>('config');
  const [name,     setName]     = useState(`Dieta Auto · ${today}`);
  const [count,    setCount]    = useState<MealCount>(5);
  const [slots,    setSlots]    = useState<MealSlot[]>([...PRESETS[5]]);
  const [genPhase, setGenPhase] = useState('');
  const [meals,    setMeals]    = useState<DraftMeal[]>([]);
  const [pickIdx,  setPickIdx]  = useState<number | null>(null);
  const [saving,   setSaving]   = useState(false);

  const budget = dailyBudget(onboarding);
  const pctSum = slots.reduce((s, sl) => s + sl.pct, 0);

  const handleCountChange = (n: MealCount) => {
    setCount(n);
    setSlots([...PRESETS[n]]);
  };

  const handleGenerate = async () => {
    setStep('generating');
    const draft: DraftMeal[] = [];
    for (let i = 0; i < slots.length; i++) {
      const sl     = slots[i];
      const target = mealTarget(budget, sl.pct);
      setGenPhase(`Buscando recetas para ${sl.name} (${i + 1}/${slots.length})…`);
      const pool   = await queryIndyaForGenerator(sl.intakeType, 150);
      const { candidates, usedFallback } = filterAndRank(pool, target, onboarding);
      const best = candidates[0] ?? null;
      draft.push({
        intakeType: sl.intakeType,
        name:       sl.name,
        pct:        sl.pct,
        target,
        candidates: candidates.slice(0, 30),
        recipe:     best?.recipe    ?? null,
        scale:      best?.bestScale ?? 1.0,
        exch:       best?.bestExch  ?? { HC: 0, PROT: 0, GRASA: 0 },
        usedFallback,
      });
    }
    setMeals(draft);
    setStep('reviewing');
  };

  const updateScale = (idx: number, scale: number) => {
    setMeals(prev => prev.map((m, i) => {
      if (i !== idx || !m.recipe) return m;
      return { ...m, scale, exch: sExch(m.recipe, scale) };
    }));
  };

  const pickRecipe = (mealIdx: number, c: Candidate) => {
    setMeals(prev => prev.map((m, i) =>
      i === mealIdx
        ? { ...m, recipe: c.recipe, scale: c.bestScale, exch: c.bestExch }
        : m,
    ));
    setPickIdx(null);
  };

  const handleSave = async (isDraft: boolean) => {
    setSaving(true);
    try {
      const data: Omit<Diet, 'id'> = {
        athleteId: athleteEmail,
        name:      name.trim() || 'Dieta Auto',
        isDraft:   isDraft || undefined,
        budget: { HC: budget.HC, PROT: budget.PROT, GRASA: budget.GRASA, MIX_HC: 0, MIX_GRASA: 0 },
        meals: meals.map((m, i) => ({
          id:     `auto_${i + 1}`,
          name:   m.name,
          target: { HC: m.target.HC, PROT: m.target.PROT, GRASA: m.target.GRASA, MIX_HC: 0, MIX_GRASA: 0 },
          items:  m.recipe ? makeItems(m.recipe, m.scale) : [],
        })),
      };
      const saved = await createDiet(data);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER: Config ────────────────────────────────────────────────────────────

  if (step === 'config') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-[#c6c9ab] hover:text-white transition-colors">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
          </button>
          <div>
            <h2 className="font-sans font-extrabold text-2xl text-white">Generar dieta automática</h2>
            <p className="text-[#c6c9ab] text-xs mt-0.5 font-mono">
              {onboarding.targetCalories} kcal · HC {onboarding.macroGrams.hc}g · PROT {onboarding.macroGrams.prot}g · GRASA {onboarding.macroGrams.grasa}g
            </p>
          </div>
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Nombre de la dieta</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#fbcb1a]/50 font-mono"
          />
        </div>

        <div className="bg-[#181816] border border-white/7 rounded-xl p-4 grid grid-cols-3 gap-4">
          {([
            { label: 'HC',    val: budget.HC,    color: 'text-amber-400'  },
            { label: 'PROT',  val: budget.PROT,  color: 'text-blue-400'   },
            { label: 'GRASA', val: budget.GRASA, color: 'text-orange-400' },
          ] as const).map(({ label, val, color }) => (
            <div key={label} className="text-center">
              <span className={`block font-mono text-[10px] ${color} uppercase mb-0.5`}>{label}</span>
              <span className="block font-black text-white text-xl">{val}</span>
              <span className="block font-mono text-[9px] text-[#555]">intercambios/día</span>
            </div>
          ))}
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-2">Número de ingestas</label>
          <div className="flex gap-2">
            {([3, 4, 5] as MealCount[]).map(n => (
              <button
                key={n}
                onClick={() => handleCountChange(n)}
                className={`px-5 py-2.5 rounded-lg font-mono font-bold text-sm transition-all ${
                  count === n
                    ? 'bg-[#fbcb1a] text-black'
                    : 'bg-[#181816] border border-white/7 text-[#c6c9ab] hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] text-[#c6c9ab] uppercase">Distribución (%)</label>
            <span className={`font-mono text-[10px] font-bold ${pctSum === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
              Suma: {pctSum}%
            </span>
          </div>
          <div className="space-y-2">
            {slots.map((sl, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#181816] border border-white/7 rounded-lg px-4 py-3">
                <span className="font-mono text-xs text-white w-28 flex-shrink-0">{sl.name}</span>
                <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#fbcb1a]/50 rounded-full transition-all"
                    style={{ width: `${Math.min(sl.pct, 100)}%` }}
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={sl.pct}
                  onChange={e => setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, pct: Number(e.target.value) } : s))}
                  className="w-16 text-right bg-[#1e1e1e] border border-white/7 rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-[#fbcb1a]/50"
                />
                <span className="font-mono text-[#555] text-xs">%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0e0e0e] border border-white/7 rounded-xl p-4">
          <p className="font-mono text-[10px] text-[#555] uppercase mb-3">Presupuesto por ingesta</p>
          <div className="space-y-1.5">
            {slots.map((sl, i) => {
              const t = mealTarget(budget, sl.pct);
              return (
                <div key={i} className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-[#c6c9ab] w-28 flex-shrink-0">{sl.name}</span>
                  <span className="text-amber-400/80">{t.HC} HC</span>
                  <span className="text-blue-400/80">{t.PROT} PROT</span>
                  <span className="text-orange-400/80">{t.GRASA} GRASA</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={pctSum !== 100}
            className="flex-1 py-3 bg-[#fbcb1a] text-black font-mono font-bold text-sm uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Generar dieta
          </button>
          <button
            onClick={onCancel}
            className="px-5 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-sm rounded-xl transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── RENDER: Generating ────────────────────────────────────────────────────────

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span className="material-symbols-outlined text-4xl text-[#fbcb1a] animate-spin">progress_activity</span>
        <p className="font-mono text-sm text-white">{genPhase}</p>
        <p className="font-mono text-[10px] text-[#555]">Buscando las mejores recetas de la biblioteca Indya…</p>
      </div>
    );
  }

  // ── RENDER: Review ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('config')} className="text-[#c6c9ab] hover:text-white transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
        </button>
        <div className="flex-1">
          <h2 className="font-sans font-extrabold text-2xl text-white">Revisar borrador</h2>
          <p className="text-[#c6c9ab] text-xs mt-0.5 font-mono">Ajusta recetas y escala antes de publicar</p>
        </div>
      </div>

      {/* Daily totals summary */}
      <div className="flex gap-4 bg-[#181816] border border-white/7 rounded-xl p-4">
        {(['HC', 'PROT', 'GRASA'] as const).map(cat => {
          const budgetVal  = budget[cat];
          const totalAct   = rQ(meals.reduce((s, m) => s + m.exch[cat], 0));
          const cls        = devCls(budgetVal, totalAct);
          return (
            <div key={cat} className="flex-1 text-center">
              <span className="block font-mono text-[9px] text-[#555] uppercase">{cat}</span>
              <span className={`block font-bold text-lg ${cls}`}>{totalAct}</span>
              <span className="block font-mono text-[9px] text-[#555]">/ {budgetVal} objetivo</span>
            </div>
          );
        })}
      </div>

      {/* Meal cards */}
      <div className="space-y-4">
        {meals.map((m, idx) => (
          <div key={idx} className="bg-[#181816] border border-white/7 rounded-xl overflow-hidden">
            {/* Meal header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#0e0e0e] border-b border-white/7">
              <span className="font-mono font-bold text-xs text-white uppercase">{m.name}</span>
              <span className="font-mono text-[9px] text-[#555] bg-[#1e1e1b] px-2 py-0.5 rounded">
                {m.pct}% · obj {m.target.HC}HC {m.target.PROT}P {m.target.GRASA}G
              </span>
            </div>

            <div className="p-4">
              {m.recipe ? (
                <div className="space-y-3">
                  {/* Recipe row */}
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-[#1c1b1b] border border-white/7">
                      {m.recipe.image
                        ? <img src={m.recipe.image} alt={m.recipe.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl text-[#2a2a2a]">skillet</span>
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-bold text-sm text-white leading-tight mb-1">{m.recipe.name}</p>
                      {m.recipe.categoria && (
                        <span className="font-mono text-[9px] text-[#555] bg-[#1e1e1b] px-1.5 py-0.5 rounded">
                          {m.recipe.categoria}
                        </span>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1.5">
                      <span className="font-mono text-[9px] text-[#555]">Escala</span>
                      <select
                        value={m.scale}
                        onChange={e => updateScale(idx, Number(e.target.value))}
                        className="bg-[#1c1b1b] border border-white/7 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-[#fbcb1a]/50"
                      >
                        {SCALES.map(s => (
                          <option key={s} value={s}>×{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Exchange comparison */}
                  <div className="grid grid-cols-3 gap-2">
                    {(['HC', 'PROT', 'GRASA'] as const).map(cat => {
                      const t   = m.target[cat];
                      const a   = m.exch[cat];
                      const cls = devCls(t, a);
                      const diff = +(a - t).toFixed(2);
                      return (
                        <div key={cat} className="bg-[#0e0e0e] border border-white/7 rounded-lg p-2.5 text-center">
                          <span className="block font-mono text-[9px] text-[#555] uppercase mb-1">{cat}</span>
                          <span className={`block font-bold text-base ${cls}`}>{a}</span>
                          <span className="block font-mono text-[9px] text-[#555]">
                            /{t}
                            {diff !== 0 && (
                              <span className={cls}> {diff > 0 ? `+${diff}` : diff}</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setPickIdx(pickIdx === idx ? null : idx)}
                      className="flex items-center gap-1.5 text-[10px] font-mono text-[#00eefc] hover:text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">swap_horiz</span>
                      {pickIdx === idx
                        ? 'Cerrar alternativas'
                        : `Cambiar receta (${m.candidates.length} candidatas)`
                      }
                    </button>
                    {m.usedFallback && (
                      <span className="flex items-center gap-1 font-mono text-[9px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>warning</span>
                        Sin alternativa sin ingredientes no deseados
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <span className="material-symbols-outlined text-2xl text-[#2a2a2a] block mb-1">no_meals</span>
                  <p className="font-mono text-xs text-[#555]">Sin recetas en biblioteca para esta ingesta.</p>
                  {m.candidates.length > 0 && (
                    <button
                      onClick={() => setPickIdx(pickIdx === idx ? null : idx)}
                      className="mt-2 text-[10px] font-mono text-[#00eefc] hover:text-white transition-colors"
                    >
                      Ver {m.candidates.length} candidatas
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Inline recipe picker */}
            {pickIdx === idx && m.candidates.length > 0 && (
              <div className="border-t border-white/7 max-h-64 overflow-y-auto">
                {m.candidates.map((c, ci) => {
                  const e          = c.bestExch;
                  const isSelected = m.recipe?.id === c.recipe.id;
                  return (
                    <button
                      key={ci}
                      onClick={() => pickRecipe(idx, c)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#1e1e1b] transition-colors ${isSelected ? 'bg-[#1a1c12]' : ''}`}
                    >
                      <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-[#1c1b1b]">
                        {c.recipe.image
                          ? <img src={c.recipe.image} alt="" className="w-full h-full object-cover" />
                          : <span className="material-symbols-outlined text-sm text-[#2a2a2a] leading-8 w-full text-center block">skillet</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-xs text-white truncate">{c.recipe.name}</p>
                        <p className="font-mono text-[9px] text-[#555]">
                          ×{c.bestScale} · {e.HC}HC {e.PROT}P {e.GRASA}G · fit {c.bestScore.toFixed(2)}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-[#fbcb1a] text-sm flex-shrink-0">check_circle</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-6">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex-1 py-3 bg-[#fbcb1a] text-black font-mono font-bold text-sm uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">publish</span>
          {saving ? 'Guardando…' : 'Publicar dieta'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="flex-1 py-3 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-sm uppercase rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">save</span>
          Guardar borrador
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-sm rounded-xl transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
