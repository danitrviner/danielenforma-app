import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, WeeklyMenu, AthleteNutritionConfig, RecipeFavorites, MenuCompletionLog,
  WeekDay, MenuDay, MenuMeal, Recipe, FoodCategory,
} from '../types';
import {
  getPublishedMenu, getOnboarding, getAthleteNutritionConfig, saveAthleteNutritionConfig,
  updateWeeklyMenu, getMenuCompletionLog, saveMenuCompletionLog,
  queryIndyaForGenerator, getRecipes, getRecipeById,
  getRecipeFavorites, saveRecipeFavorites,
} from '../dbService';
import { findSwapAlternatives, recipeMatchesSlot, buildBatchPlan, GeneratorPrefs, MenuCandidate } from '../utils/menuEngine';
import { buildShoppingList, ShoppingListItem } from '../utils/menuShoppingList';
import { DISH_TYPES, DishType } from '../utils/dishTypes';
import { substitutesFor } from '../utils/ingredientSubstitutions';

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_DAY_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEK_DAY_FULL: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};
const CAT_LABEL: Record<FoodCategory, string> = { HC: 'HC', PROT: 'PROT', GRASA: 'GRASA', MIX_HC: 'MIX·HC', MIX_GRASA: 'MIX·GRASA' };

const TODAY_DATE: string = new Date().toISOString().split('T')[0];

// JS getDay(): 0=Sun..6=Sat → our WeekDay array is Mon-first.
function todayWeekDay(): WeekDay {
  const jsDay = new Date().getDay();
  return WEEK_DAYS[(jsDay + 6) % 7];
}

function fmtExch(exch: { HC: number; PROT: number; GRASA: number }): string {
  const parts: string[] = [];
  if (exch.HC > 0) parts.push(`${exch.HC} HC`);
  if (exch.PROT > 0) parts.push(`${exch.PROT} PROT`);
  if (exch.GRASA > 0) parts.push(`${exch.GRASA} GRASA`);
  return parts.join(' · ') || '—';
}

interface Props {
  profile: UserProfile;
}

export default function MyMenuScreen({ profile }: Props) {
  const queryClient = useQueryClient();
  const menuKey = ['publishedMenu', profile.email] as const;
  const { data: menu = null, isPending: loadingMenu } = useQuery({
    queryKey: menuKey,
    queryFn: () => getPublishedMenu(profile.email),
  });
  const { data: onboarding = null, isPending: loadingOnboarding } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email),
  });
  const nutritionConfigKey = ['athleteNutritionConfig', profile.email] as const;
  const { data: nutritionConfig = null, isPending: loadingNutritionConfig } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(profile.email),
  });
  const [selectedDay, setSelectedDay] = useState<WeekDay>(todayWeekDay());
  const completionLogKey = ['menuCompletionLog', profile.email, TODAY_DATE] as const;
  const { data: completionLog, isPending: loadingCompletionLog } = useQuery({
    queryKey: completionLogKey,
    queryFn: () => getMenuCompletionLog(profile.email, TODAY_DATE),
  });
  const doneKeys = useMemo(() => new Set(completionLog?.doneMealKeys ?? []), [completionLog]);

  const favoritesKey = ['recipeFavorites', profile.email] as const;
  const { data: favoritesData, isPending: loadingFavorites } = useQuery({
    queryKey: favoritesKey,
    queryFn: () => getRecipeFavorites(profile.email),
  });
  const favorites = useMemo<RecipeFavorites>(
    () => favoritesData
      ? { ...favoritesData, dislikedIds: favoritesData.dislikedIds ?? [] }
      : { athleteId: profile.email, recipeIds: [], dislikedIds: [] },
    [favoritesData, profile.email]
  );

  const loading = loadingMenu || loadingOnboarding || loadingNutritionConfig || loadingCompletionLog || loadingFavorites;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [detailMealId, setDetailMealId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subForIngredient, setSubForIngredient] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<{ mealId: string; slot: number } | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<MenuCandidate[]>([]);
  const [savingVariety, setSavingVariety] = useState(false);
  const [savingBatchPref, setSavingBatchPref] = useState(false);
  const [dishPrefsOpen, setDishPrefsOpen] = useState(false);

  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[] | null>(null);

  const prefs: GeneratorPrefs = useMemo(() => ({
    allergies: onboarding?.allergies ?? [],
    disliked: onboarding?.dislikedFoods ?? [],
    liked: onboarding?.likedFoods ?? [],
    dietType: onboarding?.dietType,
    cookingMaxTime: onboarding?.cookingMaxTime,
    variety: nutritionConfig?.menuVariety ?? onboarding?.menuVariety ?? 3,
    favoriteRecipeIds: favorites.recipeIds,
    dislikedRecipeIds: favorites.dislikedIds ?? [],
    preferredDishTypes: (nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as DishType[],
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
  }), [onboarding, nutritionConfig, favorites]);

  const day: MenuDay | undefined = menu?.days.find(d => d.day === selectedDay);
  const batchPlan = useMemo(() => (menu ? buildBatchPlan(menu.days) : []), [menu]);
  const detailMeal = detailMealId ? menu?.days.flatMap(d => d.meals).find(m => m.id === detailMealId) : undefined;
  const detailSwaps = new Map((detailMeal?.ingredientSwaps ?? []).map(s => [s.from, s.to]));

  // Shopping list needs each recipe's full ingredient list — fetched lazily the
  // first time the athlete opens it (menu meals only store name/image).
  async function openShoppingList() {
    setShoppingOpen(o => !o);
    if (shoppingItems || !menu) return;
    setShoppingLoading(true);
    const ids = Array.from(new Set<string>(menu.days.flatMap(d => d.meals.map(m => m.recipeId).filter(Boolean))));
    const fetched = await Promise.all(ids.map(id => getRecipeById(id)));
    const map = new Map<string, Recipe>();
    fetched.forEach((r, i) => { if (r) map.set(ids[i], r); });
    setShoppingItems(buildShoppingList(menu.days, map));
    setShoppingLoading(false);
  }

  async function handleBatchPrefChange(value: boolean) {
    setSavingBatchPref(true);
    const next: AthleteNutritionConfig = { ...(nutritionConfig ?? { athleteId: profile.email, enabledModes: [] }), batchCookingPreferred: value };
    queryClient.setQueryData(nutritionConfigKey, next);
    try { await saveAthleteNutritionConfig(next); } finally { setSavingBatchPref(false); }
  }

  // Menu tick-offs live in their own collection (keys = `${day}_${mealId}`), so
  // this never touches the Intercambios tracker's per-item state or adherence.
  async function toggleDone(mealId: string) {
    if (!menu) return;
    const key = `${selectedDay}_${mealId}`;
    const next = new Set<string>(doneKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    const nextArr = Array.from(next);
    // Doc id is deterministic (`${athleteId}_${date}`, see MenuCompletionLog) so the
    // optimistic cache entry matches what a fresh getMenuCompletionLog would return.
    queryClient.setQueryData<MenuCompletionLog | null>(completionLogKey, prev => prev
      ? { ...prev, doneMealKeys: nextArr }
      : { id: `${profile.email}_${TODAY_DATE}`, athleteId: profile.email, date: TODAY_DATE, menuId: menu.id, doneMealKeys: nextArr });
    await saveMenuCompletionLog({
      athleteId: profile.email, date: TODAY_DATE,
      menuId: menu.id,
      doneMealKeys: nextArr,
    }).catch(() => {});
  }

  async function openDetail(meal: MenuMeal) {
    if (!meal.recipeId) return;
    setDetailOpen(true);
    setDetailMealId(meal.id);
    setSubForIngredient(null);
    setDetailLoading(true);
    setDetailRecipe(null);
    const r = await getRecipeById(meal.recipeId);
    setDetailRecipe(r);
    setDetailLoading(false);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailRecipe(null);
    setDetailMealId(null);
    setSubForIngredient(null);
  }

  // Persist the athlete's recipe favorites / dislikes (feeds the generator + swaps).
  async function saveFavs(next: RecipeFavorites) {
    queryClient.setQueryData(favoritesKey, next);
    await saveRecipeFavorites(next).catch(() => {});
  }
  function isFav(recipeId: string) { return favorites.recipeIds.includes(recipeId); }
  function isDisliked(recipeId: string) { return (favorites.dislikedIds ?? []).includes(recipeId); }

  function toggleFavorite(recipeId: string) {
    if (!recipeId) return;
    const fav = isFav(recipeId);
    saveFavs({
      ...favorites,
      recipeIds: fav ? favorites.recipeIds.filter(id => id !== recipeId) : [...favorites.recipeIds, recipeId],
      dislikedIds: (favorites.dislikedIds ?? []).filter(id => id !== recipeId), // favorite & dislike are mutually exclusive
    });
  }

  function toggleDislike(recipeId: string, meal?: MenuMeal) {
    if (!recipeId) return;
    const disliked = isDisliked(recipeId);
    saveFavs({
      ...favorites,
      dislikedIds: disliked ? (favorites.dislikedIds ?? []).filter(id => id !== recipeId) : [...(favorites.dislikedIds ?? []), recipeId],
      recipeIds: favorites.recipeIds.filter(id => id !== recipeId),
    });
    // Marking the current meal's recipe as "no me gusta" → offer to replace it now.
    if (!disliked && meal) openSwap(meal);
  }

  // Athlete's preferred / excluded dish types (tri-state cycle: neutral → más → evitar).
  async function cycleDishType(id: DishType) {
    const pref = new Set((nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as string[]);
    const excl = new Set((nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as string[]);
    if (pref.has(id)) { pref.delete(id); excl.add(id); }
    else if (excl.has(id)) { excl.delete(id); }
    else { pref.add(id); }
    const next: AthleteNutritionConfig = {
      ...(nutritionConfig ?? { athleteId: profile.email, enabledModes: [] }),
      preferredDishTypes: Array.from(pref), excludedDishTypes: Array.from(excl),
    };
    queryClient.setQueryData(nutritionConfigKey, next);
    await saveAthleteNutritionConfig(next).catch(() => {});
  }
  function dishState(id: string): 'pref' | 'excl' | 'neutral' {
    const pref = (nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as string[];
    const excl = (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as string[];
    if (pref.includes(id)) return 'pref';
    if (excl.includes(id)) return 'excl';
    return 'neutral';
  }

  // Swap one ingredient of the current meal for a same-group equivalent (approximate
  // equivalence, so exchanges/kcal stay the same). Persisted on the meal via `days`.
  async function applySubstitution(from: string, to: string) {
    if (!menu || !detailMealId) return;
    const nextDays = menu.days.map(d => ({
      ...d,
      meals: d.meals.map(m => {
        if (m.id !== detailMealId) return m;
        const swaps = (m.ingredientSwaps ?? []).filter(s => s.from !== from);
        // to === from means "revert to original": just drop the swap.
        return { ...m, ingredientSwaps: to === from ? swaps : [...swaps, { from, to }] };
      }),
    }));
    queryClient.setQueryData<WeeklyMenu | null>(menuKey, prev => prev ? { ...prev, days: nextDays } : prev);
    setSubForIngredient(null);
    await updateWeeklyMenu(menu.id, { days: nextDays }).catch(() => {});
  }

  async function openSwap(meal: MenuMeal) {
    setSwapFor({ mealId: meal.id, slot: meal.slot });
    setSwapLoading(true);
    setSwapCandidates([]);
    if (day) {
      const [indya, builder] = await Promise.all([queryIndyaForGenerator(meal.slot, 300), getRecipes()]);
      const pool = [...indya, ...builder.filter(r => recipeMatchesSlot(r, meal.slot))];
      const alts = findSwapAlternatives(day, meal.id, pool, prefs, 5);
      setSwapCandidates(alts);
    }
    setSwapLoading(false);
  }

  async function confirmSwap(candidate: MenuCandidate) {
    if (!menu || !day || !swapFor) return;
    const meal = day.meals.find(m => m.id === swapFor.mealId);
    if (!meal) return;

    const nextMeals = day.meals.map(m => m.id === meal.id
      ? { ...m, recipeId: candidate.recipe.id, recipeName: candidate.recipe.name, recipeImage: candidate.recipe.image ?? candidate.recipe.photoUrl, scale: candidate.scale, exch: candidate.exch, complements: [] }
      : m);
    const nextDay: MenuDay = { ...day, meals: nextMeals };
    const nextDays = menu.days.map(d => d.day === selectedDay ? nextDay : d);
    const swapEntry = {
      at: new Date().toISOString(), day: selectedDay, mealId: meal.id,
      fromRecipeId: meal.recipeId, fromRecipeName: meal.recipeName,
      toRecipeId: candidate.recipe.id, toRecipeName: candidate.recipe.name, toScale: candidate.scale,
    };
    const nextMenu: WeeklyMenu = { ...menu, days: nextDays, swapHistory: [...menu.swapHistory, swapEntry] };
    queryClient.setQueryData(menuKey, nextMenu);
    setSwapFor(null);
    setShoppingItems(null); // cached list is now stale
    await updateWeeklyMenu(menu.id, { days: nextDays, swapHistory: nextMenu.swapHistory }).catch(() => {});
  }

  async function handleVarietyChange(v: number) {
    setSavingVariety(true);
    const next: AthleteNutritionConfig = { ...(nutritionConfig ?? { athleteId: profile.email, enabledModes: [] }), menuVariety: v };
    queryClient.setQueryData(nutritionConfigKey, next);
    try { await saveAthleteNutritionConfig(next); } finally { setSavingVariety(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined text-3xl text-accent animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="bg-surface border border-hairline rounded-surface p-8 text-center space-y-2">
        <span className="material-symbols-outlined text-3xl text-ink-3 block">restaurant_menu</span>
        <p className="font-sans font-bold text-sm text-white">Todavía no tienes un menú semanal</p>
        <p className="font-mono text-xs text-ink-2">Tu entrenador aún no ha publicado un menú basado en recetas. Mientras tanto, sigue usando Intercambios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_DAYS.map(d => {
          const active = d === selectedDay;
          const isToday = d === todayWeekDay();
          const md = menu.days.find(x => x.day === d);
          const hasMeals = (md?.meals.length ?? 0) > 0;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-control border transition-all ${active ? 'bg-accent border-accent text-black' : 'bg-surface border-hairline text-ink-2 hover:border-strong'}`}
            >
              <span className="font-mono text-caption font-bold uppercase">{WEEK_DAY_SHORT[d]}</span>
              {isToday && <span className={`w-1 h-1 rounded-full ${active ? 'bg-black' : 'bg-accent'}`} />}
              {!hasMeals && <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>remove</span>}
            </button>
          );
        })}
      </div>

      {/* Batch cooking — cook-once plan for the whole week */}
      {menu.batchCooking && batchPlan.length > 0 && (
        <div className="bg-accent/5 border border-accent/25 rounded-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-base">inventory_2</span>
            <div>
              <p className="font-sans font-bold text-sm text-white">Cocina de la semana</p>
              <p className="font-mono text-caption text-ink-2">Prepáralo todo de una vez y repártelo por días.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {batchPlan.map(e => (
              <div key={e.recipeId} className="flex items-center gap-3 bg-bg border border-hairline rounded-surface px-3 py-2">
                <div className="w-9 h-9 rounded-surface overflow-hidden flex-shrink-0 bg-raised">
                  {e.recipeImage ? <img src={e.recipeImage} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <span className="flex-1 font-sans text-xs text-white truncate">{e.recipeName}</span>
                <span className="font-mono text-caption text-accent flex-shrink-0">≈{e.servings} {e.servings === 1 ? 'ración' : 'raciones'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shopping list — available for any menu */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <button onClick={openShoppingList} className="w-full flex items-center justify-between px-4 py-3 hover:bg-field transition-colors">
          <span className="flex items-center gap-2 font-sans font-bold text-sm text-white">
            <span className="material-symbols-outlined text-data text-base">shopping_cart</span>
            Lista de la compra de la semana
          </span>
          <span className="material-symbols-outlined text-ink-2 text-base">{shoppingOpen ? 'expand_less' : 'expand_more'}</span>
        </button>
        {shoppingOpen && (
          <div className="px-4 pb-4">
            {shoppingLoading ? (
              <div className="flex justify-center py-4"><span className="material-symbols-outlined text-xl text-accent animate-spin">progress_activity</span></div>
            ) : !shoppingItems || shoppingItems.length === 0 ? (
              <p className="font-mono text-caption text-ink-3 py-2">No hay ingredientes que listar en este menú.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {shoppingItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-hairline py-1">
                    <span className="font-sans text-caption text-ink-2 truncate">{item.name}</span>
                    <span className="font-mono text-caption text-white flex-shrink-0">{item.display}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-sans font-extrabold text-xl text-white">{WEEK_DAY_FULL[selectedDay]}</h2>
        <p className="font-mono text-xs text-ink-2">{day?.dietName ?? 'Día libre'}</p>
      </div>

      {/* Meals */}
      {!day || day.meals.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-surface p-6 text-center">
          <p className="font-mono text-xs text-ink-2">Sin menú para este día — usa Intercambios si quieres montarte algo igualmente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {day.meals.map(meal => {
            const done = doneKeys.has(`${selectedDay}_${meal.id}`);
            return (
              <div key={meal.id} className={`bg-surface border rounded-surface p-3 flex gap-3 transition-all ${done ? 'border-emerald-400/30' : 'border-hairline'}`}>
                <button
                  onClick={() => toggleDone(meal.id)}
                  className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors self-start mt-1 ${done ? 'bg-emerald-400 border-emerald-400' : 'border-hairline hover:border-ink-2'}`}
                  title={done ? 'Marcar como no hecha' : 'Marcar como hecha'}
                >
                  {done && <span className="material-symbols-outlined text-black text-base">check</span>}
                </button>

                <button
                  onClick={() => openDetail(meal)}
                  className="w-16 h-16 rounded-control overflow-hidden flex-shrink-0 bg-raised border border-hairline"
                >
                  {meal.recipeImage
                    ? <img src={meal.recipeImage} alt={meal.recipeName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-xl text-ink-3">skillet</span></div>}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-caption text-ink-3 uppercase">{meal.name}</span>
                    {meal.scale !== 1 && <span className="font-mono text-caption text-accent">×{meal.scale}</span>}
                  </div>
                  <p className={`font-sans font-bold text-sm leading-tight ${done ? 'text-ink-2 line-through' : 'text-white'}`}>{meal.recipeName}</p>
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
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      onClick={() => openSwap(meal)}
                      className="flex items-center gap-1 text-caption font-mono text-data hover:text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">swap_horiz</span>
                      Intercambiar
                    </button>
                    {meal.recipeId && (
                      <>
                        <button
                          onClick={() => toggleFavorite(meal.recipeId)}
                          title={isFav(meal.recipeId) ? 'Quitar de favoritas' : 'Me encanta — quiero que salga más'}
                          className="flex items-center transition-colors"
                          style={{ color: isFav(meal.recipeId) ? 'var(--color-accent)' : 'var(--color-ink-3)' }}
                        >
                          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: isFav(meal.recipeId) ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
                        </button>
                        <button
                          onClick={() => toggleDislike(meal.recipeId, meal)}
                          title={isDisliked(meal.recipeId) ? 'Quitar el "no me gusta"' : 'No me gusta — que no vuelva a salir'}
                          className="flex items-center transition-colors"
                          style={{ color: isDisliked(meal.recipeId) ? 'var(--color-danger)' : 'var(--color-ink-3)' }}
                        >
                          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: isDisliked(meal.recipeId) ? "'FILL' 1" : "'FILL' 0" }}>thumb_down</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dish-type preferences (tri-state) */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <button onClick={() => setDishPrefsOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-field transition-colors">
          <span className="flex items-center gap-2 font-sans font-bold text-sm text-white">
            <span className="material-symbols-outlined text-accent text-base">tune</span>
            Tipos de comida que prefieres
          </span>
          <span className="material-symbols-outlined text-ink-2 text-base">{dishPrefsOpen ? 'expand_less' : 'expand_more'}</span>
        </button>
        {dishPrefsOpen && (
          <div className="px-4 pb-4 space-y-3">
            <p className="font-mono text-caption text-ink-3">
              Toca una vez para que salga <span className="text-accent">más</span>, otra vez para <span className="text-red-400">evitarla</span>, otra para dejarla neutral.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DISH_TYPES.filter(dt => dt.id !== 'otro').map(dt => {
                const st = dishState(dt.id);
                const cls = st === 'pref'
                  ? 'bg-accent border-accent text-black'
                  : st === 'excl'
                    ? 'bg-red-500/15 border-red-500/40 text-red-300 line-through'
                    : 'bg-raised border-hairline text-ink-2 hover:text-white';
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
            <p className="font-mono text-caption text-ink-3">Se aplica a tus intercambios de recetas y a la próxima generación del coach.</p>
          </div>
        )}
      </div>

      {/* Variety preference */}
      <div className="bg-surface border border-hairline rounded-surface p-4 space-y-2">
        <p className="font-mono text-caption text-ink-2 uppercase">¿Cómo prefieres tu menú?</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(v => (
            <button
              key={v}
              disabled={savingVariety}
              onClick={() => handleVarietyChange(v)}
              className={`flex-1 py-2 rounded-control font-mono font-bold text-xs transition-all disabled:opacity-50 ${prefs.variety === v ? 'bg-accent text-black' : 'bg-raised border border-hairline text-ink-2 hover:text-white'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex justify-between">
          <span className="font-mono text-caption text-ink-3">Repetitivo, más sencillo</span>
          <span className="font-mono text-caption text-ink-3">Muy variado</span>
        </div>

        <button
          onClick={() => handleBatchPrefChange(!(nutritionConfig?.batchCookingPreferred ?? onboarding?.batchCookingPreferred ?? false))}
          disabled={savingBatchPref}
          className="w-full flex items-center gap-3 pt-3 mt-1 border-t border-hairline text-left disabled:opacity-50"
        >
          <span className={`w-5 h-5 rounded-control flex-shrink-0 border-2 flex items-center justify-center transition-colors ${(nutritionConfig?.batchCookingPreferred ?? onboarding?.batchCookingPreferred) ? 'bg-accent border-accent' : 'border-hairline'}`}>
            {(nutritionConfig?.batchCookingPreferred ?? onboarding?.batchCookingPreferred) && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-1.5 font-sans font-bold text-xs text-white">
              <span className="material-symbols-outlined text-sm text-accent">inventory_2</span>
              Prefiero batch cooking
            </span>
            <span className="block font-mono text-caption text-ink-2 mt-0.5">Cocinar todo de una vez y repartirlo por días.</span>
          </span>
        </button>

        <p className="font-mono text-caption text-ink-3">Se aplicará la próxima vez que tu entrenador genere el menú.</p>
      </div>

      {/* Swap sheet */}
      {swapFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setSwapFor(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-hairline rounded-surface w-full max-w-md max-h-[70vh] overflow-y-auto p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sans font-bold text-sm text-white">Elige una alternativa</h3>
              <button onClick={() => setSwapFor(null)} className="text-ink-2 hover:text-white">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            {swapLoading ? (
              <p className="font-mono text-xs text-ink-3 text-center py-6">Buscando alternativas que mantengan tus puntos…</p>
            ) : swapCandidates.length === 0 ? (
              <p className="font-mono text-xs text-ink-3 text-center py-6">No hay alternativas disponibles ahora mismo para este hueco.</p>
            ) : (
              swapCandidates.map((c, ci) => (
                <button
                  key={ci}
                  onClick={() => confirmSwap(c)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-bg border border-hairline hover:border-accent/40 rounded-control transition-all"
                >
                  <div className="w-10 h-10 rounded-surface overflow-hidden flex-shrink-0 bg-raised">
                    {c.recipe.image ? <img src={c.recipe.image} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-sm text-white truncate">{c.recipe.name}</p>
                    <p className="font-mono text-caption text-ink-2">{fmtExch(c.exch)} · mantiene tus puntos del día</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Recipe detail */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={closeDetail}>
          <div onClick={e => e.stopPropagation()} className="bg-surface border border-hairline rounded-surface w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 space-y-3">
            {detailLoading ? (
              <div className="flex items-center justify-center py-10">
                <span className="material-symbols-outlined text-2xl text-accent animate-spin">progress_activity</span>
              </div>
            ) : detailRecipe ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-sans font-bold text-base text-white">{detailRecipe.name}</h3>
                  <button onClick={closeDetail} className="text-ink-2 hover:text-white">
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
                {(detailRecipe.image ?? detailRecipe.photoUrl) && (
                  <div className="w-full aspect-[16/9] rounded-surface overflow-hidden bg-raised">
                    <img src={detailRecipe.image ?? detailRecipe.photoUrl} alt={detailRecipe.name} className="w-full h-full object-cover" />
                  </div>
                )}
                {detailRecipe.kcal != null && (
                  <p className="font-mono text-caption text-ink-2">{detailRecipe.kcal} kcal{detailRecipe.cookingTime != null ? ` · ${detailRecipe.cookingTime} min` : ''}</p>
                )}
                {(detailRecipe.ingredientsText?.length || detailRecipe.ingredients?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-1.5">Ingredientes</p>
                    <ul className="space-y-0.5">
                      {(detailRecipe.ingredientsText?.length
                        ? detailRecipe.ingredientsText.map(i => ({ label: i.name, qty: `${i.quantity}g` }))
                        : (detailRecipe.ingredients ?? []).map(i => ({ label: i.foodLabel, qty: `×${i.quantity}` }))
                      ).map((ing, idx) => {
                        const swappedTo = detailSwaps.get(ing.label);
                        const subs = detailMealId ? substitutesFor(ing.label) : [];
                        const open = subForIngredient === ing.label;
                        return (
                          <li key={idx} className="py-1 border-b border-hairline last:border-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-sans flex-1 pr-2">
                                {swappedTo ? (
                                  <>
                                    <span className="text-ink-2 line-through">{ing.label}</span>{' '}
                                    <span className="text-accent">→ {swappedTo}</span>
                                  </>
                                ) : (
                                  <span className="text-white">{ing.label}</span>
                                )}
                              </span>
                              <span className="font-mono text-caption text-ink-2 shrink-0">{ing.qty}</span>
                              {subs.length > 0 && (
                                <button
                                  onClick={() => setSubForIngredient(open ? null : ing.label)}
                                  title="Cambiar por un alimento parecido"
                                  className="text-data hover:text-white shrink-0"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>swap_horiz</span>
                                </button>
                              )}
                            </div>
                            {open && subs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 pb-1">
                                {swappedTo && (
                                  <button
                                    onClick={() => applySubstitution(ing.label, ing.label)}
                                    className="px-2 py-0.5 rounded-control bg-raised border border-hairline text-ink-2 font-mono text-caption hover:text-white"
                                  >↩ original</button>
                                )}
                                {subs.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => applySubstitution(ing.label, s)}
                                    className="px-2 py-0.5 rounded-control bg-raised border border-hairline text-white font-mono text-caption hover:border-accent/50 hover:text-accent"
                                  >{s}</button>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {detailMealId && (
                      <p className="font-mono text-caption text-ink-3 mt-1.5">Cambia un ingrediente por otro parecido si no lo tienes o no te gusta.</p>
                    )}
                  </div>
                ) : null}
                {(detailRecipe.stepsText?.length || detailRecipe.steps?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-1.5">Preparación</p>
                    <ol className="space-y-1.5 list-decimal list-inside">
                      {(detailRecipe.stepsText?.length
                        ? detailRecipe.stepsText.map(s => s.description)
                        : detailRecipe.steps ?? []
                      ).map((text, idx) => (
                        <li key={idx} className="text-xs text-ink-2 font-sans leading-relaxed">{text}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex justify-end">
                  <button onClick={closeDetail} className="text-ink-2 hover:text-white">
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
                <p className="font-mono text-xs text-ink-3 text-center py-6">No se pudo cargar la receta.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
