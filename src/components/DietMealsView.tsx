import React, { useMemo } from 'react';
import { DietMeal, FoodCategory, Recipe } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

export type DietViewMode = 'lista' | 'fotos' | 'numeros';
const LS_KEY = 'enforma_diet_view_mode';

const KCAL_INT: Record<FoodCategory, number> = {
  HC: 100, PROT: 100, GRASA: 99, MIX_HC: 100, MIX_GRASA: 100,
};

const DISPLAY_CATS: FoodCategory[] = ['HC', 'PROT', 'GRASA'];

const CAT_COLOR: Record<FoodCategory, string> = {
  HC: 'text-amber-300', PROT: 'text-blue-300', GRASA: 'text-orange-300',
  MIX_HC: 'text-violet-300', MIX_GRASA: 'text-pink-300',
};
const CAT_BG: Record<FoodCategory, string> = {
  HC: 'bg-amber-500/10 border-amber-500/20',
  PROT: 'bg-blue-500/10 border-blue-500/20',
  GRASA: 'bg-orange-500/10 border-orange-500/20',
  MIX_HC: 'bg-violet-500/10 border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 border-pink-500/20',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function mealKcal(items: DietMeal['items']): number {
  return Math.round(items.reduce((s, it) => s + it.quantity * KCAL_INT[it.category], 0));
}

function mealExch(items: DietMeal['items']): Record<FoodCategory, number> {
  const r: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const it of items) r[it.category] = Math.round((r[it.category] + it.quantity) * 100) / 100;
  return r;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function fmtQ(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return q.toFixed(2).replace(/\.?0+$/, '');
}

function labelForMeal(name: string, n: number): string {
  const stripped = name.replace(/^Comida\s*\d+\s*/i, '').trim();
  return stripped || `Comida ${n}`;
}

function findPhoto(meal: DietMeal, recipes: Recipe[]): string | null {
  // Best-effort: find recipe whose ingredientsText names appear in the most item food labels
  let best: Recipe | null = null;
  let bestScore = 0;
  for (const recipe of recipes) {
    const photo = recipe.image ?? recipe.photoUrl;
    if (!photo) continue;
    const ingNames = (recipe.ingredientsText ?? []).map(i => norm(i.name));
    let score = 0;
    for (const item of meal.items) {
      const lbl = norm(item.foodLabel);
      if (ingNames.some(n => n.length > 2 && lbl.includes(n))) score++;
    }
    if (score > bestScore) { best = recipe; bestScore = score; }
  }
  return (best && bestScore > 0) ? (best.image ?? best.photoUrl ?? null) : null;
}

// ── localStorage hook ─────────────────────────────────────────────────────────

export function useDietViewMode(): [DietViewMode, (m: DietViewMode) => void] {
  const [mode, setModeState] = React.useState<DietViewMode>(() => {
    const v = localStorage.getItem(LS_KEY);
    return v === 'fotos' || v === 'numeros' ? v : 'lista';
  });
  const setMode = (m: DietViewMode) => {
    localStorage.setItem(LS_KEY, m);
    setModeState(m);
  };
  return [mode, setMode];
}

// ── DietViewSelector ──────────────────────────────────────────────────────────

interface SelectorProps {
  mode: DietViewMode;
  onChange: (m: DietViewMode) => void;
}

export function DietViewSelector({ mode, onChange }: SelectorProps) {
  const modes: { value: DietViewMode; icon: string; label: string }[] = [
    { value: 'lista',   icon: 'format_list_bulleted', label: 'Lista'   },
    { value: 'fotos',   icon: 'photo_library',         label: 'Fotos'   },
    { value: 'numeros', icon: 'tag',                   label: 'Números' },
  ];
  return (
    <div className="flex gap-1 bg-[#0e0e0e] border border-white/7 rounded-xl p-1">
      {modes.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
            mode === m.value
              ? 'bg-[#fbcb1a] text-black shadow-sm'
              : 'text-[#555] hover:text-[#c6c9ab]'
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{m.icon}</span>
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── DietFotosView ─────────────────────────────────────────────────────────────

interface FotosProps {
  meals: DietMeal[];
  recipes: Recipe[];
}

export function DietFotosView({ meals, recipes }: FotosProps) {
  return (
    <div className="space-y-4">
      {meals.map((meal, mi) => {
        const photo  = findPhoto(meal, recipes);
        const kcal   = mealKcal(meal.items);
        const exch   = mealExch(meal.items);
        const hasExch = DISPLAY_CATS.some(c => exch[c] > 0);
        const label  = labelForMeal(meal.name, mi + 1);

        return (
          <div key={meal.id} className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
            {/* Photo */}
            {photo ? (
              <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                <img src={photo} alt={label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                  <h3 className="font-sans font-bold text-white text-lg leading-tight drop-shadow-md">{label}</h3>
                  {kcal > 0 && (
                    <span className="font-mono text-[#fbcb1a] font-bold text-sm flex-shrink-0 drop-shadow-md">{kcal} kcal</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative w-full bg-[#0a0a0a] flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
                <span className="material-symbols-outlined text-[#1e1e1e]" style={{ fontSize: '72px' }}>restaurant</span>
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                  <h3 className="font-sans font-bold text-white text-lg leading-tight">{label}</h3>
                  {kcal > 0 && (
                    <span className="font-mono text-[#fbcb1a] font-bold text-sm flex-shrink-0">{kcal} kcal</span>
                  )}
                </div>
              </div>
            )}

            {/* Exchanges */}
            {hasExch && (
              <div className="px-4 pb-4 pt-3 flex flex-wrap gap-2">
                {DISPLAY_CATS.filter(c => exch[c] > 0).map(c => (
                  <span key={c} className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg border ${CAT_BG[c]} ${CAT_COLOR[c]}`}>
                    {fmtQ(exch[c])} {c}
                  </span>
                ))}
                {exch.MIX_HC > 0 && (
                  <span className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg border ${CAT_BG.MIX_HC} ${CAT_COLOR.MIX_HC}`}>
                    {fmtQ(exch.MIX_HC)} MIX HC
                  </span>
                )}
                {exch.MIX_GRASA > 0 && (
                  <span className={`font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg border ${CAT_BG.MIX_GRASA} ${CAT_COLOR.MIX_GRASA}`}>
                    {fmtQ(exch.MIX_GRASA)} MIX G
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── DietNumerosView ───────────────────────────────────────────────────────────

interface NumerosProps {
  meals: DietMeal[];
  budget: Record<FoodCategory, number>;
}

export function DietNumerosView({ meals, budget }: NumerosProps) {
  const totals = useMemo(() => {
    const t: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    for (const meal of meals) {
      for (const it of meal.items) t[it.category] = round2(t[it.category] + it.quantity);
    }
    return t;
  }, [meals]);

  const totalKcal   = meals.reduce((s, m) => s + mealKcal(m.items), 0);
  const budgetKcal  = Math.round((budget.HC ?? 0) * KCAL_INT.HC + (budget.PROT ?? 0) * KCAL_INT.PROT + (budget.GRASA ?? 0) * KCAL_INT.GRASA);
  const kcalDelta   = totalKcal - budgetKcal;

  return (
    <div className="space-y-2">
      {/* Per-meal rows */}
      {meals.map((meal, mi) => {
        const kcal = mealKcal(meal.items);
        const exch = mealExch(meal.items);
        return (
          <div key={meal.id} className="bg-[#181816] border border-white/7 rounded-xl overflow-hidden">
            {/* Meal header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e1e]">
              <span className="font-sans font-bold text-white text-sm">{labelForMeal(meal.name, mi + 1)}</span>
              <span className="font-mono text-[#fbcb1a] font-bold text-sm">{kcal > 0 ? `${kcal} kcal` : '—'}</span>
            </div>
            {/* Category grid */}
            <div className="grid grid-cols-3 divide-x divide-[#1e1e1e]">
              {DISPLAY_CATS.map(cat => {
                const v = exch[cat];
                const tgt = meal.target?.[cat] ?? 0;
                const isOk   = tgt > 0 && round2(v) >= round2(tgt);
                const isOver = tgt > 0 && v > tgt;
                return (
                  <div key={cat} className="py-3 px-2 text-center">
                    <span className={`block font-mono text-[9px] font-bold uppercase ${CAT_COLOR[cat]}`}>{cat}</span>
                    <span className={`block font-mono font-bold text-sm mt-0.5 ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-white'}`}>
                      {fmtQ(v)}{tgt > 0 ? `/${fmtQ(tgt)}` : ''}
                    </span>
                    <span className={`block font-mono text-[8px] mt-0.5 ${isOk ? 'text-green-400' : isOver ? 'text-red-400' : 'text-[#444]'}`}>
                      {isOk ? '✓ ok' : isOver ? `+${fmtQ(round2(v - tgt))}` : 'int'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Day totals */}
      <div className="bg-[#0e0e0e] border border-[#fbcb1a]/20 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
          <span className="font-mono text-[10px] text-[#fbcb1a] uppercase font-bold tracking-wide">Total del día</span>
          <div className="text-right">
            <span className="font-mono font-bold text-[#fbcb1a]">{totalKcal} kcal</span>
            {budgetKcal > 0 && (
              <span className={`block font-mono text-[9px] ${kcalDelta > 0 ? 'text-red-400' : kcalDelta < 0 ? 'text-[#555]' : 'text-green-400'}`}>
                {kcalDelta === 0 ? '✓ en presupuesto' : `${kcalDelta > 0 ? '+' : ''}${kcalDelta} vs ${budgetKcal}`}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#1e1e1e]">
          {DISPLAY_CATS.map(cat => {
            const v = totals[cat];
            const b = budget[cat] ?? 0;
            const isOver = b > 0 && v > b;
            const isOk   = b > 0 && round2(v) === round2(b);
            const delta  = round2(v - b);
            return (
              <div key={cat} className="py-3 px-2 text-center">
                <span className={`block font-mono text-[9px] font-bold uppercase ${CAT_COLOR[cat]}`}>{cat}</span>
                <span className={`block font-mono font-bold text-base mt-0.5 ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-white'}`}>
                  {fmtQ(v)}{b > 0 ? `/${fmtQ(b)}` : ''}
                </span>
                <span className={`block font-mono text-[8px] mt-0.5 ${isOk ? 'text-green-400' : isOver ? 'text-red-400' : 'text-[#555]'}`}>
                  {isOk ? '✓' : isOver ? `+${fmtQ(delta)}` : b > 0 ? `${fmtQ(delta)}` : 'int'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
