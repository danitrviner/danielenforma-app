import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  OnboardingData, Diet, AthleteDietConfig, AthleteNutritionConfig, Recipe, RecipeFavorites,
  MealItem, WeeklyMenu, MenuDay, WeekDay, FoodCategory,
} from '../types';
import { queryIndyaForGenerator, getRecipes, getFoodItems, createWeeklyMenu, updateWeeklyMenu, publishWeeklyMenu, getRecipeFavorites } from '../dbService';
import {
  slotsFromOnboarding, generateWeek, generateDay, isDayWithinTolerance,
  dayGlobalDeviation, rankCandidates, slotTargets, recipeMatchesSlot,
  buildBatchPlan, MealSlotSpec, GeneratorPrefs, MenuCandidate,
} from '../utils/menuEngine';
import { buildShoppingList } from '../utils/menuShoppingList';
import { DISH_TYPES, DishType } from '../utils/dishTypes';

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
  if (day.meals.length === 0) return { label: 'Libre', cls: 'text-ink-3 bg-raised border-hairline' };
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
  const [batch, setBatch] = useState<boolean>(initialMenu?.batchCooking ?? nutritionConfig?.batchCookingPreferred ?? onboarding?.batchCookingPreferred ?? false);
  const [genPhase, setGenPhase] = useState('');
  const [menu, setMenu] = useState<WeeklyMenu | null>(initialMenu ?? null);
  const [saving, setSaving] = useState(false);
  const [expandedDay, setExpandedDay] = useState<WeekDay | null>(WEEK_DAYS.find(d => (dietConfig?.weeklySchedule?.[d]) != null) ?? 'mon');
  const [pickerFor, setPickerFor] = useState<{ day: WeekDay; mealId: string } | null>(null);
  const [pickerCandidates, setPickerCandidates] = useState<MenuCandidate[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [showPrep, setShowPrep] = useState(false);

  // Athlete's recipe favorites/dislikes + dish-type preferences feed the generator
  // and swap picker. Dish prefs are prefilled from the athlete's config; the coach
  // can adjust them here for this generation without changing the athlete's choice.
  // Shared 'recipeFavorites' cache key (same as MyMenuScreen/RecipesScreen).
  const { data: favoritesData } = useQuery({
    queryKey: ['recipeFavorites', athleteEmail],
    queryFn: () => getRecipeFavorites(athleteEmail),
  });
  const favorites = useMemo<RecipeFavorites>(
    () => favoritesData
      ? { ...favoritesData, dislikedIds: favoritesData.dislikedIds ?? [] }
      : { athleteId: athleteEmail, recipeIds: [], dislikedIds: [] },
    [favoritesData, athleteEmail],
  );
  const [preferredDish, setPreferredDish] = useState<string[]>(nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []);
  const [excludedDish, setExcludedDish] = useState<string[]>(nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []);

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
    favoriteRecipeIds: favorites.recipeIds,
    dislikedRecipeIds: favorites.dislikedIds ?? [],
    preferredDishTypes: preferredDish as DishType[],
    excludedDishTypes: excludedDish as DishType[],
  }), [onboarding, variety, favorites, preferredDish, excludedDish]);

  function cycleDishType(id: string) {
    if (preferredDish.includes(id)) { setPreferredDish(p => p.filter(x => x !== id)); setExcludedDish(e => [...e, id]); }
    else if (excludedDish.includes(id)) { setExcludedDish(e => e.filter(x => x !== id)); }
    else { setPreferredDish(p => [...p, id]); }
  }
  function dishState(id: string): 'pref' | 'excl' | 'neutral' {
    if (preferredDish.includes(id)) return 'pref';
    if (excludedDish.includes(id)) return 'excl';
    return 'neutral';
  }

  // Recipe lookup for the prep/shopping preview, built from the pools + builder
  // recipes already loaded during generation (no extra fetches).
  const recipesById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const list of Object.values(pools) as Recipe[][]) for (const r of list) map.set(r.id, r);
    for (const r of builderRecipes ?? []) map.set(r.id, r);
    return map;
  }, [pools, builderRecipes]);

  const batchPlan = useMemo(() => (menu ? buildBatchPlan(menu.days) : []), [menu]);
  const shoppingList = useMemo(() => (menu ? buildShoppingList(menu.days, recipesById) : []), [menu, recipesById]);

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
    const days = generateWeek({ schedule, diets, slots, pools: nextPools, foods: foodList, prefs, batch });
    const draft: Omit<WeeklyMenu, 'id'> = {
      athleteId: athleteEmail,
      status: 'draft',
      name: name.trim() || 'Menú semanal',
      createdAt: new Date().toISOString(),
      varietyLevel: variety,
      batchCooking: batch,
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
      await updateWeeklyMenu(menu.id, { name: menu.name, days: menu.days, varietyLevel: variety, batchCooking: batch });
      onSaved(menu);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!menu) return;
    setSaving(true);
    try {
      await updateWeeklyMenu(menu.id, { name: menu.name, days: menu.days, varietyLevel: variety, batchCooking: batch });
      await publishWeeklyMenu({ ...menu, varietyLevel: variety, batchCooking: batch });
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
          <button onClick={onCancel} className="text-ink-2 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-body-s">arrow_back</span>
          </button>
          <div>
            <h2 className="font-sans font-bold text-title-l text-white">Generar menú semanal</h2>
            <p className="text-ink-2 text-label mt-0.5 font-sans">Las recetas son la base — puntos de intercambios ya pautados por día</p>
          </div>
        </div>

        {scheduledCount === 0 ? (
          <div className="bg-amber-400/10 border border-amber-400/20 rounded-surface p-4 flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-400 text-title-s">warning</span>
            <p className="font-sans text-caption text-amber-300">
              Este atleta no tiene ningún día programado en "Programación semanal". Asigna al menos una dieta a un día antes de generar el menú.
            </p>
          </div>
        ) : (
          <div className="bg-surface border border-hairline rounded-surface p-4">
            <p className="font-sans text-caption text-ink-3 uppercase mb-3">Programación semanal (fuente de los puntos)</p>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map(day => {
                const dietId = schedule[day];
                const diet = dietId ? diets.find(d => d.id === dietId) : null;
                return (
                  <div key={day} className="text-center">
                    <span className="block font-mono text-caption text-ink-2 uppercase">{WEEK_DAY_FULL[day].slice(0, 3)}</span>
                    <span className={`block font-sans text-caption mt-1 ${diet ? 'text-accent' : 'text-ink-3'}`}>
                      {diet ? diet.name : 'Libre'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Nombre del menú</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-surface border border-hairline rounded-control px-3 py-2.5 text-body-s text-white focus:outline-none focus:border-accent/50 font-mono"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="font-sans text-caption text-ink-2 uppercase">Ingestas (de la anamnesis, ajustable)</label>
            <span className={`font-mono text-caption font-bold ${pctSum === 100 ? 'text-emerald-400' : 'text-red-400'}`}>Suma: {pctSum}%</span>
          </div>
          <div className="space-y-2">
            {slots.map((sl, i) => (
              <div key={i} className="flex items-center gap-3 bg-surface border border-hairline rounded-surface px-4 py-3">
                <span className="font-sans text-label text-white w-32 flex-shrink-0 truncate">{sl.name}</span>
                <div className="flex-1 h-1.5 bg-raised rounded-full overflow-hidden">
                  <div className="h-full bg-accent/50 rounded-full transition-all" style={{ width: `${Math.min(sl.pct, 100)}%` }} />
                </div>
                <input
                  type="number" min={0} max={100} value={sl.pct}
                  onChange={e => setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, pct: Number(e.target.value) } : s))}
                  className="w-16 text-right bg-raised border border-hairline rounded-control px-2 py-1 text-body-s text-white font-mono focus:outline-none focus:border-accent/50"
                />
                <span className="font-mono text-ink-3 text-label">%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Batch cooking — supersedes variety when on */}
        <button
          onClick={() => setBatch(b => !b)}
          className={`w-full flex items-center gap-3 p-4 rounded-control border text-left transition-all ${batch ? 'bg-accent/10 border-accent/40' : 'bg-surface border-hairline hover:border-strong'}`}
        >
          <span className={`w-5 h-5 rounded-control flex-shrink-0 border-2 flex items-center justify-center transition-colors ${batch ? 'bg-accent border-accent' : 'border-hairline'}`}>
            {batch && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2 font-sans font-bold text-body-s text-white">
              <span className="material-symbols-outlined text-title-s text-accent">inventory_2</span>
              Batch cooking
            </span>
            <span className="block font-sans text-caption text-ink-2 mt-0.5">
              Una sola receta por comida para toda la semana, portada por día. El atleta cocina de golpe y se lo reparte.
            </span>
          </span>
        </button>

        <div className={batch ? 'opacity-40 pointer-events-none' : ''}>
          <label className="block font-sans text-caption text-ink-2 uppercase mb-2">
            Variedad — cuánto se repiten las recetas entre días
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                onClick={() => setVariety(v)}
                className={`flex-1 py-2.5 rounded-control font-mono font-bold text-body-s transition-all ${variety === v ? 'bg-accent text-black' : 'bg-surface border border-hairline text-ink-2 hover:text-white'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-caption text-ink-3">{batch ? 'En batch cooking se minimizan las recetas' : 'Monótono (repite)'}</span>
            <span className="font-mono text-caption text-ink-3">Máxima variedad</span>
          </div>
        </div>

        {/* Dish-type filter — prefilled from the athlete's preference */}
        <div>
          <label className="block font-mono text-caption text-ink-2 uppercase mb-1.5">Tipos de plato</label>
          <p className="font-sans text-caption text-ink-3 mb-2">
            Prellenado con lo que eligió el atleta. Toca: neutral → <span className="text-accent">priorizar</span> → <span className="text-red-400">excluir</span>.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DISH_TYPES.filter(dt => dt.id !== 'otro').map(dt => {
              const st = dishState(dt.id);
              const cls = st === 'pref'
                ? 'bg-accent border-accent text-black'
                : st === 'excl'
                  ? 'bg-red-500/15 border-red-500/40 text-red-300 line-through'
                  : 'bg-surface border-hairline text-ink-2 hover:text-white';
              return (
                <button
                  key={dt.id}
                  onClick={() => cycleDishType(dt.id)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-control border font-mono text-caption font-bold transition-all ${cls}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{dt.icon}</span>
                  {dt.label}
                </button>
              );
            })}
          </div>
        </div>

        {pctSum !== 100 && (
          <p className="font-mono text-caption text-red-400 -mt-2">La distribución debe sumar 100% (llevas {pctSum}%).</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={pctSum !== 100 || scheduledCount === 0}
            className="flex-1 py-3 bg-accent text-black font-sans font-bold text-body-s uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-title-s">auto_awesome</span>
            Generar menú
          </button>
          <button onClick={onCancel} className="px-5 py-3 border border-hairline text-ink-2 hover:text-white font-sans text-body-s rounded-control transition-all">
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
        <span className="material-symbols-outlined text-display text-accent animate-spin">progress_activity</span>
        <p className="font-mono text-body-s text-white">{genPhase}</p>
        <p className="font-sans text-caption text-ink-3">Repartiendo recetas por comida y ajustando escalas…</p>
      </div>
    );
  }

  // ── RENDER: Review ────────────────────────────────────────────────────────

  if (!menu) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-ink-2 hover:text-white transition-colors">
          <span className="material-symbols-outlined text-body-s">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-sans font-bold text-title-l text-white truncate flex items-center gap-2">
            {menu.name}
            {menu.batchCooking && (
              <span className="flex-shrink-0 flex items-center gap-1 text-caption font-mono font-bold uppercase text-accent bg-accent/10 border border-accent/25 px-1.5 py-0.5 rounded-control">
                <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>inventory_2</span>batch
              </span>
            )}
          </h2>
          <p className="text-ink-2 text-label mt-0.5 font-mono">
            {menu.status === 'published' ? 'Publicado — editable por el atleta vía intercambios' : 'Borrador — revisa antes de publicar'}
          </p>
        </div>
      </div>

      {/* Prep / shopping preview */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <button
          onClick={() => setShowPrep(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-field transition-colors"
        >
          <span className="flex items-center gap-2 font-sans font-bold text-body-s text-white">
            <span className="material-symbols-outlined text-accent text-title-s">{menu.batchCooking ? 'inventory_2' : 'shopping_cart'}</span>
            {menu.batchCooking ? 'Cocina de la semana + lista de la compra' : 'Lista de la compra'}
          </span>
          <span className="material-symbols-outlined text-ink-2 text-title-s">{showPrep ? 'expand_less' : 'expand_more'}</span>
        </button>
        {showPrep && (
          <div className="px-4 pb-4 space-y-4">
            {menu.batchCooking && batchPlan.length > 0 && (
              <div>
                <p className="font-sans text-caption text-ink-3 uppercase mb-2">Cocina de una vez</p>
                <div className="space-y-1.5">
                  {batchPlan.map(e => (
                    <div key={e.recipeId} className="flex items-center justify-between gap-2 bg-bg border border-hairline rounded-surface px-3 py-2">
                      <span className="font-sans text-label text-white truncate">{e.recipeName}</span>
                      <span className="font-mono text-caption text-accent flex-shrink-0">≈{e.servings} {e.servings === 1 ? 'ración' : 'raciones'} · ×{e.totalScale}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="font-sans text-caption text-ink-3 uppercase mb-2">Ingredientes de la semana</p>
              {shoppingList.length === 0 ? (
                <p className="font-sans text-caption text-ink-3">Regenera el menú para calcular los ingredientes.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {shoppingList.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border-b border-hairline py-1">
                      <span className="font-sans text-caption text-ink-2 truncate">{item.name}</span>
                      <span className="font-mono text-caption text-white flex-shrink-0">{item.display}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {menu.days.map(day => {
          const badge = devBadge(day);
          const expanded = expandedDay === day.day;
          return (
            <div key={day.day} className="bg-surface border border-hairline rounded-surface overflow-hidden">
              <button
                onClick={() => setExpandedDay(expanded ? null : day.day)}
                className="w-full flex items-center justify-between px-4 py-3 bg-bg hover:bg-field transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-ink-2 text-title-s">{expanded ? 'expand_less' : 'expand_more'}</span>
                  <span className="font-sans font-bold text-body-s text-white">{WEEK_DAY_FULL[day.day]}</span>
                  <span className="font-mono text-caption text-ink-3">{day.dietName ?? 'Libre'}</span>
                </div>
                <span className={`text-caption font-sans font-bold uppercase px-2 py-0.5 rounded-control border ${badge.cls}`}>{badge.label}</span>
              </button>

              {expanded && (
                <div className="p-4 space-y-3">
                  {day.meals.length === 0 ? (
                    <p className="font-sans text-label text-ink-3 text-center py-4">Día libre — sin dieta asignada, sin comidas generadas.</p>
                  ) : (
                    <>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleRegenerateDay(day.day)}
                          className="flex items-center gap-1.5 text-caption font-mono text-data hover:text-white transition-colors"
                        >
                          <span className="material-symbols-outlined text-body-s">refresh</span>
                          Regenerar día completo
                        </button>
                      </div>
                      {day.meals.map((meal, mealIdx) => (
                        <div key={meal.id} className="bg-bg border border-hairline rounded-surface p-3">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-surface overflow-hidden flex-shrink-0 bg-raised border border-hairline">
                              {meal.recipeImage
                                ? <img src={meal.recipeImage} alt={meal.recipeName} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-title-m text-ink-3">skillet</span></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-sans text-caption text-ink-3 uppercase">{meal.name}</span>
                                {meal.scale !== 1 && <span className="font-mono text-caption text-accent">×{meal.scale}</span>}
                              </div>
                              <p className="font-sans font-bold text-body-s text-white leading-tight truncate">{meal.recipeName}</p>
                              <p className="font-mono text-caption text-ink-2 mt-0.5">{fmtExch(meal.exch)} · {meal.kcal} kcal</p>
                              {meal.complements.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {meal.complements.map((c, ci) => (
                                    <span key={ci} className="text-caption font-mono text-ink-2 bg-raised border border-hairline px-1.5 py-0.5 rounded-control">
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
                              className="flex items-center gap-1 text-caption font-mono text-data hover:text-white transition-colors"
                            >
                              <span className="material-symbols-outlined text-body-s">swap_horiz</span>
                              Cambiar receta
                            </button>
                            <button
                              onClick={() => handleRegenerateMeal(day.day, mealIdx)}
                              className="flex items-center gap-1 text-caption font-mono text-ink-2 hover:text-white transition-colors"
                            >
                              <span className="material-symbols-outlined text-body-s">refresh</span>
                              Regenerar comida
                            </button>
                          </div>

                          {pickerFor?.day === day.day && pickerFor.mealId === meal.id && (
                            <div className="mt-3 border-t border-hairline pt-2 max-h-56 overflow-y-auto space-y-1">
                              {pickerLoading ? (
                                <p className="font-sans text-caption text-ink-3 text-center py-3">Buscando candidatas…</p>
                              ) : pickerCandidates.length === 0 ? (
                                <p className="font-sans text-caption text-ink-3 text-center py-3">Sin alternativas disponibles para esta ingesta.</p>
                              ) : (
                                pickerCandidates.map((c, ci) => (
                                  <button
                                    key={ci}
                                    onClick={() => pickCandidate(day.day, mealIdx, c)}
                                    className="w-full flex items-center gap-2.5 px-2 py-1.5 text-left hover:bg-raised rounded-control transition-colors"
                                  >
                                    <div className="w-7 h-7 rounded-control overflow-hidden flex-shrink-0 bg-raised">
                                      {c.recipe.image ? <img src={c.recipe.image} alt="" className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-sans text-label text-white truncate">{c.recipe.name}</p>
                                      <p className="font-mono text-caption text-ink-3">×{c.scale} · {fmtExch(c.exch)}</p>
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
          className="flex-1 py-3 bg-accent text-black font-sans font-bold text-body-s uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-title-s">publish</span>
          {saving ? 'Guardando…' : 'Publicar menú'}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="flex-1 py-3 bg-raised border border-hairline text-ink-2 hover:text-white font-sans text-body-s uppercase rounded-control transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-title-s">save</span>
          Guardar borrador
        </button>
        <button onClick={onCancel} className="px-5 py-3 border border-hairline text-ink-2 hover:text-white font-sans text-body-s rounded-control transition-all">
          Cancelar
        </button>
      </div>
    </div>
  );
}
