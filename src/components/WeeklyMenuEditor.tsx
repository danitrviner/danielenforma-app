import React, { useMemo, useState } from 'react';
import {
  OnboardingData, Diet, AthleteDietConfig, AthleteNutritionConfig, Recipe,
  MealItem, WeeklyMenu, MenuDay, WeekDay, FoodCategory,
} from '../types';
import { queryIndyaForGenerator, getRecipes, getFoodItems, createWeeklyMenu, updateWeeklyMenu, publishWeeklyMenu } from '../dbService';
import {
  slotsFromOnboarding, generateWeek, generateDay, isDayWithinTolerance,
  dayGlobalDeviation, rankCandidates, slotTargets, recipeMatchesSlot,
  MealSlotSpec, GeneratorPrefs, MenuCandidate,
} from '../utils/menuEngine';

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_DAY_FULL: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

const CAT_LABEL: Record<FoodCategory, string> = { HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA' };

interface Props {
  athleteEmail: string;
  onboarding: OnboardingData | null;
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  nutritionConfig: AthleteNutritionConfig | null;
  initialMenu?: WeeklyMenu;
  onSaved: (menu: WeeklyMenu) => void;
  onCancel: () => void;
}

type Step = 'config' | 'generating' | 'review';

function fmtExch(exch: { HC: number; PROT: number; GRASA: number }): string {
  const parts: string[] = [];
  if (exch.HC > 0) parts.push(`${exch.HC} HC`);
  if (exch.PROT > 0) parts.push(`${exch.PROT} PROT`);
  if (exch.GRASA > 0) parts.push(`${exch.GRASA} GRASA`);
  return parts.join(' · ') || '—';
}

function devBadge(day: MenuDay): { label: string; cls: string } {
  if (day.meals.length === 0) return { label: 'Libre', cls: 'text-[#555] bg-[#1c1b1b] border-white/7' };
  const dev = dayGlobalDeviation(day);
  const ok = isDayWithinTolerance(day);
  const cls = ok ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20';
  const label = dev === 0 ? 'Ajustado' : `${dev > 0 ? '+' : ''}${dev} int.`;
  return { label, cls };
}

export default function WeeklyMenuEditor({ athleteEmail, onboarding, diets, dietConfig, nutritionConfig, initialMenu, onSaved, onCancel }: Props) {
  const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const [step, setStep] = useState<Step>(initialMenu ? 'review' : 'config');
  const [name, setName] = useState(initialMenu?.name ?? `Menú semanal · ${today}`);
  const [slots, setSlots] = useState<MealSlotSpec[]>(() => slotsFromOnboarding(onboarding));
  const [variety, setVariety] = useState(initialMenu?.varietyLevel ?? nutritionConfig?.menuVariety ?? onboarding?.menuVariety ?? 3);
  const [genPhase, setGenPhase] = useState('');
  const [menu, setMenu] = useState<WeeklyMenu | null>(initialMenu ?? null);
  const [saving, setSaving] = useState(false);
  const [expandedDay, setExpandedDay] = useState<WeekDay | null>(WEEK_DAYS.find(d => (dietConfig?.weeklySchedule?.[d]) != null) ?? 'mon');
  const [pickerFor, setPickerFor] = useState<{ day: WeekDay; mealId: string } | null>(null);
  const [pickerCandidates, setPickerCandidates] = useState<MenuCandidate[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Lazily-populated caches so editing an existing draft doesn't need a fresh
  // full generation, only the pools touched by "cambiar receta"/"regenerar".
  const [pools, setPools] = useState<Record<number, Recipe[]>>({});
  const [builderRecipes, setBuilderRecipes] = useState<Recipe[] | null>(null);
  const [foods, setFoods] = useState<MealItem[] | null>(null);

  const schedule = dietConfig?.weeklySchedule ?? {};
  const scheduledCount = WEEK_DAYS.filter(d => schedule[d]).length;
  const pctSum = slots.reduce((s, sl) => s + sl.pct, 0);

  const prefs: GeneratorPrefs = useMemo(() => ({
    allergies: onboarding?.allergies ?? [],
    disliked: onboarding?.dislikedFoods ?? [],
    liked: onboarding?.likedFoods ?? [],
    dietType: onboarding?.dietType,
    cookingMaxTime: onboarding?.cookingMaxTime,
    variety,
  }), [onboarding, variety]);

  async function ensureBuilderRecipes(): Promise<Recipe[]> {
    if (builderRecipes) return builderRecipes;
    const list = await getRecipes();
    setBuilderRecipes(list);
    return list;
  }

  async function ensureFoods(): Promise<MealItem[]> {
    if (foods) return foods;
    const list = await getFoodItems();
    setFoods(list);
    return list;
  }

  async function ensurePool(slot: number): Promise<Recipe[]> {
    const cached = pools[slot];
    if (cached) return cached;
    const [indya, builder] = await Promise.all([queryIndyaForGenerator(slot, 300), ensureBuilderRecipes()]);
    const combined = [...indya, ...builder.filter(r => recipeMatchesSlot(r, slot))];
    setPools(prev => ({ ...prev, [slot]: combined }));
    return combined;
  }

  const handleGenerate = async () => {
    setStep('generating');
    setGenPhase('Cargando recetas y alimentos…');
    const uniqueSlots = Array.from(new Set<number>(slots.map(s => s.slot)));
    const nextPools: Record<number, Recipe[]> = {};
    for (const s of uniqueSlots) {
      setGenPhase(`Buscando recetas para ${slots.find(sl => sl.slot === s)?.name ?? 'la ingesta'}…`);
      nextPools[s] = await ensurePool(s);
    }
    const foodList = await ensureFoods();
    setGenPhase('Generando el menú de la semana…');
    const days = generateWeek({ schedule, diets, slots, pools: nextPools, foods: foodList, prefs });
    const draft: Omit<WeeklyMenu, 'id'> = {
      athleteId: athleteEmail,
      status: 'draft',
      name: name.trim() || 'Menú semanal',
      createdAt: new Date().toISOString(),
      varietyLevel: variety,
      days,
      swapHistory: [],
    };
    const saved = await createWeeklyMenu(draft);
    setMenu(saved);
    setStep('review');
  };

  const updateDay = (day: WeekDay, next: MenuDay) => {
    if (!menu) return;
    const updated = { ...menu, days: menu.days.map(d => (d.day === day ? next : d)) };
    setMenu(updated);
  };

  const handleRegenerateDay = async (day: WeekDay) => {
    if (!menu) return;
    const dietId = schedule[day] ?? null;
    const diet = dietId ? diets.find(d => d.id === dietId) ?? null : null;
    const usedSlots = Array.from(new Set<number>(slots.map(s => s.slot)));
    for (const s of usedSlots) await ensurePool(s);
    const foodList = await ensureFoods();
    const nextDay = generateDay({ day, diet, slots, pools, foods: foodList, prefs, usedIds: new Set() });
    updateDay(day, nextDay);
  };

  const handleRegenerateMeal = async (day: WeekDay, mealIdx: number) => {
    if (!menu) return;
    const menuDay = menu.days.find(d => d.day === day);
    if (!menuDay) return;
    const slot = slots[mealIdx];
    if (!slot) return;
    const pool = await ensurePool(slot.slot);
    const targets = slotTargets(menuDay.target, slots);
    const usedIds = new Set<string>(menuDay.meals.filter((_, i) => i !== mealIdx).map(m => m.recipeId));
    usedIds.add(menuDay.meals[mealIdx]?.recipeId ?? ''); // force a different pick than the current one
    const ranked = rankCandidates(pool, targets[mealIdx], prefs, usedIds, { needsTupper: slot.needsTupper });
    const pick = ranked[0];
    if (!pick) return;
    const nextMeals = [...menuDay.meals];
    nextMeals[mealIdx] = {
      ...nextMeals[mealIdx],
      recipeId: pick.recipe.id, recipeName: pick.recipe.name,
      recipeImage: pick.recipe.image ?? pick.recipe.photoUrl,
      scale: pick.scale, exch: pick.exch, complements: [],
    };
    updateDay(day, { ...menuDay, meals: nextMeals });
  };

  const openPicker = async (day: WeekDay, mealId: string, mealIdx: number) => {
    setPickerFor({ day, mealId });
    setPickerLoading(true);
    const menuDay = menu?.days.find(d => d.day === day);
    const slot = slots[mealIdx];
    if (menuDay && slot) {
      const pool = await ensurePool(slot.slot);
      const targets = slotTargets(menuDay.target, slots);
      const usedIds = new Set<string>(menuDay.meals.map(m => m.recipeId));
      const ranked = rankCandidates(pool, targets[mealIdx], prefs, usedIds, { needsTupper: slot.needsTupper });
      setPickerCandidates(ranked.slice(0, 12));
    }
    setPickerLoading(false);
  };

  const pickCandidate = (day: WeekDay, mealIdx: number, c: MenuCandidate) => {
    const menuDay = menu?.days.find(d => d.day === day);
    if (!menuDay) return;
    const nextMeals = [...menuDay.meals];
    nextMeals[mealIdx] = {
      ...nextMeals[mealIdx],
      recipeId: c.recipe.id, recipeName: c.recipe.name,
      recipeImage: c.recipe.image ?? c.recipe.photoUrl,
      scale: c.scale, exch: c.exch, complements: [],
    };
    updateDay(day, { ...menuDay, meals: nextMeals });
    setPickerFor(null);
  };

  const handleSaveDraft = async () => {
    if (!menu) return;
    setSaving(true);
    try {
      await updateWeeklyMenu(menu.id, { name: menu.name, days: menu.days, varietyLevel: variety });
      onSaved(menu);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!menu) return;
    setSaving(true);
    try {
      await updateWeeklyMenu(menu.id, { name: menu.name, days: menu.days, varietyLevel: variety });
      await publishWeeklyMenu({ ...menu, varietyLevel: variety });
      onSaved({ ...menu, status: 'published' });
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER: Config ────────────────────────────────────────────────────────

  if (step === 'config') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-[#c6c9ab] hover:text-white transition-colors">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
          </button>
          <div>
            <h2 className="font-sans font-extrabold text-2xl text-white">Generar menú semanal</h2>
            <p className="text-[#c6c9ab] text-xs mt-0.5 font-mono">Las recetas son la base — puntos de intercambios ya pautados por día</p>
          </div>
        </div>

        {scheduledCount === 0 ? (
          <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4 flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-400 text-base">warning</span>
            <p className="font-mono text-[11px] text-amber-300">
              Este atleta no tiene ningún día programado en "Programación semanal". Asigna al menos una dieta a un día antes de generar el menú.
            </p>
          </div>
        ) : (
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-4">
            <p className="font-mono text-[10px] text-[#555] uppercase mb-3">Programación semanal (fuente de los puntos)</p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map(day => {
                const dietId = schedule[day];
                const diet = dietId ? diets.find(d => d.id === dietId) : null;
                return (
                  <div key={day} className="text-center">
                    <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase">{WEEK_DAY_FULL[day].slice(0, 3)}</span>
                    <span className={`block font-mono text-[9px] mt-1 ${diet ? 'text-[#fbcb1a]' : 'text-[#555]'}`}>
                      {diet ? diet.name : 'Libre'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1">Nombre del menú</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#fbcb1a]/50 font-mono"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-mono text-[10px] text-[#c6c9ab] uppercase">Ingestas (de la anamnesis, ajustable)</label>
            <span className={`font-mono text-[10px] font-bold ${pctSum === 100 ? 'text-emerald-400' : 'text-red-400'}`}>Suma: {pctSum}%</span>
          </div>
          <div className="space-y-2">
            {slots.map((sl, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#181816] border border-white/7 rounded-lg px-4 py-3">
                <span className="font-mono text-xs text-white w-32 flex-shrink-0 truncate">{sl.name}</span>
                <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div className="h-full bg-[#fbcb1a]/50 rounded-full transition-all" style={{ width: `${Math.min(sl.pct, 100)}%` }} />
                </div>
                <input
                  type="number" min={0} max={100} value={sl.pct}
                  onChange={e => setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, pct: Number(e.target.value) } : s))}
                  className="w-16 text-right bg-[#1e1e1e] border border-white/7 rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-[#fbcb1a]/50"
                />
                <span className="font-mono text-[#555] text-xs">%</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-2">
            Variedad — cuánto se repiten las recetas entre días
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => setVariety(v)}
                className={`flex-1 py-2.5 rounded-lg font-mono font-bold text-sm transition-all ${variety === v ? 'bg-[#fbcb1a] text-black' : 'bg-[#181816] border border-white/7 text-[#c6c9ab] hover:text-white'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[9px] text-[#555]">Monótono (repite)</span>
            <span className="font-mono text-[9px] text-[#555]">Máxima variedad</span>
          </div>
        </div>

        {pctSum !== 100 && (
          <p className="font-mono text-[10px] text-red-400 -mt-2">La distribución debe sumar 100% (llevas {pctSum}%).</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={pctSum !== 100 || scheduledCount === 0}
            className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-sm uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Generar menú
          </button>
          <button onClick={onCancel} className="px-5 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-sm rounded-xl transition-all">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── RENDER: Generating ───────────────────────────────────────────────────

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span className="material-symbols-outlined text-4xl text-[#fbcb1a] animate-spin">progress_activity</span>
        <p className="font-mono text-sm text-white">{genPhase}</p>
        <p className="font-mono text-[10px] text-[#555]">Repartiendo recetas por comida y ajustando escalas…</p>
      </div>
    );
  }

  // ── RENDER: Review ────────────────────────────────────────────────────────

  if (!menu) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-[#c6c9ab] hover:text-white transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-sans font-extrabold text-2xl text-white truncate">{menu.name}</h2>
          <p className="text-[#c6c9ab] text-xs mt-0.5 font-mono">
            {menu.status === 'published' ? 'Publicado — editable por el atleta vía intercambios' : 'Borrador — revisa antes de publicar'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {menu.days.map(day => {
          const badge = devBadge(day);
          const expanded = expandedDay === day.day;
          return (
            <div key={day.day} className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedDay(expanded ? null : day.day)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0e0e0e] hover:bg-[#141414] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#c6c9ab] text-base">{expanded ? 'expand_less' : 'expand_more'}</span>
                  <span className="font-sans font-bold text-sm text-white">{WEEK_DAY_FULL[day.day]}</span>
                  <span className="font-mono text-[10px] text-[#555]">{day.dietName ?? 'Libre'}</span>
                </div>
                <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
              </button>

              {expanded && (
                <div className="p-4 space-y-3">
                  {day.meals.length === 0 ? (
                    <p className="font-mono text-xs text-[#555] text-center py-4">Día libre — sin dieta asignada, sin comidas generadas.</p>
                  ) : (
                    <>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleRegenerateDay(day.day)}
                          className="flex items-center gap-1.5 text-[10px] font-mono text-[#00eefc] hover:text-white transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">refresh</span>
                          Regenerar día completo
                        </button>
                      </div>
                      {day.meals.map((meal, mealIdx) => (
                        <div key={meal.id} className="bg-[#0e0e0e] border border-white/7 rounded-xl p-3">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#1c1b1b] border border-white/7">
                              {meal.recipeImage
                                ? <img src={meal.recipeImage} alt={meal.recipeName} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-lg text-[#2a2a2a]">skillet</span></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[9px] text-[#555] uppercase">{meal.name}</span>
                                {meal.scale !== 1 && <span className="font-mono text-[9px] text-[#fbcb1a]">×{meal.scale}</span>}
                              </div>
                              <p className="font-sans font-bold text-sm text-white leading-tight truncate">{meal.recipeName}</p>
                              <p className="font-mono text-[9px] text-[#c6c9ab] mt-0.5">{fmtExch(meal.exch)} · {meal.kcal} kcal</p>
                              {meal.complements.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {meal.complements.map((c, ci) => (
                                    <span key={ci} className="text-[9px] font-mono text-[#c6c9ab] bg-[#1c1b1b] border border-white/7 px-1.5 py-0.5 rounded">
                                      +{c.quantity} {CAT_LABEL[c.category]} · {c.foodLabel}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2.5">
                            <button
                              onClick={() => openPicker(day.day, meal.id, mealIdx)}
                              className="flex items-center gap-1 text-[10px] font-mono text-[#00eefc] hover:text-white transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">swap_horiz</span>
                              Cambiar receta
                            </button>
                            <button
                              onClick={() => handleRegenerateMeal(day.day, mealIdx)}
                              className="flex items-center gap-1 text-[10px] font-mono text-[#c6c9ab] hover:text-white transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">refresh</span>
                              Regenerar comida
                            </button>
                          </div>

                          {pickerFor?.day === day.day && pickerFor.mealId === meal.id && (
                            <div className="mt-3 border-t border-white/7 pt-2 max-h-56 overflow-y-auto space-y-1">
                              {pickerLoading ? (
                                <p className="font-mono text-[10px] text-[#555] text-center py-3">Buscando candidatas…</p>
                              ) : pickerCandidates.length === 0 ? (
                                <p className="font-mono text-[10px] text-[#555] text-center py-3">Sin alternativas disponibles para esta ingesta.</p>
                              ) : (
                                pickerCandidates.map((c, ci) => (
                                  <button
                                    key={ci}
                                    onClick={() => pickCandidate(day.day, mealIdx, c)}
                                    className="w-full flex items-center gap-2.5 px-2 py-1.5 text-left hover:bg-[#1e1e1b] rounded-lg transition-colors"
                                  >
                                    <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0 bg-[#1c1b1b]">
                                      {c.recipe.image ? <img src={c.recipe.image} alt="" className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-sans text-xs text-white truncate">{c.recipe.name}</p>
                                      <p className="font-mono text-[9px] text-[#555]">×{c.scale} · {fmtExch(c.exch)}</p>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-6">
        <button
          onClick={handlePublish}
          disabled={saving}
          className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-sm uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">publish</span>
          {saving ? 'Guardando…' : 'Publicar menú'}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="flex-1 py-3 bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-sm uppercase rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">save</span>
          Guardar borrador
        </button>
        <button onClick={onCancel} className="px-5 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-sm rounded-xl transition-all">
          Cancelar
        </button>
      </div>
    </div>
  );
}
