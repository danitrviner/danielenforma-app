import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, WeeklyMenu, RecipeFavorites, MenuCompletionLog,
  WeekDay, MenuDay, MenuMeal, Recipe, FoodCategory, MenuComplement, MealItem, DietMode,
} from '../types';
import {
  getPublishedMenu, getOnboarding, getAthleteNutritionConfig,
  updateWeeklyMenu, getMenuCompletionLog, saveMenuCompletionLog,
  queryRecetasForGenerator, getRecipes, getRecipeById,
  getRecipeFavorites, saveRecipeFavorites, getFoodItems, seedFoodItemsIfEmpty,
} from '../dbService';
import { findSwapAlternatives, recipeMatchesSlot, buildBatchPlan, totalConExtras, GeneratorPrefs, SwapCandidate } from '../utils/menuEngine';
import { normalizeStr } from '../utils/foodPrefs';
import { complementosDisponibles } from '../utils/menuComplements';
import { foodNameWithoutGrams, foodNameShort, itemWeightLabel } from '../utils/exchangeHelpers';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { buildShoppingList, ShoppingListItem } from '../utils/menuShoppingList';
import { DishType } from '../utils/dishTypes';
import { substitutesFor } from '../utils/ingredientSubstitutions';
import { Icon, EmptyState, ListRow, Badge, Sheet, Dialog, ScreenSkeleton } from './ui';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import FotoDeReceta from './FotoDeReceta';

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

/** Cuántas alternativas se pintan de golpe por bloque (el resto, bajo demanda). */
const SWAP_PAGE = 12;

// Qué le pasa al día si acepta una alternativa "aproximada". Se dice el macro y
// la dirección, no un número abstracto: "te deja corto de HC" es accionable,
// "desviación 1,4" no. Solo se nombra el macro que más se mueve.
function describeDrift(drift: { HC: number; PROT: number; GRASA: number }): string {
  const cats: [keyof typeof drift, string][] = [['HC', 'hidratos'], ['PROT', 'proteína'], ['GRASA', 'grasa']];
  const [cat, label] = cats.reduce((peor, actual) =>
    Math.abs(drift[actual[0]]) > Math.abs(drift[peor[0]]) ? actual : peor);
  const v = drift[cat];
  if (Math.abs(v) < 0.25) return 'te deja casi igual';
  return v > 0 ? `te pasa ${v} de ${label}` : `te deja ${Math.abs(v)} corto de ${label}`;
}

interface Props {
  profile: UserProfile;
}

export default function MyMenuScreen({ profile }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  // Banco de intercambios: es el catálogo de extras que puede elegir el atleta.
  const { data: foodList = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => seedFoodItemsIfEmpty().catch(() => {}).then(getFoodItems),
    staleTime: Infinity, // no cambia dentro de una sesión
  });
  // El modo lo fija el entrenador; si habilitó varios, manda el primero.
  const dietMode: DietMode = nutritionConfig?.enabledModes?.[0] ?? 'OMNIVORO';

  const loading = loadingMenu || loadingOnboarding || loadingNutritionConfig || loadingCompletionLog || loadingFavorites;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [detailMealId, setDetailMealId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subForIngredient, setSubForIngredient] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<{ mealId: string; slot: number } | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<SwapCandidate[]>([]);
  const [swapQuery, setSwapQuery] = useState('');
  const [swapVisible, setSwapVisible] = useState(SWAP_PAGE);
  // Edición de extras: `idx` null = añadir uno nuevo a esa comida.
  const [extrasFor, setExtrasFor] = useState<{ mealId: string; idx: number | null } | null>(null);
  const [extraQuery, setExtraQuery] = useState('');
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[] | null>(null);

  const prefs: GeneratorPrefs = useMemo(() => ({
    allergies: onboarding?.allergies ?? [],
    disliked: onboarding?.dislikedFoods ?? [],
    liked: onboarding?.likedFoods ?? [],
    // Manda lo que el atleta haya corregido en Perfil > Preferencias; la ficha
    // de iniciación es solo el valor de partida (igual que `variety` y los
    // tipos de plato, justo debajo).
    dietType: nutritionConfig?.dietType ?? onboarding?.dietType,
    cookingMaxTime: nutritionConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime,
    variety: nutritionConfig?.menuVariety ?? onboarding?.menuVariety ?? 3,
    favoriteRecipeIds: favorites.recipeIds,
    dislikedRecipeIds: favorites.dislikedIds ?? [],
    preferredDishTypes: (nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as DishType[],
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
  }), [onboarding, nutritionConfig, favorites]);

  const swapFiltradas = useMemo(() => {
    const q = normalizeStr(swapQuery.trim());
    if (!q) return swapCandidates;
    return swapCandidates.filter(c => normalizeStr(c.recipe.name).includes(q));
  }, [swapCandidates, swapQuery]);
  const swapExactas = useMemo(() => swapFiltradas.filter(c => c.fit === 'exacto'), [swapFiltradas]);
  const swapAproximadas = useMemo(() => swapFiltradas.filter(c => c.fit === 'aproximado'), [swapFiltradas]);

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
    setSwapQuery('');
    setSwapVisible(SWAP_PAGE);
    if (day) {
      // Recetario ENTERO de la franja, no la muestra de 300 que usa el generador.
      // El índice ya está en memoria (se descarga una vez), así que recortarlo
      // aquí no ahorraba nada y sí escondía opciones: con un día de 2.200 kcal,
      // de las ~660 alternativas válidas que hay para la comida, la muestra de
      // 300 solo contenía ~40, y de esas se enseñaban 5.
      const [recetas, builder] = await Promise.all([
        queryRecetasForGenerator(meal.slot, Infinity),
        getRecipes({ ownerId: profile.userId }),
      ]);
      const pool = [...recetas, ...builder.filter(r => recipeMatchesSlot(r, meal.slot))];
      setSwapCandidates(findSwapAlternatives(day, meal.id, pool, prefs));
    }
    setSwapLoading(false);
  }

  function abrirExtras(meal: MenuMeal, idx: number | null) {
    setExtrasFor({ mealId: meal.id, idx });
    setExtraQuery('');
  }

  /** Escribe los extras de una comida y persiste. Un solo camino para cambiar,
   *  añadir, subir/bajar cantidad y quitar, para que las kcal se recalculen
   *  siempre igual y no haya forma de dejar la comida descuadrada. */
  async function guardarExtras(mealId: string, siguiente: MenuComplement[]) {
    if (!menu || !day) return;
    const nextDays = menu.days.map(d => d.day !== selectedDay ? d : {
      ...d,
      meals: d.meals.map(m => m.id !== mealId ? m : {
        ...m,
        complements: siguiente,
        kcal: Math.round(exchangeToKcal(totalConExtras(m.exch, siguiente))),
      }),
    });
    queryClient.setQueryData<WeeklyMenu | null>(menuKey, prev => prev ? { ...prev, days: nextDays } : prev);
    setShoppingItems(null); // la lista de la compra cacheada ya no vale
    await updateWeeklyMenu(menu.id, { days: nextDays }).catch(() => {});
  }

  function extrasDe(mealId: string): MenuComplement[] {
    return day?.meals.find(m => m.id === mealId)?.complements ?? [];
  }

  async function confirmSwap(candidate: SwapCandidate) {
    if (!menu || !day || !swapFor) return;
    const meal = day.meals.find(m => m.id === swapFor.mealId);
    if (!meal) return;

    // Los extras se CONSERVAN: la alternativa se ha buscado para sustituir al
    // plato, no a la comida entera (ver `findSwapAlternatives`). Antes se
    // vaciaban, porque la búsqueda apuntaba al total de la comida y la receta
    // nueva tenía que absorberlos.
    const nextMeals = day.meals.map(m => m.id === meal.id
      ? {
        ...m,
        recipeId: candidate.recipe.id, recipeName: candidate.recipe.name,
        recipeImage: fotoDeReceta(candidate.recipe),
        scale: candidate.scale, exch: candidate.exch,
        kcal: Math.round(exchangeToKcal(totalConExtras(candidate.exch, m.complements))),
      }
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

  if (loading) {
    return <ScreenSkeleton />;
  }

  if (!menu) {
    return (
      <div className="bg-surface border border-hairline rounded-surface">
        <EmptyState
          icon="restaurant_menu"
          title="Todavía no tienes un menú semanal"
          description="Tu entrenador aún no ha publicado un menú basado en recetas. Mientras tanto, sigue usando Intercambios."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-2">
        {WEEK_DAYS.map(d => {
          const active = d === selectedDay;
          const isToday = d === todayWeekDay();
          const md = menu.days.find(x => x.day === d);
          const hasMeals = (md?.meals.length ?? 0) > 0;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex flex-col items-center py-2 rounded-control border transition-all ${active ? 'bg-accent border-accent text-black' : 'bg-surface border-hairline text-ink-2 hover:border-strong'}`}
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
            <Icon name="inventory_2" size="m" className="text-accent" />
            <div>
              <p className="font-sans font-bold text-body-s text-ink">Cocina de la semana</p>
              <p className="font-sans text-caption text-ink-2">Prepáralo todo de una vez y repártelo por días.</p>
            </div>
          </div>
          <div className="space-y-2">
            {batchPlan.map(e => (
              <ListRow
                key={e.recipeId}
                className="rounded-surface border bg-bg border-hairline"
                leading={
                  <div className="w-9 h-9 rounded-surface overflow-hidden flex-shrink-0 bg-raised">
                    <FotoDeReceta src={e.recipeImage} alt="" className="w-full h-full object-cover" fallback={null} />
                  </div>
                }
                title={e.recipeName}
                trailing={<span className="font-mono text-caption text-accent flex-shrink-0">≈{e.servings} {e.servings === 1 ? 'ración' : 'raciones'}</span>}
              />
            ))}
          </div>
        </div>
      )}

      {/* Shopping list — available for any menu */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <button onClick={openShoppingList} className="w-full flex items-center justify-between px-4 py-3 hover:bg-field transition-colors">
          <span className="flex items-center gap-2 font-sans font-bold text-body-s text-ink">
            <Icon name="shopping_cart" size="m" className="text-accent" />
            Lista de la compra de la semana
          </span>
          <Icon name={shoppingOpen ? 'expand_less' : 'expand_more'} size="m" className="text-ink-2" />
        </button>
        {shoppingOpen && (
          <div className="px-4 pb-4">
            {shoppingLoading ? (
              <div className="flex justify-center py-4"><Icon name="progress_activity" size="l" className="text-accent animate-spin" /></div>
            ) : !shoppingItems || shoppingItems.length === 0 ? (
              <p className="font-sans text-caption text-ink-3 py-2">No hay ingredientes que listar en este menú.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {shoppingItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-hairline py-1">
                    <span className="font-sans text-caption text-ink-2 truncate">{item.name}</span>
                    <span className="font-mono text-caption text-ink flex-shrink-0">{item.display}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-sans font-bold text-title-m text-ink">{WEEK_DAY_FULL[selectedDay]}</h2>
        <p className="font-mono text-label text-ink-2">{day?.dietName ?? 'Día libre'}</p>
      </div>

      {/* Meals */}
      {!day || day.meals.length === 0 ? (
        <div className="bg-surface border border-hairline rounded-surface">
          <EmptyState icon="event_busy" title="Sin menú para este día" description="Usa Intercambios si quieres montarte algo igualmente." />
        </div>
      ) : (
        <div className="space-y-3">
          {day.meals.map(meal => {
            const done = doneKeys.has(`${selectedDay}_${meal.id}`);
            return (
              <div key={meal.id} className={`bg-surface border rounded-surface overflow-hidden transition-all ${done ? 'border-success/30' : 'border-hairline'}`}>
                {/* Foto a sangre, mismo patrón que RecetaCard en la Biblioteca de
                    recetas — antes era una miniatura de 64px, demasiado pequeña
                    para verse bien (queja real de Dani). */}
                <button
                  onClick={() => openDetail(meal)}
                  className="relative block w-full aspect-[21/9] bg-raised"
                >
                  <FotoDeReceta
                    src={meal.recipeImage}
                    alt={meal.recipeName}
                    className="absolute inset-0 w-full h-full object-cover"
                    fallback={<div className="absolute inset-0 flex items-center justify-center"><Icon name="skillet" size="xl" className="text-ink-3" /></div>}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                    <span className="font-sans text-caption text-ink-2 uppercase tracking-wider">
                      {meal.name}{meal.scale !== 1 ? ` · ×${meal.scale}` : ''}
                    </span>
                    <p className={`font-sans font-bold text-title-s leading-tight ${done ? 'text-ink-2 line-through' : 'text-ink'}`}>
                      {meal.recipeName}
                    </p>
                  </div>
                  {done && (
                    <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-success flex items-center justify-center">
                      <Icon name="check" size="m" className="text-black" />
                    </span>
                  )}
                </button>

                <div className="p-3 flex gap-3">
                  <button
                    onClick={() => toggleDone(meal.id)}
                    className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors self-start ${done ? 'bg-success border-success' : 'border-hairline hover:border-ink-2'}`}
                    title={done ? 'Marcar como no hecha' : 'Marcar como hecha'}
                  >
                    {done && <Icon name="check" size="m" className="text-black" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-caption text-ink-2">{fmtExch(meal.exch)} · {meal.kcal} kcal</p>
                    {/* Los extras son EDITABLES. Los pone el generador para
                        cerrar lo que la receta no llega a cubrir, pero quien
                        decide si eso es pan, fruta o un yogur es el atleta: son
                        sus intercambios y su nevera. */}
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {meal.complements.map((c, ci) => (
                        <button
                          key={ci}
                          onClick={() => abrirExtras(meal, ci)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-raised border border-hairline hover:border-accent/40 transition-colors"
                        >
                          {/* El peso primero: es lo accionable ("30g de pan"),
                              no el número de intercambios. Nombre corto, sin la
                              coletilla entre paréntesis del banco, que en un
                              móvil de 375px se comía la fila entera. */}
                          <span className="font-mono text-caption text-ink-2 truncate max-w-[13rem]">
                            {itemWeightLabel(c.foodLabel, c.quantity)} {foodNameShort(c.foodLabel)}
                          </span>
                          <Icon name="edit" size="s" className="text-ink-3" />
                        </button>
                      ))}
                      <button
                        onClick={() => abrirExtras(meal, null)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-hairline text-caption font-mono text-ink-3 hover:text-ink hover:border-accent/40 transition-colors"
                      >
                        <Icon name="add" size="s" />
                        Extra
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => openSwap(meal)}
                        className="flex items-center gap-1 text-caption font-mono text-info hover:text-ink transition-colors"
                      >
                        <Icon name="swap_horiz" size="s" />
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
                            <Icon name="favorite" size="m" filled={isFav(meal.recipeId)} />
                          </button>
                          <button
                            onClick={() => toggleDislike(meal.recipeId, meal)}
                            title={isDisliked(meal.recipeId) ? 'Quitar el "no me gusta"' : 'No me gusta — que no vuelva a salir'}
                            className="flex items-center transition-colors"
                            style={{ color: isDisliked(meal.recipeId) ? 'var(--color-danger)' : 'var(--color-ink-3)' }}
                          >
                            <Icon name="thumb_down" size="m" filled={isDisliked(meal.recipeId)} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tipos de comida que prefieres / variedad / batch cooking / verduras se
          movieron a Perfil > Preferencias — no tenía sentido tenerlos aquí,
          en la pantalla de "ya está hecho", cuando no cambian el menú
          publicado hasta la próxima generación del coach. */}
      <div className="bg-surface border border-hairline rounded-surface p-4 flex items-center justify-between gap-3">
        <p className="font-sans text-caption text-ink-2">
          Tipos de comida, variedad y batch cooking se editan ahora en tu perfil.
        </p>
        <button
          type="button"
          onClick={() => navigate('/profile?tab=preferencias')}
          className="flex-shrink-0 flex items-center gap-1 text-caption font-mono text-accent hover:text-ink transition-colors"
        >
          <Icon name="tune" size="s" />
          Ajustar mis preferencias
        </button>
      </div>

      {/* Swap sheet */}
      {swapFor && (
        <Sheet
          open
          onClose={() => setSwapFor(null)}
          title="Elige una alternativa"
          size="m"
        >
          <div className="space-y-2 pt-2">
            {swapLoading ? (
              <p className="font-sans text-label text-ink-3 text-center py-6">Buscando alternativas que mantengan tus puntos…</p>
            ) : swapCandidates.length === 0 ? (
              <p className="font-sans text-label text-ink-3 text-center py-6">No hay alternativas disponibles ahora mismo para este hueco.</p>
            ) : (
              <>
                {/* La lista ya no son 5 sino todo lo que encaja (cientos en las
                    franjas grandes), así que hace falta poder buscar dentro. */}
                <input
                  type="search"
                  value={swapQuery}
                  onChange={e => setSwapQuery(e.target.value)}
                  placeholder="Buscar entre las alternativas…"
                  className="w-full px-3 py-2 bg-bg border border-hairline rounded-control font-sans text-body-s text-ink placeholder:text-ink-3 focus:border-accent/40 outline-none"
                />
                <p className="font-mono text-caption text-ink-3">
                  {swapExactas.length} cuadran con tus puntos
                  {swapAproximadas.length > 0 && ` · ${swapAproximadas.length} se acercan`}
                </p>

                {[
                  { titulo: 'Cuadran con tus puntos', lista: swapExactas },
                  { titulo: 'Se acercan (te dejan algo desajustado)', lista: swapAproximadas },
                ].map(({ titulo, lista }) => lista.length === 0 ? null : (
                  <div key={titulo} className="space-y-2">
                    <p className="font-sans text-caption text-ink-2 uppercase tracking-wider pt-2">{titulo}</p>
                    {lista.slice(0, swapVisible).map(c => (
                      <button
                        key={c.recipe.id}
                        onClick={() => confirmSwap(c)}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left bg-bg border border-hairline hover:border-accent/40 rounded-control transition-all"
                      >
                        <div className="w-10 h-10 rounded-surface overflow-hidden flex-shrink-0 bg-raised">
                          <FotoDeReceta src={fotoDeReceta(c.recipe)} alt="" className="w-full h-full object-cover" fallback={null} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-sans text-body-s text-ink truncate">{c.recipe.name}</p>
                          <p className="font-mono text-caption text-ink-2">
                            {fmtExch(c.exch)}
                            {c.fit === 'exacto' ? ' · mantiene tus puntos del día' : ` · ${describeDrift(c.drift)}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}

                {swapExactas.length + swapAproximadas.length > swapVisible * 2 && (
                  <button
                    onClick={() => setSwapVisible(v => v + SWAP_PAGE)}
                    className="w-full py-3 font-sans text-body-s text-accent hover:text-accent/80 transition-colors"
                  >
                    Ver más alternativas
                  </button>
                )}
              </>
            )}
          </div>
        </Sheet>
      )}

      {/* Elegir extras — catálogo = banco de intercambios entero */}
      {extrasFor && (() => {
        const extras = extrasDe(extrasFor.mealId);
        const actual = extrasFor.idx != null ? extras[extrasFor.idx] : null;
        const q = normalizeStr(extraQuery.trim());
        const catalogo = complementosDisponibles(foodList, dietMode, actual?.category)
          .filter(f => !q || normalizeStr(f.label).includes(q));

        function cambiarCantidad(delta: number) {
          if (extrasFor?.idx == null || !actual) return;
          const cantidad = Math.round((actual.quantity + delta) * 4) / 4;
          const siguiente = cantidad < 0.25
            ? extras.filter((_, i) => i !== extrasFor.idx)
            : extras.map((c, i) => i === extrasFor.idx ? { ...c, quantity: cantidad } : c);
          guardarExtras(extrasFor.mealId, siguiente);
          if (cantidad < 0.25) setExtrasFor(null);
        }

        function elegirAlimento(item: MealItem) {
          if (!extrasFor) return;
          const siguiente = extrasFor.idx != null
            ? extras.map((c, i) => i === extrasFor.idx ? { ...c, foodLabel: item.label, category: item.category } : c)
            : [...extras, { foodLabel: item.label, category: item.category, quantity: 1 }];
          guardarExtras(extrasFor.mealId, siguiente);
          setExtrasFor(null);
        }

        return (
          <Sheet
            open
            onClose={() => setExtrasFor(null)}
            title={actual ? 'Cambiar este extra' : 'Añadir un extra'}
            size="m"
          >
            <div className="space-y-3 pt-2">
              {actual && (
                <div className="flex items-center justify-between gap-3 p-3 bg-raised border border-hairline rounded-control">
                  <div className="min-w-0">
                    <p className="font-sans text-body-s text-ink truncate">{foodNameWithoutGrams(actual.foodLabel)}</p>
                    <p className="font-mono text-caption text-ink-2">{itemWeightLabel(actual.foodLabel, actual.quantity)}</p>
                  </div>
                  {/* Mismo patrón que el `Stepper` de MesocycleManager: el
                      carácter, no un <Icon>. Con el icono sobre `bg-bg` y sin
                      color explícito los dos botones salían casi invisibles
                      (comprobado en navegador a 375px). */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => cambiarCantidad(-0.25)}
                      className="w-11 h-11 rounded-control bg-raised text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center"
                      title="Menos cantidad"
                    >−</button>
                    <span className="font-mono text-body-s text-ink w-10 text-center">{actual.quantity}</span>
                    <button
                      onClick={() => cambiarCantidad(0.25)}
                      className="w-11 h-11 rounded-control bg-raised text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center"
                      title="Más cantidad"
                    >+</button>
                  </div>
                </div>
              )}

              {actual && (
                <button
                  onClick={() => {
                    guardarExtras(extrasFor!.mealId, extras.filter((_, i) => i !== extrasFor!.idx));
                    setExtrasFor(null);
                  }}
                  className="w-full py-2 font-sans text-body-s text-danger hover:text-danger/80 transition-colors"
                >
                  Quitar este extra
                </button>
              )}

              <div>
                <p className="font-mono text-caption text-ink-3 mb-2">
                  {actual
                    ? `Cámbialo por otro de ${CAT_LABEL[actual.category]} — mismos intercambios`
                    : 'Elige de tu banco de intercambios'}
                </p>
                <input
                  type="search"
                  value={extraQuery}
                  onChange={e => setExtraQuery(e.target.value)}
                  placeholder="Buscar (pan, fruta, arroz…)"
                  className="w-full px-3 py-2 bg-bg border border-hairline rounded-control font-sans text-body-s text-ink placeholder:text-ink-3 focus:border-accent/40 outline-none"
                />
              </div>

              <div className="space-y-1">
                {catalogo.length === 0 ? (
                  <p className="font-sans text-label text-ink-3 text-center py-6">Nada con ese nombre en tu banco.</p>
                ) : catalogo.slice(0, 60).map(item => (
                  <button
                    key={item.id}
                    onClick={() => elegirAlimento(item)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left bg-bg border border-hairline hover:border-accent/40 rounded-control transition-all"
                  >
                    <span className="font-sans text-body-s text-ink truncate">{item.label}</span>
                    <Badge tone="neutral">{CAT_LABEL[item.category]}</Badge>
                  </button>
                ))}
              </div>
            </div>
          </Sheet>
        );
      })()}

      {/* Recipe detail */}
      {detailOpen && (
        <Dialog
          open
          onClose={closeDetail}
          size="l"
          title={detailRecipe?.name ?? 'Receta'}
        >
          <div className="space-y-3">
            {detailLoading ? (
              <div className="flex items-center justify-center py-10">
                <Icon name="progress_activity" size="l" className="text-accent animate-spin" />
              </div>
            ) : detailRecipe ? (
              <>
                {fotoDeReceta(detailRecipe) && (
                  <div className="w-full aspect-[16/9] rounded-surface overflow-hidden bg-raised">
                    <FotoDeReceta src={fotoDeReceta(detailRecipe)} alt={detailRecipe.name} className="w-full h-full object-cover" fallback={null} />
                  </div>
                )}
                {detailRecipe.kcal != null && (
                  <p className="font-mono text-caption text-ink-2">{detailRecipe.kcal} kcal{detailRecipe.cookingTime != null ? ` · ${detailRecipe.cookingTime} min` : ''}</p>
                )}
                {(detailRecipe.ingredientsText?.length || detailRecipe.ingredients?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Ingredientes</p>
                    <ul className="">
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
                              <span className="text-label font-sans flex-1 pr-2">
                                {swappedTo ? (
                                  <>
                                    <span className="text-ink-2 line-through">{ing.label}</span>{' '}
                                    <span className="text-accent">→ {swappedTo}</span>
                                  </>
                                ) : (
                                  <span className="text-ink">{ing.label}</span>
                                )}
                              </span>
                              <span className="font-mono text-caption text-ink-2 shrink-0">{ing.qty}</span>
                              {subs.length > 0 && (
                                <button
                                  onClick={() => setSubForIngredient(open ? null : ing.label)}
                                  title="Cambiar por un alimento parecido"
                                  className="text-info hover:text-ink shrink-0"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>swap_horiz</span>
                                </button>
                              )}
                            </div>
                            {open && subs.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2 pb-1">
                                {swappedTo && (
                                  <button
                                    onClick={() => applySubstitution(ing.label, ing.label)}
                                    className="px-2 rounded-control bg-raised border border-hairline text-ink-2 font-mono text-caption hover:text-ink"
                                  >↩ original</button>
                                )}
                                {subs.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => applySubstitution(ing.label, s)}
                                    className="px-2 rounded-control bg-raised border border-hairline text-ink font-mono text-caption hover:border-accent/50 hover:text-accent"
                                  >{s}</button>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {detailMealId && (
                      <p className="font-sans text-caption text-ink-3 mt-2">Cambia un ingrediente por otro parecido si no lo tienes o no te gusta.</p>
                    )}
                  </div>
                ) : null}
                {(detailRecipe.stepsText?.length || detailRecipe.steps?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Preparación</p>
                    <ol className="space-y-2 list-decimal list-inside">
                      {(detailRecipe.stepsText?.length
                        ? detailRecipe.stepsText.map(s => s.description)
                        : detailRecipe.steps ?? []
                      ).map((text, idx) => (
                        <li key={idx} className="text-label text-ink-2 font-sans leading-relaxed">{text}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="font-sans text-label text-ink-3 text-center py-6">No se pudo cargar la receta.</p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
