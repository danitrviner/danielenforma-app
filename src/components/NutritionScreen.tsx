import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Diet, DietMeal, DietItem, FoodCategory, DietMode, MealItem, Recipe, RecipeFavorites, WeekDay } from '../types';
import { getDietsForAthlete, getAthleteDietConfig, saveAthleteDietConfig, createDiet, updateDiet, deleteDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, saveAthleteNutritionConfig, getRecipes, getRecipeFavorites, getNutritionProgram, markNutritionPhaseSeen, computeActivePhase, createNotificationDeduped, getDietCompletionLog, saveDietCompletionLog, createRecipe, queryRecetas, queryRecetasForGenerator, getOnboarding, getRecipeById } from '../dbService';
import type { RecetasCursor } from '../dbService';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_COLOR, CAT_BG, MODE_LABEL, ALL_DIET_MODES, round2, fmtQty, itemWeightLabel, addToPlaced, recipeToDietItems, isDietPending, computeDietPlaced } from '../utils/exchangeHelpers';
import { findRecipeAlternatives, recipeExchanges, groupByDishType, type RecipeAlternative, type AlternativePrefs } from '../utils/recipeMatch';
import { ingredientMatch, violatesDietType } from '../utils/foodPrefs';
import { dishType, dishTypeLabel, type DishType } from '../utils/dishTypes';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import { haptics } from '../services/haptics';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import { Skeleton } from './ui';
import { EmptyState, Sheet, Icon, Button, ProgressBar, RingSeal, Stepper, Dialog, ListRow } from './ui';

import {
  COACH_EMAIL, makeId, blankDiet, dietSnapshot,
  TODAY_WD, TODAY_DATE, WD_ORDER, WD_SHORT, WD_FULL,
  mealLabel, BAR_LABEL, CHIP_LABEL, ItemState,
} from './nutrition/dietHelpers';

// ── Types ──────────────────────────────────────────────────────────────────────
// (ItemState viene de dietHelpers.ts — compartido con el resto de "Mi plan")

// Mismas categorías fijas que RecipesScreen.tsx/RecipeBuilderScreen.tsx — el
// catálogo `queryRecetas` filtra por `categoria`, no hay forma de listarlas
// dinámicamente sin traerse la colección entera, así que cada sitio que
// navega el recetario mantiene su propia copia de esta lista corta.
const RECETAS_CATS = [
  'Todas',
  'Platos salados / principales',
  'Desayuno y dulces',
  'Bebidas',
  'Suplementos deportivos',
];

interface Props {
  profile: UserProfile;
  pendingRecipe?: Recipe | null;
  onConsumedPendingRecipe?: () => void;
}

// Fila del picker de recetas — compartida entre "Mis recetas" (propias/coach)
// y "Recetario" (catálogo), antes duplicada entera en el JSX de cada una.
// Fila de una alternativa en "Cambiar comida". A diferencia de RecipePickerRow,
// esta muestra los INTERCAMBIOS —que es lo que tiene que cuadrar— y avisa cuando
// el total no es idéntico, en vez de enseñar solo las kcal sin contexto.
function SwapCandidateRow({ alt, isFav, onSelect }: {
  alt: RecipeAlternative; isFav: boolean; onSelect: (r: Recipe) => void;
  key?: React.Key;
}) {
  const { recipe, exchanges, totalDrift } = alt;
  const total = exchanges.HC + exchanges.PROT + exchanges.GRASA;
  const photo = recipe.photoUrl ?? recipe.image;
  return (
    <button
      onClick={() => onSelect(recipe)}
      className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
    >
      {photo ? (
        <img src={photo} alt="" className="w-12 h-12 rounded-surface object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
          <Icon name="skillet" size="m" className="text-ink-2" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="font-sans font-bold text-body-s text-ink group-hover:text-accent transition-colors truncate block">
          {isFav && <Icon name="favorite" size="s" className="text-accent mr-1 align-middle" />}
          {recipe.name}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-caption text-accent/70">{fmtQty(total)} int.</span>
          <span className="font-mono text-caption text-ink-2">
            {fmtQty(exchanges.HC)} HC · {fmtQty(exchanges.PROT)} P · {fmtQty(exchanges.GRASA)} G
          </span>
          {/* Honestidad: si el total no es exacto se dice, no se esconde. */}
          {totalDrift > 0.001 && (
            <span className="font-mono text-caption text-ink-2 italic">
              ({totalDrift > 0 ? '±' : ''}{fmtQty(totalDrift)})
            </span>
          )}
          <span className="font-sans text-caption text-ink-2">· {dishTypeLabel(alt.dishType)}</span>
        </div>
      </div>
      <Icon name="swap_horiz" size="s" className="text-ink-2 group-hover:text-accent transition-colors flex-shrink-0" />
    </button>
  );
}

function RecipePickerRow({ recipe, isFav, enabledModes, onSelect }: {
  recipe: Recipe; isFav: boolean; enabledModes: DietMode[]; onSelect: (r: Recipe) => void;
  // El repo no tiene `@types/react`, así que TS no excluye `key` de las props
  // por su cuenta — mismo workaround que `Badge.tsx`.
  key?: React.Key;
}) {
  const exchParts: string[] = [];
  const totals: Partial<Record<FoodCategory, number>> = {};
  recipe.ingredients
    .filter(ing => enabledModes.includes(ing.mode))
    .forEach(ing => { totals[ing.category] = (totals[ing.category] ?? 0) + ing.quantity; });
  (['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'] as FoodCategory[])
    .filter(c => (totals[c] ?? 0) > 0)
    .forEach(c => exchParts.push(`${totals[c]} ${c.replace('_', ' ')}`));
  const exchStr = exchParts.join(' · ') || '—';

  return (
    <button
      onClick={() => onSelect(recipe)}
      className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
    >
      {recipe.photoUrl ? (
        <img src={recipe.photoUrl} alt={recipe.name} className="w-12 h-12 rounded-surface object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-ink-2 text-title-m">skillet</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 ">
          {isFav && (
            <span className="material-symbols-outlined text-accent text-label" style={{ fontVariationSettings: "'FILL' 1", fontSize: '12px' }}>favorite</span>
          )}
          <span className="font-sans font-bold text-body-s text-ink group-hover:text-accent transition-colors truncate">{recipe.name}</span>
        </div>
        {recipe.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {recipe.categories.slice(0, 3).map(c => (
              <span key={c} className="px-2 rounded-control bg-raised font-mono text-caption text-ink-2 uppercase">{c}</span>
            ))}
          </div>
        )}
        <span className="font-mono text-caption text-accent/70">{exchStr}</span>
      </div>
      <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NutritionScreen({ profile, pendingRecipe, onConsumedPendingRecipe }: Props) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const tutorial = useTutorialEngine();

  // Referencias estables para el registro de objetivos del tour — una función
  // inline nueva en cada render provoca un bucle de "Maximum update depth
  // exceeded" (ver TourTargetContext.tsx).
  const trackerTargetRef = useTourTarget('nutrition-tracker');
  const firstMealRowTargetRef = useTourTarget('nutrition-first-meal-row');

  // ── Queries: Phase 1 (diet/config) ──────────────────────────────────────────
  const dietsKey = ['dietsForAthlete', profile.email] as const;
  const { data: allDietsList = [], isPending: loadingDiets } = useQuery({
    queryKey: dietsKey,
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const setAllDietsList = (updater: React.SetStateAction<Diet[]>) =>
    queryClient.setQueryData<Diet[]>(dietsKey, prev =>
      typeof updater === 'function' ? (updater as (p: Diet[]) => Diet[])(prev ?? []) : updater);

  const athleteDietConfigKey = ['athleteDietConfig', profile.email] as const;
  const { data: dietConfigRaw = null, isPending: loadingDietConfig } = useQuery({
    queryKey: athleteDietConfigKey,
    queryFn: () => getAthleteDietConfig(profile.email).catch(() => null),
  });

  const { data: nutConfig = null, isPending: loadingNutConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', profile.email],
    queryFn: () => getAthleteNutritionConfig(profile.email).catch(() => null),
  });

  const { data: program = null, isPending: loadingProgram } = useQuery({
    queryKey: ['nutritionProgram', profile.email],
    queryFn: () => getNutritionProgram(profile.email).catch(() => null),
  });

  const loadingPhase1 = loadingDiets || loadingDietConfig || loadingNutConfig || loadingProgram;

  // ── Queries: Phase 2 (food library + recipes) ───────────────────────────────
  // Deliberately gated on Phase 1 (enabled: !loadingPhase1) — same reason the
  // original sequential load kept them apart: seedFoodItemsIfEmpty() flips a
  // global "local bypass" flag on Firestore failure, which would poison ANY
  // dbService call still in flight. Phase 1's diet/config reads must be fully
  // secured first.
  const { data: foodItems = [], isPending: loadingFoodItems } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => seedFoodItemsIfEmpty().catch(() => {}).then(getFoodItems),
    enabled: !loadingPhase1,
  });
  const { data: recipes = [], isPending: loadingRecipesQ } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes().catch(() => [] as Recipe[]),
    enabled: !loadingPhase1,
  });
  const setRecipes = (updater: React.SetStateAction<Recipe[]>) =>
    queryClient.setQueryData<Recipe[]>(['recipes'], prev =>
      typeof updater === 'function' ? (updater as (p: Recipe[]) => Recipe[])(prev ?? []) : updater);

  const { data: recipeFavorites = { athleteId: profile.email, recipeIds: [] }, isPending: loadingFavs } = useQuery({
    queryKey: ['recipeFavorites', profile.email],
    queryFn: () => getRecipeFavorites(profile.email).catch(() => ({ athleteId: profile.email, recipeIds: [] } as RecipeFavorites)),
    enabled: !loadingPhase1,
  });

  // Anamnesis del atleta: alergias, intolerancias, tipo de dieta y comidas que
  // no le gustan. "Cambiar comida" no leía NADA de esto y podía ofrecer una
  // receta con un alérgeno; ahora filtra igual que el generador de menús.
  const { data: onboarding = null } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email).catch(() => null),
    enabled: !loadingPhase1,
  });

  const loading = loadingPhase1 || loadingFoodItems || loadingRecipesQ || loadingFavs;

  // ── Local editor/draft state — seeded once from the queries above, then
  // mutated locally as the athlete edits (this is a live editor, not a
  // read-only view, so it can't just be the query data directly) ───────────
  const [selectedDiet, setSelectedDiet] = useState<Diet | null>(null);
  const [savedDietSnapshot, setSavedDietSnapshot] = useState('');
  const [saving, setSaving] = useState(false);
  // "Mis dietas" — gestión de las dietas del atleta (crear/duplicar/borrar),
  // absorbida aquí en la fusión de Intercambios + Mis Dietas ("Mi plan").
  const [misDietasOpen, setMisDietasOpen] = useState(false);

  // Per-item state (ephemeral, day-only)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  const [enabledModes, setEnabledModes] = useState<DietMode[]>(['OMNIVORO']);
  const [activeDietMode, setActiveDietMode] = useState<DietMode>('OMNIVORO');

  // Food picker — itemIdx null means "add a new item", a number means "swap that item"
  const [pickerItem, setPickerItem] = useState<{ mealId: string; itemIdx: number | null; category: FoodCategory } | null>(null);
  const [pickerCategory, setPickerCategory] = useState<FoodCategory>('HC');
  const [searchTerm, setSearchTerm] = useState('');
  // T13 (18-08): mismo tick + ×N que el selector del coach, para la rama de
  // "añadir" (itemIdx === null) — "cambiar" sigue siendo una sustitución
  // única que cierra al terminar, no hace falta contador ahí.
  const [pickerAddedCounts, setPickerAddedCounts] = useState<Record<string, number>>({});
  const [pickerRecentlyAdded, setPickerRecentlyAdded] = useState<string | null>(null);
  const pickerRecentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recipe picker
  const [recipePickerMealId, setRecipePickerMealId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch]             = useState('');
  const [recipeCatFilter, setRecipeCatFilter]       = useState<string>('all');
  // Dos fuentes en el mismo picker (a petición de Dani): "Mis recetas" (propias
  // + del coach, via getRecipes — lo que ya había) y "Recetario" (el catálogo
  // de ~8.850, paginado con queryRecetas — antes solo estaba en la pestaña
  // Recetas, no accesible desde aquí al elegir qué comer en una comida).
  const [recipeSource, setRecipeSource]             = useState<'mias' | 'recetario'>('mias');
  const [recetarioCat, setRecetarioCat]             = useState<string>('Todas');
  const [recetarioResults, setRecetarioResults]     = useState<Recipe[]>([]);
  const [recetarioCursor, setRecetarioCursor]       = useState<RecetasCursor | null>(null);
  const [recetarioHasMore, setRecetarioHasMore]     = useState(false);
  const [recetarioLoading, setRecetarioLoading]     = useState(false);
  const [recetarioLoadingMore, setRecetarioLoadingMore] = useState(false);
  // Tracks how many items each meal had originally (before any recipe was applied)
  const [origItemCounts, setOrigItemCounts]         = useState<Record<string, number>>({});

  /* Ver la receta que hay dentro de una comida del plan.
     Cambiarla ya se podía —y cambiar alimentos sueltos también—, pero la única
     puerta era un icono de sartén sin texto, con la explicación en un `title`
     que en un móvil no se ve nunca: en la práctica nadie llegaba. Ahora la
     receta se abre como en Mi menú (foto, ingredientes, pasos) y desde dentro
     se cambia, que es donde uno la busca después de leerla. */
  const [recetaAbierta, setRecetaAbierta] = useState<{ mealId: string; recipeId: string } | null>(null);
  const [recetaDetalle, setRecetaDetalle] = useState<Recipe | null>(null);
  const [cargandoReceta, setCargandoReceta] = useState(false);

  // Recipe swap ("Cambiar comida")
  const [swapContext, setSwapContext] = useState<{ mealId: string; recipeId: string; slot?: number } | null>(null);
  const [swapSourceRecipe, setSwapSourceRecipe] = useState<Recipe | null>(null);
  // El pool se carga al abrir la hoja, no de antemano: son hasta 300 recetas del
  // recetario y no tiene sentido bajarlas mientras el atleta solo mira su plan.
  const [swapPool, setSwapPool] = useState<Recipe[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapDishFilter, setSwapDishFilter] = useState<DishType | null>(null);
  const [swapSearch, setSwapSearch] = useState('');

  // "Guardar como receta" — turns a meal built here into a reusable Recipe,
  // which then feeds both the manual recipe picker and the weekly-menu generator.
  const [savingMealAsRecipeId, setSavingMealAsRecipeId] = useState<string | null>(null);
  const [recipeNameDraft, setRecipeNameDraft] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);

  // "Añadir a Intercambios" desde Recetas — primero elegir a qué dieta, luego (si
  // tiene varias comidas) a cuál comida
  const [chooseDietForRecipe, setChooseDietForRecipe] = useState<Recipe | null>(null);
  const [chooseMealForRecipe, setChooseMealForRecipe] = useState<Recipe | null>(null);

  // Weekly schedule
  const [weeklySchedule, setWeeklySchedule] = useState<Partial<Record<WeekDay, string | null>>>({});
  const [viewDay, setViewDay]               = useState<WeekDay>(TODAY_WD);

  // Nutrition periodization
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);

  // Pantalla de reparto (a petición de Dani) — un único botón "Editar reparto
  // por comida" abre esta pantalla con el reparto de TODAS las comidas a la
  // vez, en vez de steppers sueltos en cada tarjeta. Sustituye a la antigua
  // "hoja de ajuste" (registro rápido por macros), que se ha quitado.
  const [repartoSheetOpen, setRepartoSheetOpen] = useState(false);

  // ── One-time init once Phase 1 has loaded ───────────────────────────────────
  // Applies the active nutrition-program phase (writes + notifications), then
  // picks the diet to show by default and seeds the local editor state from
  // it. Runs once per athlete when Phase 1 settles, not on every background
  // refetch — same ref-guard pattern as StepsWidget/AthleteRoadmapScreen.
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadingPhase1 || initFor.current === profile.email) return;
    initFor.current = profile.email;

    (async () => {
      if (nutConfig && nutConfig.enabledModes?.length > 0) {
        setEnabledModes(nutConfig.enabledModes);
        setActiveDietMode(nutConfig.enabledModes[0]);
      }

      // Apply nutrition program phase if active
      let dietConfig = dietConfigRaw;
      if (program && program.phases.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const activePhase = computeActivePhase(program, todayStr);
        if (activePhase && activePhase.dietId) {
          const currentActive = new Set(dietConfig?.activeDietIds ?? []);
          if (!currentActive.has(activePhase.dietId) || currentActive.size !== 1) {
            const newConfig = {
              ...(dietConfig ?? { athleteId: profile.email }),
              activeDietIds: [activePhase.dietId],
            };
            await saveAthleteDietConfig(newConfig).catch(() => {});
            dietConfig = newConfig;
            queryClient.setQueryData(athleteDietConfigKey, newConfig);
          }
          if (program.lastSeenPhaseId !== activePhase.id) {
            setPhaseBanner(`Tu plan de nutrición cambió a: ${activePhase.name}`);
            // Merge parcial: reescribir el programa entero desde este snapshot
            // podía pisar ediciones concurrentes del coach en la periodización.
            await markNutritionPhaseSeen(profile.email, activePhase.id).catch(() => {});
            const phaseKey = `notif_np_${profile.email}_${activePhase.id}`;
            const phaseBody = `Plan de nutrición cambió a: ${activePhase.name}`;
            createNotificationDeduped(`${phaseKey}_athlete`, {
              recipientEmail: profile.email,
              type: 'nutrition_phase_change',
              title: 'Plan de nutrición actualizado',
              body: phaseBody,
              link: 'nutrition',
              createdAt: new Date().toISOString(),
              read: false,
            }).catch(console.error);
            createNotificationDeduped(`${phaseKey}_coach`, {
              recipientEmail: COACH_EMAIL,
              type: 'nutrition_phase_change',
              title: `Fase de nutrición cambiada (${profile.displayName})`,
              body: `${profile.displayName}: ${phaseBody}`,
              link: 'clients',
              createdAt: new Date().toISOString(),
              read: false,
            }).catch(console.error);
          }
        }
      }

      const activeIds = new Set(dietConfig?.activeDietIds ?? []);
      const active = allDietsList.filter(d => activeIds.has(d.id));
      const schedule = dietConfig?.weeklySchedule ?? {};
      setWeeklySchedule(schedule);

      const rememberedId = localStorage.getItem(`enforma_intercambios_diet_${profile.email}`);
      const todayId = schedule[TODAY_WD] ?? null;
      const initDiet: Diet | null =
        (todayId && allDietsList.find(d => d.id === todayId)) ||
        (rememberedId && allDietsList.find(d => d.id === rememberedId)) ||
        (active.length >= 1 ? active[0] : null) ||
        (allDietsList.length >= 1 ? allDietsList[0] : null);
      if (initDiet) {
        setSelectedDiet(initDiet);
        setSavedDietSnapshot(dietSnapshot(initDiet));
        const counts: Record<string, number> = {};
        initDiet.meals.forEach(m => { counts[m.id] = m.items.length; });
        setOrigItemCounts(counts);
      }
    })().catch(err => console.error('NutritionScreen init error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPhase1, profile.email]);

  // ── Init item states when diet changes ──────────────────────────────────────
  // Rebuilds the (done:false) shape synchronously, then merges in today's
  // persisted completion log so consumido/restante survives reloads.

  useEffect(() => {
    if (!selectedDiet) { setItemStates({}); return; }
    const initial: Record<string, ItemState> = {};
    for (const meal of selectedDiet.meals) {
      meal.items.forEach((item, idx) => {
        initial[`${meal.id}_${idx}`] = { foodLabel: item.foodLabel, done: false };
      });
    }
    setItemStates(initial);

    let cancelled = false;
    const dietId = selectedDiet.id;
    getDietCompletionLog(profile.email, TODAY_DATE).then(log => {
      if (cancelled || !log || log.dietId !== dietId) return;
      const doneSet = new Set(log.doneItemIds);
      setItemStates(prev => {
        const next = { ...prev };
        doneSet.forEach(key => {
          if (next[key]) next[key] = { ...next[key], done: true };
        });
        return next;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDiet?.id, profile.email]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const { doneByCat, mealDoneByCat, totalItems, doneItems } = useMemo(() => {
    const doneByCat: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    const mealDoneByCat: Record<string, Record<FoodCategory, number>> = {};
    let total = 0;
    let done = 0;
    if (selectedDiet) {
      for (const meal of selectedDiet.meals) {
        const mealBycat: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
        meal.items.forEach((item, idx) => {
          total++;
          const st = itemStates[`${meal.id}_${idx}`];
          if (st?.done) {
            done++;
            addToPlaced(doneByCat, item.category, item.quantity);
            addToPlaced(mealBycat,  item.category, item.quantity);
          }
        });
        mealDoneByCat[meal.id] = mealBycat;
      }
    }
    return { doneByCat, mealDoneByCat, totalItems: total, doneItems: done };
  }, [selectedDiet, itemStates]);

  // Suma del reparto por comida (`meal.target`) frente al cupo diario total
  // (`selectedDiet.budget`) — mismo cálculo que `targetMismatches` del lado
  // coach (NutritionPlansScreen.tsx), portado aquí para avisar al atleta si
  // lo que ha repartido entre comidas no cuadra con el total del día.
  const mealTargetSumByCat = useMemo(() => {
    const sum: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    for (const meal of selectedDiet?.meals ?? []) {
      for (const cat of BUDGET_CATS) sum[cat] = round2(sum[cat] + (meal.target?.[cat] ?? 0));
    }
    return sum;
  }, [selectedDiet]);

  // "TE QUEDAN" del tracker — suma de las tres categorías de presupuesto,
  // igual que el handoff (nunca desglosa MIX_HC/MIX_GRASA en la cifra grande).
  const leftByCat = {
    HC: (selectedDiet?.budget.HC ?? 0) - doneByCat.HC,
    PROT: (selectedDiet?.budget.PROT ?? 0) - doneByCat.PROT,
    GRASA: (selectedDiet?.budget.GRASA ?? 0) - doneByCat.GRASA,
  };
  const totalBudget = BUDGET_CATS.reduce((s, c) => s + (selectedDiet?.budget[c] ?? 0), 0);
  const totalEaten = BUDGET_CATS.reduce((s, c) => s + doneByCat[c], 0);
  const leftExch = round2(totalBudget - totalEaten);
  const leftKcal = Math.round(exchangeToKcal(leftByCat)); // puede ser negativo si el día se pasa
  const dayClosed = totalItems > 0 && doneItems === totalItems;

  // Haptic success solo en la TRANSICIÓN a día cerrado (handoff, panel 06) —
  // no en cada render mientras ya está cerrado, ni al reabrirlo desmarcando algo.
  const dayClosedRef = useRef(false);
  useEffect(() => {
    if (dayClosed && !dayClosedRef.current) void haptics.success();
    dayClosedRef.current = dayClosed;
  }, [dayClosed]);

  // Distinct coach diets scheduled across the week (the "día A/B/C" concept) that
  // still don't have enough food items placed to cover the budget the coach set.
  const pendingScheduledDiets = useMemo(() => {
    const scheduledIds = new Set(
      WD_ORDER.map(d => weeklySchedule[d]).filter((id): id is string => typeof id === 'string'),
    );
    return allDietsList.filter(d => scheduledIds.has(d.id) && !d.selfManaged && isDietPending(d));
  }, [weeklySchedule, allDietsList]);

  // While buscando, ignora la pestaña de categoría activa y busca en todas — así
  // el atleta no tiene que salir y volver a entrar cambiando de categoría para
  // encontrar un alimento que no sabía en qué grupo estaba.
  const isSearchingFoods = searchTerm.trim().length > 0;
  const filteredFoods = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return foodItems.filter(f =>
      f.mode === activeDietMode &&
      (term ? f.label.toLowerCase().includes(term) : f.category === pickerCategory)
    );
  }, [foodItems, activeDietMode, pickerCategory, searchTerm]);

  const availableRecipeCats = useMemo(() => {
    const s = new Set<string>();
    recipes.forEach(r => r.categories.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }, [recipes]);

  // Restricciones del atleta que CUALQUIER lista de recetas mostrada aquí debe
  // respetar. Las alergias y el tipo de dieta son filtros DUROS — antes solo
  // los aplicaba "Cambiar comida"; el resto de listas (este picker, el
  // recetario) no miraban nada de esto.
  const swapPrefs: AlternativePrefs = useMemo(() => ({
    allergies:         onboarding?.allergies ?? [],
    dislikedFoods:     onboarding?.dislikedFoods ?? [],
    likedFoods:        onboarding?.likedFoods ?? [],
    // Igual que los tipos de plato de abajo: manda lo corregido en el perfil.
    dietType:          nutConfig?.dietType ?? onboarding?.dietType,
    cookingMaxTime:    nutConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime,
    favoriteRecipeIds: recipeFavorites.recipeIds,
    dislikedRecipeIds: recipeFavorites.dislikedIds ?? [],
    preferredDishTypes: (nutConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as DishType[],
    excludedDishTypes:  (nutConfig?.excludedDishTypes  ?? onboarding?.excludedDishTypes  ?? []) as DishType[],
  }), [onboarding, nutConfig, recipeFavorites]);

  // Un tipo de plato excluido es una decisión explícita del atleta en sus
  // preferencias, igual de firme que una alergia: faltaba aquí, así que los
  // buscadores de esta pantalla seguían ofreciéndole justo lo que había
  // marcado que no quería ver.
  const isSafeForAthlete = useCallback((r: Recipe) =>
    !swapPrefs.allergies!.some(f => ingredientMatch(r, f)) &&
    !swapPrefs.dislikedRecipeIds!.includes(r.id) &&
    !(swapPrefs.excludedDishTypes ?? []).includes(dishType(r)) &&
    !violatesDietType(r, swapPrefs.dietType), [swapPrefs]);

  /** Lo que el atleta ha pedido, primero: sus favoritas y después los tipos de
   *  plato que marcó querer más. Dentro de cada grupo, por nombre. */
  const ordenarPorPreferencia = useCallback((lista: Recipe[]) => {
    const preferidos = new Set(swapPrefs.preferredDishTypes ?? []);
    const rango = (r: Recipe) =>
      recipeFavorites.recipeIds.includes(r.id) ? 0 : preferidos.has(dishType(r)) ? 1 : 2;
    return [...lista].sort((a, b) => rango(a) - rango(b) || a.name.localeCompare(b.name));
  }, [swapPrefs, recipeFavorites]);

  const sortedPickerRecipes = useMemo(() => {
    const withIngredients = recipes.filter(r =>
      r.ingredients.some(ing => enabledModes.includes(ing.mode))
    );
    const filtered = withIngredients.filter(r => {
      const matchCat = recipeCatFilter === 'all' || r.categories.includes(recipeCatFilter);
      const matchSearch = !recipeSearch || r.name.toLowerCase().includes(recipeSearch.toLowerCase());
      return matchCat && matchSearch && isSafeForAthlete(r);
    });
    return ordenarPorPreferencia(filtered);
  }, [recipes, enabledModes, recipeCatFilter, recipeSearch, isSafeForAthlete, ordenarPorPreferencia]);

  // Recetario (catálogo ~8.850) — queryRecetas solo filtra por categoría en el
  // servidor (no hay búsqueda de texto ahí), así que el término de búsqueda se
  // aplica en cliente sobre lo ya cargado, igual que hace RecipeBuilderScreen.
  //
  // ANTES filtraba por `r.ingredients.some(...)`, pero el recetario importado
  // SIEMPRE tiene `ingredients: []` (el importador lo deja vacío a propósito,
  // ver mapRecipe en importRecetas.mjs) — así que ese `.some()` era siempre
  // `false` y esta pestaña no mostraba NUNCA ninguna receta del catálogo, para
  // nadie. Bug de disponibilidad puro, no de preferencias, pero apareció al
  // auditar esta pantalla para que respete alergias en todos los apartados.
  const sortedRecetarioResults = useMemo(() => {
    const safe = recetarioResults.filter(isSafeForAthlete);
    const buscadas = recipeSearch
      ? safe.filter(r => r.name.toLowerCase().includes(recipeSearch.toLowerCase()))
      : safe;
    // Antes salía en el orden del catálogo (alfabético): las favoritas del
    // atleta quedaban donde cayeran, y los tipos de plato que había pedido
    // tener más no se adelantaban.
    return ordenarPorPreferencia(buscadas);
  }, [recetarioResults, recipeSearch, isSafeForAthlete, ordenarPorPreferencia]);

  const swapCandidates = useMemo(() => {
    if (!swapSourceRecipe || swapPool.length === 0) return [];
    return findRecipeAlternatives(swapSourceRecipe, swapPool, {
      prefs: swapPrefs,
      intakeType: swapContext?.slot,
      search: swapSearch.trim() || undefined,
      limit: 40,
    });
  }, [swapSourceRecipe, swapPool, swapPrefs, swapContext?.slot, swapSearch]);

  // Pestañas de tipo de plato: el atleta que no quiere otro batido necesita ver
  // de un vistazo qué otras familias hay disponibles, no rebuscar en la lista.
  const swapDishTypes = useMemo(() => groupByDishType(swapCandidates), [swapCandidates]);
  const visibleSwapCandidates = useMemo(
    () => swapDishFilter ? swapCandidates.filter(c => c.dishType === swapDishFilter) : swapCandidates,
    [swapCandidates, swapDishFilter],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const isDirty = selectedDiet ? dietSnapshot(selectedDiet) !== savedDietSnapshot : false;
  const isPersisted = selectedDiet ? allDietsList.some(d => d.id === selectedDiet.id) : true;

  const handleSelectDiet = (dt: Diet, opts?: { skipDirtyCheck?: boolean }) => {
    if (!opts?.skipDirtyCheck && isDirty && !window.confirm('Tienes cambios sin guardar en este menú. ¿Cambiar de dieta y descartarlos?')) {
      return;
    }
    // Build itemStates for the new diet immediately in the same event handler so
    // React batches both updates into one render. Relying only on a useEffect meant
    // the content rendered once with the new selectedDiet but stale itemStates.
    const initial: Record<string, ItemState> = {};
    const counts: Record<string, number> = {};
    for (const meal of dt.meals) {
      counts[meal.id] = meal.items.length;
      meal.items.forEach((item, idx) => {
        initial[`${meal.id}_${idx}`] = { foodLabel: item.foodLabel, done: false };
      });
    }
    setItemStates(initial);
    setOrigItemCounts(counts);
    setSelectedDiet(dt);
    setSavedDietSnapshot(dietSnapshot(dt));
    localStorage.setItem(`enforma_intercambios_diet_${profile.email}`, dt.id);
  };

  const handleStartBlank = () => {
    handleSelectDiet(blankDiet(profile.email));
  };

  // ── "Mis dietas": crear/duplicar/borrar (absorbido de la antigua pestaña
  // Mis Dietas en la fusión Intercambios + Mis Dietas → "Mi plan") ──────────

  const handleStartBlankFromSheet = () => {
    // Nombre vacío a propósito (a diferencia de handleStartBlank, que pone
    // "Mi menú") — al crearla desde el gestor, el atleta espera ponerle
    // nombre él mismo, como en la antigua pantalla "Nueva dieta".
    handleSelectDiet(blankDiet(profile.email, ''), { skipDirtyCheck: true });
    setMisDietasOpen(false);
  };

  const handleDuplicateDiet = async (dt: Diet) => {
    try {
      const created = await createDiet({
        athleteId: profile.email,
        name: `${dt.name} (copia)`,
        budget: dt.budget,
        meals: dt.meals.map(m => ({ ...m, id: makeId() })),
        selfManaged: true,
      });
      setAllDietsList(prev => [...prev, created]);
      handleSelectDiet(created, { skipDirtyCheck: true });
      setMisDietasOpen(false);
      showToast('Copia creada.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo duplicar la dieta.');
    }
  };

  // "Guardar como menú" — plantilla de un día completo para repetir más
  // adelante. A diferencia de handleDuplicateDiet, NO cambia la dieta activa
  // (el atleta se queda donde estaba); solo deja una copia marcada
  // `menuTemplate` disponible en "Mis dietas" → "Tus menús guardados".
  const [savingMenu, setSavingMenu] = useState(false);
  const handleSaveAsMenu = async () => {
    if (!selectedDiet) return;
    setSavingMenu(true);
    try {
      const created = await createDiet({
        athleteId: profile.email,
        name: `${selectedDiet.name || 'Mi menú'} (menú guardado)`,
        budget: selectedDiet.budget,
        meals: selectedDiet.meals.map(m => ({ ...m, id: makeId() })),
        selfManaged: true,
        menuTemplate: true,
      });
      setAllDietsList(prev => [...prev, created]);
      showToast('Menú guardado — podrás repetirlo desde «Mis dietas».', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el menú.');
    } finally {
      setSavingMenu(false);
    }
  };

  const [dietPendingDelete, setDietPendingDelete] = useState<Diet | null>(null);
  const [deletingDiet, setDeletingDiet] = useState(false);

  const confirmDeleteDiet = async () => {
    const dt = dietPendingDelete;
    if (!dt) return;
    setDeletingDiet(true);
    try {
      await deleteDiet(dt.id);
      setAllDietsList(prev => prev.filter(d => d.id !== dt.id));

      // deleteDiet() no limpia las referencias a esta dieta en la config del
      // atleta — sin esto, "activeDietIds"/"weeklySchedule" seguirían
      // apuntando a un id que ya no existe.
      const activeIds = dietConfigRaw?.activeDietIds ?? [];
      const schedule: Partial<Record<WeekDay, string | null>> = { ...(dietConfigRaw?.weeklySchedule ?? {}) };
      const hadActiveRef = activeIds.includes(dt.id);
      let hadScheduleRef = false;
      WD_ORDER.forEach(day => { if (schedule[day] === dt.id) { schedule[day] = null; hadScheduleRef = true; } });
      if (hadActiveRef || hadScheduleRef) {
        const nextConfig = {
          ...(dietConfigRaw ?? { athleteId: profile.email }),
          activeDietIds: activeIds.filter(id => id !== dt.id),
          weeklySchedule: schedule,
        };
        await saveAthleteDietConfig(nextConfig).catch(() => {});
        queryClient.setQueryData(athleteDietConfigKey, nextConfig);
        setWeeklySchedule(schedule);
      }

      if (selectedDiet?.id === dt.id) {
        const fallback = allDietsList.find(d => d.id !== dt.id) ?? null;
        if (fallback) handleSelectDiet(fallback, { skipDirtyCheck: true });
        else { setSelectedDiet(null); setSavedDietSnapshot(''); }
      }
      showToast('Dieta eliminada.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo eliminar la dieta.');
    } finally {
      setDeletingDiet(false);
      setDietPendingDelete(null);
    }
  };

  // Unifica el guardado del registro de "hecho" del día — antes cada sitio
  // que lo llamaba (checkbox de un alimento, comida entera, ajuste rápido,
  // primer guardado, cambio de comida) fallaba en silencio con
  // `.catch(() => {})`: el atleta marcaba algo y, si no había red, nunca se
  // enteraba de que no se había guardado nada.
  const persistCompletion = (dietId: string, doneItemIds: string[]) => {
    saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId, doneItemIds })
      .catch(() => showToast('No se pudo guardar el registro de hoy. Se reintentará al recargar.', 'error'));
  };

  const handleToggleDone = (mealId: string, itemIdx: number) => {
    const key = `${mealId}_${itemIdx}`;
    setItemStates(prev => {
      const cur = prev[key];
      if (!cur) return prev;
      const next = { ...prev, [key]: { ...cur, done: !cur.done } };
      if (selectedDiet) {
        const doneItemIds = (Object.entries(next) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
        persistCompletion(selectedDiet.id, doneItemIds);
      }
      return next;
    });
  };

  // Registrar/desregistrar una ingesta entera de un toque (handoff, panel 01):
  // marca (o desmarca) todos sus alimentos a la vez en vez de uno a uno.
  const handleToggleMealDone = (meal: DietMeal) => {
    const allDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
    const nextDone = !allDone;
    void haptics.light();
    if (nextDone) tutorial.markActionDone('registrar-ingesta');
    setItemStates(prev => {
      const next = { ...prev };
      meal.items.forEach((_, idx) => {
        const key = `${meal.id}_${idx}`;
        const cur = next[key];
        if (cur) next[key] = { ...cur, done: nextDone };
      });
      if (selectedDiet) {
        const doneItemIds = (Object.entries(next) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
        persistCompletion(selectedDiet.id, doneItemIds);
      }
      return next;
    });
    const mealName = mealLabel(meal.name, (selectedDiet?.meals.findIndex(m => m.id === meal.id) ?? -1) + 1);
    showToast(nextDone ? `${mealName} registrada.` : `${mealName} desmarcada.`, 'success', {
      actionLabel: 'Deshacer',
      onAction: () => handleToggleMealDone(meal),
    });
  };

  const handleOpenPicker = (mealId: string, itemIdx: number, category: FoodCategory) => {
    setPickerItem({ mealId, itemIdx, category });
    setPickerCategory(category);
    setSearchTerm('');
  };

  const handleOpenAddPicker = (mealId: string, category: FoodCategory = 'HC') => {
    setPickerItem({ mealId, itemIdx: null, category });
    setPickerCategory(category);
    setSearchTerm('');
    setPickerAddedCounts({});
    setPickerRecentlyAdded(null);
  };

  const handleSelectFood = (food: MealItem) => {
    if (!pickerItem || !selectedDiet) return;
    const { mealId, itemIdx } = pickerItem;

    if (itemIdx === null) {
      // Add a brand-new item to the meal — keep the picker open (just clear the
      // search) so the athlete can add HC, then proteína, then grasa... in one go
      // instead of opening/closing the picker for every single food.
      const meal = selectedDiet.meals.find(m => m.id === mealId);
      if (!meal) { setPickerItem(null); return; }
      const newIdx = meal.items.length;
      const newItem: DietItem = { category: food.category, foodLabel: food.label, quantity: 1 };
      setSelectedDiet(prev => {
        if (!prev) return prev;
        return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: [...m.items, newItem] }) };
      });
      setItemStates(prev => ({ ...prev, [`${mealId}_${newIdx}`]: { foodLabel: newItem.foodLabel, done: false } }));
      setSearchTerm('');
      // El picker se queda abierto para encadenar varias añadidas seguidas
      // (ver comentario arriba) — sin esto, tocar "+" no daba ninguna señal
      // de que el toque había hecho algo.
      void haptics.light();
      // T13: tick + ×N en la fila, y Deshacer en el toast.
      setPickerAddedCounts(prev => ({ ...prev, [food.id]: (prev[food.id] ?? 0) + 1 }));
      setPickerRecentlyAdded(food.id);
      if (pickerRecentTimer.current) clearTimeout(pickerRecentTimer.current);
      pickerRecentTimer.current = setTimeout(() => setPickerRecentlyAdded(null), 1200);
      showToast(`${food.label} añadido.`, 'success', {
        actionLabel: 'Deshacer',
        onAction: () => {
          setSelectedDiet(prev => {
            if (!prev) return prev;
            return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: m.items.filter(it => it !== newItem) }) };
          });
          setItemStates(prev => {
            const next = { ...prev };
            delete next[`${mealId}_${newIdx}`];
            return next;
          });
          setPickerAddedCounts(prev => ({ ...prev, [food.id]: Math.max(0, (prev[food.id] ?? 1) - 1) }));
        },
      });
    } else {
      // Swap an existing item in place — a single replacement, so close afterwards.
      const key = `${mealId}_${itemIdx}`;
      setItemStates(prev => ({ ...prev, [key]: { foodLabel: food.label, done: false } }));
      setSelectedDiet(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          meals: prev.meals.map(m => m.id !== mealId ? m : {
            ...m,
            items: m.items.map((it, i) => i !== itemIdx ? it : { ...it, category: food.category, foodLabel: food.label }),
          }),
        };
      });
      setPickerItem(null);
      void haptics.light();
      showToast(`Cambiado por ${food.label}.`, 'success');
    }
  };

  // ── Recipe picker handlers ─────────────────────────────────────────────────

  const handleOpenRecipePicker = (mealId: string) => {
    setRecipePickerMealId(mealId);
    setRecipeSearch('');
    setRecipeCatFilter('all');
    setRecipeSource('mias');
    setRecetarioCat('Todas');
    setRecetarioResults([]);
    setRecetarioCursor(null);
    setRecetarioHasMore(false);
  };

  const loadRecetario = async (cat: string, cursor: RecetasCursor | null, append: boolean) => {
    const result = await queryRecetas({ categoria: cat === 'Todas' ? undefined : cat }, cursor);
    setRecetarioResults(prev => append ? [...prev, ...result.recipes] : result.recipes);
    setRecetarioCursor(result.cursor);
    setRecetarioHasMore(result.hasMore);
  };

  // Carga (o recarga al cambiar de categoría) en cuanto se entra en la
  // pestaña "Recetario" del picker — no antes, para no pedir nada si el
  // atleta se queda en "Mis recetas".
  useEffect(() => {
    if (!recipePickerMealId || recipeSource !== 'recetario') return;
    setRecetarioLoading(true);
    loadRecetario(recetarioCat, null, false)
      .catch(() => showToast('No se pudo cargar el recetario.'))
      .finally(() => setRecetarioLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipePickerMealId, recipeSource, recetarioCat]);

  const handleRecetarioLoadMore = async () => {
    setRecetarioLoadingMore(true);
    try {
      await loadRecetario(recetarioCat, recetarioCursor, true);
    } catch {
      showToast('No se pudo cargar más recetas.');
    } finally {
      setRecetarioLoadingMore(false);
    }
  };

  // ── "Guardar como receta" ────────────────────────────────────────────────

  const openSaveMealAsRecipe = (meal: DietMeal) => {
    setSavingMealAsRecipeId(meal.id);
    setRecipeNameDraft(meal.name);
  };

  const confirmSaveMealAsRecipe = async (meal: DietMeal) => {
    const name = recipeNameDraft.trim();
    if (!name || meal.items.length === 0) return;
    setSavingRecipe(true);
    try {
      const placed: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
      for (const item of meal.items) addToPlaced(placed, item.category, item.quantity);
      const exchanges = { HC: placed.HC, PROT: placed.PROT, GRASA: placed.GRASA };
      const ingredients: Recipe['ingredients'] = meal.items.map(item => ({
        foodLabel: item.foodLabel, category: item.category, mode: activeDietMode, quantity: item.quantity,
      }));
      const saved = await createRecipe({
        ownerId: profile.userId,
        name,
        categories: [],
        ingredients,
        extras: [],
        steps: [],
        exchanges,
        kcal: Math.round(exchangeToKcal(exchanges)),
      });
      setRecipes(prev => [...prev, saved]);
      showToast(`"${name}" guardada como receta — ya está disponible en Recetas.`, 'success');
      setSavingMealAsRecipeId(null);
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleApplyRecipe = (recipe: Recipe) => {
    if (!recipePickerMealId || !selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === recipePickerMealId);
    if (!meal) return;

    const newItems: DietItem[] = recipe.ingredients
      .filter(ing => enabledModes.includes(ing.mode))
      .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: recipe.id }));

    if (newItems.length === 0) { setRecipePickerMealId(null); return; }

    const startIdx = meal.items.length;
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m =>
          m.id !== recipePickerMealId ? m : { ...m, items: [...m.items, ...newItems] }
        ),
      };
    });
    const newStates: Record<string, ItemState> = {};
    newItems.forEach((item, i) => {
      newStates[`${recipePickerMealId}_${startIdx + i}`] = { foodLabel: item.foodLabel, done: false };
    });
    setItemStates(prev => ({ ...prev, ...newStates }));
    setRecipePickerMealId(null);
  };

  const handleRemoveItem = (mealId: string, itemIdx: number) => {
    if (!selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const oldLen = meal.items.length;

    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m =>
          m.id !== mealId ? m : { ...m, items: m.items.filter((_, i) => i !== itemIdx) }
        ),
      };
    });

    // Rebuild itemStates for this meal with shifted indices
    setItemStates(prev => {
      const next: Record<string, ItemState> = {};
      // Keep all states that belong to other meals
      Object.keys(prev).forEach(k => {
        if (!k.startsWith(`${mealId}_`)) next[k] = prev[k];
      });
      // Re-index this meal's states (skip deleted idx, shift down above it)
      for (let i = 0; i < oldLen; i++) {
        if (i === itemIdx) continue;
        const oldState = prev[`${mealId}_${i}`] ?? { foodLabel: meal.items[i].foodLabel, done: false };
        next[`${mealId}_${i < itemIdx ? i : i - 1}`] = oldState;
      }
      return next;
    });
  };

  // Ajusta la cantidad de un alimento en pasos de 0.25 intercambios; los
  // gramos se recalculan proporcionalmente vía itemWeightLabel/parseBaseGrams.
  const handleUpdateQuantity = (mealId: string, itemIdx: number, delta: number) => {
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m => {
          if (m.id !== mealId) return m;
          return {
            ...m,
            items: m.items.map((item, i) => {
              if (i !== itemIdx) return item;
              const newQty = round2(Math.max(0.25, item.quantity + delta));
              return { ...item, quantity: newQty };
            }),
          };
        }),
      };
    });
  };

  // ── Recipe swap ("Cambiar comida") ──────────────────────────────────────────

  const abrirReceta = async (mealId: string, recipeId: string) => {
    setRecetaAbierta({ mealId, recipeId });
    setRecetaDetalle(null);
    setCargandoReceta(true);
    // Puede estar ya entre las recetas cargadas (las del coach y las propias);
    // si no, es una del recetario y se pide la completa, con pasos y cantidades.
    const yaCargada = recipes.find(r => r.id === recipeId);
    const completa = yaCargada ?? await getRecipeById(recipeId).catch(() => null);
    setRecetaDetalle(completa);
    setCargandoReceta(false);
  };

  const cerrarReceta = () => {
    setRecetaAbierta(null);
    setRecetaDetalle(null);
  };

  const handleOpenSwapPicker = async (mealId: string, recipeId: string) => {
    const slot = selectedDiet?.meals.find(m => m.id === mealId)?.slot;
    setSwapContext({ mealId, recipeId, slot });
    setSwapDishFilter(null);
    setSwapSearch('');
    setSwapLoading(true);
    setSwapPool([]);

    // La receta origen puede venir del recetario importado, que getRecipes()
    // excluye a propósito para no bajarse 8.850 documentos. Antes se buscaba
    // solo en `recipes` y en ese caso salía null → "sin alternativas".
    const source = recipes.find(r => r.id === recipeId) ?? await getRecipeById(recipeId).catch(() => null);
    setSwapSourceRecipe(source);
    if (!source) { setSwapLoading(false); return; }

    // El pool ANTES era solo `recipes` (las recetas del coach y del atleta, un
    // puñado): el recetario entero quedaba fuera del "Cambiar comida". Ahora se
    // trae el bloque del recetario correspondiente al momento del día.
    const recetario = slot != null
      ? await queryRecetasForGenerator(slot, 300).catch(() => [] as Recipe[])
      : [];
    setSwapPool([...recetario, ...recipes]);
    setSwapLoading(false);
  };

  const handleCloseSwap = () => {
    setSwapContext(null);
    setSwapSourceRecipe(null);
    setSwapPool([]);
    setSwapDishFilter(null);
    setSwapSearch('');
  };

  const handleApplySwap = (newRecipe: Recipe) => {
    if (!swapContext || !selectedDiet) return;
    const { mealId, recipeId } = swapContext;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) { setSwapContext(null); return; }

    // recipeToDietItems, no `newRecipe.ingredients` a pelo: las 8.850 recetas del
    // recetario importado NO traen `ingredients` (el importador lo deja vacío),
    // así que sustituir por una de ellas metía cero alimentos en la comida y
    // vaciaba el hueco. El helper cae a los intercambios agregados en ese caso.
    const newIngredientItems: DietItem[] = recipeToDietItems(newRecipe, enabledModes);

    const oldItems = meal.items;
    const keptIndices: number[] = [];
    oldItems.forEach((it, i) => { if (it.originRecipeId !== recipeId) keptIndices.push(i); });
    const keptItems = keptIndices.map(i => oldItems[i]);
    const newItems = [...keptItems, ...newIngredientItems];

    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: newItems }),
      };
    });

    // Kept items keep their done-state (relative order preserved); swapped-in
    // items start fresh, same as a freshly-applied recipe.
    let nextStates: Record<string, ItemState> = {};
    setItemStates(prev => {
      const next: Record<string, ItemState> = {};
      Object.keys(prev).forEach(k => { if (!k.startsWith(`${mealId}_`)) next[k] = prev[k]; });
      keptItems.forEach((item, newIdx) => {
        const oldIdx = keptIndices[newIdx];
        next[`${mealId}_${newIdx}`] = prev[`${mealId}_${oldIdx}`] ?? { foodLabel: item.foodLabel, done: false };
      });
      newIngredientItems.forEach((item, i) => {
        next[`${mealId}_${keptItems.length + i}`] = { foodLabel: item.foodLabel, done: false };
      });
      nextStates = next;
      return next;
    });

    if (selectedDiet) {
      const doneItemIds = (Object.entries(nextStates) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
      persistCompletion(selectedDiet.id, doneItemIds);
    }

    setSwapContext(null);
  };

  // ── Menu building: meals + budget ───────────────────────────────────────────

  const renameDiet = (name: string) => {
    setSelectedDiet(prev => prev ? { ...prev, name } : prev);
  };

  // Cambio rápido de modo (Omnívoro/Vegano/Sin pesar) desde Nutrición — antes
  // solo el coach podía habilitarlo desde la ficha del cliente. El cambio de
  // banco de alimentos es instantáneo (activeDietMode), y si el modo no estaba
  // habilitado se añade también a enabledModes y se persiste, para que quede
  // disponible la próxima vez y visible como habilitado en el panel del coach.
  const selectDietMode = (mode: DietMode) => {
    setActiveDietMode(mode);
    if (enabledModes.includes(mode)) return;
    const updated = [...enabledModes, mode];
    setEnabledModes(updated);
    if (!nutConfig) return;
    const next = { ...nutConfig, athleteId: profile.email, enabledModes: updated };
    queryClient.setQueryData(['athleteNutritionConfig', profile.email], next);
    saveAthleteNutritionConfig(next).catch(() => {
      showToast('No se pudo guardar el modo — se activó solo para esta sesión.');
    });
  };

  // Reparto del cupo diario por comida (handoff — a petición de Dani): el
  // total diario lo fija el coach y es fijo (`selectedDiet.budget`), pero el
  // atleta puede mover cuánto de ese total asigna a cada comida. Mismo patrón
  // que `setMealTarget` del lado coach (NutritionPlansScreen.tsx), adaptado a
  // `setSelectedDiet` — esto ya dispara `isDirty`/autoguardado solo, porque
  // `dietSnapshot` serializa `meals` completo.
  const updateMealTargetCat = (mealId: string, cat: FoodCategory, delta: number) => {
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m => {
          if (m.id !== mealId) return m;
          const cur = m.target ?? { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
          return { ...m, target: { ...cur, [cat]: Math.max(0, round2(cur[cat] + delta)) } };
        }),
      };
    });
  };

  const addMeal = () => {
    if (!selectedDiet) return;
    const newMeal: DietMeal = { id: makeId(), name: `Comida ${selectedDiet.meals.length + 1}`, items: [] };
    setSelectedDiet(prev => prev ? { ...prev, meals: [...prev.meals, newMeal] } : prev);
    setOrigItemCounts(prev => ({ ...prev, [newMeal.id]: 0 }));
  };

  const removeMeal = (mealId: string) => {
    setSelectedDiet(prev => prev ? { ...prev, meals: prev.meals.filter(m => m.id !== mealId) } : prev);
    setItemStates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${mealId}_`)) delete next[k]; });
      return next;
    });
  };

  const renameMeal = (mealId: string, name: string) => {
    setSelectedDiet(prev => prev ? { ...prev, meals: prev.meals.map(m => m.id === mealId ? { ...m, name } : m) } : prev);
  };

  // ── Guardar ──────────────────────────────────────────────────────────────────

  const handleSaveDiet = async () => {
    if (!selectedDiet) return;
    if (!isPersisted) {
      setSaving(true);
      try {
        const created = await createDiet({
          athleteId: profile.email,
          name: selectedDiet.name.trim() || 'Mi menú',
          budget: selectedDiet.budget,
          meals: selectedDiet.meals,
          selfManaged: true,
        });
        setAllDietsList(prev => [...prev, created]);
        setSelectedDiet(created);
        setSavedDietSnapshot(dietSnapshot(created));
        localStorage.setItem(`enforma_intercambios_diet_${profile.email}`, created.id);
        // Re-point today's completion log from the temporary draft id to the real one,
        // so checkmarks made before the first save survive a reload.
        const doneItemIds = (Object.entries(itemStates) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
        if (doneItemIds.length > 0) {
          persistCompletion(created.id, doneItemIds);
        }
        showToast('Menú guardado.', 'success');
      } catch (err) {
        console.error(err);
        showToast('No se pudo guardar el menú.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (selectedDiet.selfManaged) {
      setSaving(true);
      try {
        await updateDiet(selectedDiet.id, { name: selectedDiet.name, budget: selectedDiet.budget, meals: selectedDiet.meals });
        setAllDietsList(prev => prev.map(d => d.id === selectedDiet.id ? selectedDiet : d));
        setSavedDietSnapshot(dietSnapshot(selectedDiet));
        showToast('Cambios guardados.', 'success');
      } catch (err) {
        console.error(err);
        showToast('No se pudieron guardar los cambios.');
      } finally {
        setSaving(false);
      }
      return;
    }
    // Dieta del entrenador: las reglas de Firestore prohíben que el atleta la
    // actualice (solo puede update/delete si selfManaged=true) — antes había
    // aquí una hoja "¿Cómo quieres guardar?" con un botón "Actualizar esta
    // dieta" que SIEMPRE fallaba con permission-denied. En vez de ofrecer una
    // opción que nunca funciona, se guarda como copia propia directamente
    // (el `Banner` del header ya avisa de esto antes de que el atleta guarde).
    await handleForkCoachDiet();
  };

  const handleForkCoachDiet = async () => {
    if (!selectedDiet) return;
    setSaving(true);
    try {
      // Un id nuevo por comida, pero recordando cuál viene de cuál — el
      // registro de "hecho" de hoy está indexado por `${mealId}_${idx}` y sin
      // este mapa el fork lo deja huérfano bajo un mealId que ya no existe
      // (la barra "Objetivo comida" vuelve a 0% y el registro no sobrevive a
      // un recargo, aunque el atleta acabe de marcarlo).
      const idMap = new Map(selectedDiet.meals.map(m => [m.id, makeId()]));
      const created = await createDiet({
        athleteId: profile.email,
        name: `${selectedDiet.name} (mi versión)`,
        budget: selectedDiet.budget,
        meals: selectedDiet.meals.map(m => ({ ...m, id: idMap.get(m.id)! })),
        selfManaged: true,
      });
      setAllDietsList(prev => [...prev, created]);

      const doneItemIds = (Object.entries(itemStates) as [string, ItemState][])
        .filter(([, v]) => v.done)
        .map(([key]) => {
          const sep = key.lastIndexOf('_');
          const newMealId = idMap.get(key.slice(0, sep));
          return newMealId ? `${newMealId}${key.slice(sep)}` : key;
        });
      // Se espera esta escritura ANTES de seleccionar la dieta forkeada: el
      // efecto que reconstruye `itemStates` al cambiar de dieta lee este
      // mismo log (`getDietCompletionLog`) — si `handleSelectDiet` fuera
      // primero, esa lectura podría llegar antes que esta escritura y
      // encontrar el registro vacío.
      if (doneItemIds.length > 0) {
        await saveDietCompletionLog({ athleteId: profile.email, date: TODAY_DATE, dietId: created.id, doneItemIds });
      }

      handleSelectDiet(created, { skipDirtyCheck: true });
      showToast('Guardada como copia tuya — la dieta de tu coach sigue intacta.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar la copia.');
    } finally {
      setSaving(false);
    }
  };

  // Autoguardado — sustituye al botón "Guardar" manual: en cuanto hay cambios
  // sin guardar, se guardan solos tras una pausa corta de inactividad (evita
  // disparar una escritura por cada tecla/tap). `saving` en las dependencias
  // relanza el temporizador cuando el guardado en curso termina, por si el
  // atleta siguió editando mientras tanto.
  useEffect(() => {
    if (!isDirty || saving) return;
    const t = setTimeout(() => { handleSaveDiet(); }, 1200);
    return () => clearTimeout(t);
  }, [isDirty, saving, selectedDiet]);

  // ── Recipe hand-off from Recetas (favoritos → "Añadir a Intercambios") ──────

  // Mirrors handleApplyRecipe, but takes an explicit mealId instead of reading it
  // from recipePickerMealId state — needed when the target meal is decided
  // programmatically (auto when there's a single meal, or via chooseMealForRecipe).
  const addRecipeToMeal = (recipe: Recipe, mealId: string, currentDiet: Diet) => {
    const meal = currentDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const newItems: DietItem[] = recipeToDietItems(recipe, enabledModes);
    if (newItems.length === 0) {
      showToast(`No se pudo añadir "${recipe.name}": no tiene datos de intercambios.`, 'error');
      return;
    }
    const startIdx = meal.items.length;
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: [...m.items, ...newItems] }) };
    });
    const newStates: Record<string, ItemState> = {};
    newItems.forEach((item, i) => { newStates[`${mealId}_${startIdx + i}`] = { foodLabel: item.foodLabel, done: false }; });
    setItemStates(prev => ({ ...prev, ...newStates }));
    showToast(`"${recipe.name}" añadida a ${mealLabel(meal.name, currentDiet.meals.indexOf(meal) + 1)}.`, 'success');
  };

  // 14-08 (tarea 24). React #185 «Maximum update depth exceeded» al añadir
  // una receta a Intercambios. El guardado `!pendingRecipe` de abajo no basta
  // por sí solo: `onConsumedPendingRecipe` limpia `pendingRecipe` en el PADRE
  // (NutritionHubScreen), y hasta que ese cambio de prop vuelve a bajar aquí
  // este efecto puede volver a dispararse con el MISMO objeto — por ejemplo
  // si `loading` cambia de valor en ese hueco, que es justo el otro elemento
  // de sus dependencias. Cada disparo repetido con la misma receta ejecuta
  // `handleSelectDiet`/`setChooseDietForRecipe` otra vez, lo que puede volver
  // a cambiar algo que retrigueree el efecto antes de que React llegue a
  // pintar — el patrón clásico del error 185. Un ref que recuerda la ÚLTIMA
  // receta ya procesada (mismo patrón que `initFor` más arriba) hace el
  // efecto idempotente sin importar cuántas veces se dispare de más.
  const pendingRecipeProcesadaRef = useRef<Recipe | null>(null);
  useEffect(() => {
    if (!pendingRecipe || loading) return;
    if (pendingRecipeProcesadaRef.current === pendingRecipe) return;
    pendingRecipeProcesadaRef.current = pendingRecipe;
    if (allDietsList.length === 0) {
      // Athlete has no diets at all yet — nothing to choose from, start a blank one
      const blank = blankDiet(profile.email);
      blank.meals[0].items = recipeToDietItems(pendingRecipe, enabledModes);
      handleSelectDiet(blank, { skipDirtyCheck: true });
      onConsumedPendingRecipe?.();
      return;
    }
    // Let the athlete choose which diet to add the recipe to (or start a new one)
    setChooseDietForRecipe(pendingRecipe);
    onConsumedPendingRecipe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecipe, loading]);

  const handleChooseDietForRecipe = (target: Diet | 'new') => {
    const recipe = chooseDietForRecipe;
    setChooseDietForRecipe(null);
    if (!recipe) return;

    const newItems = recipeToDietItems(recipe, enabledModes);
    if (newItems.length === 0) {
      showToast(`No se pudo añadir "${recipe.name}": no tiene datos de intercambios.`, 'error');
      return;
    }

    if (target === 'new') {
      const blank = blankDiet(profile.email);
      blank.meals[0].items = newItems;
      handleSelectDiet(blank, { skipDirtyCheck: true });
      showToast(`"${recipe.name}" añadida a un nuevo menú.`, 'success');
      return;
    }

    if (target.meals.length === 1) {
      const meal = target.meals[0];
      const updated: Diet = { ...target, meals: [{ ...meal, items: [...meal.items, ...newItems] }] };
      handleSelectDiet(updated, { skipDirtyCheck: true });
      showToast(`"${recipe.name}" añadida a ${mealLabel(meal.name, 1)}.`, 'success');
    } else {
      handleSelectDiet(target, { skipDirtyCheck: true });
      setChooseMealForRecipe(recipe);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-display text-ink tracking-tight">Mi plan</h1>
        <p className="text-ink-2 text-body-s mt-1">Construye tu menú del día con intercambios.</p>
      </div>

      {/* Phase change banner */}
      {phaseBanner && (
        <div className="flex items-center justify-between gap-3 bg-accent/10 border border-accent/30 rounded-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="swap_horiz" size="m" className="text-accent flex-shrink-0" />
            <p className="font-sans font-bold text-accent text-body-s">{phaseBanner}</p>
          </div>
          <button
            onClick={() => setPhaseBanner(null)}
            className="text-accent/60 hover:text-accent transition-colors flex-shrink-0"
          >
            <Icon name="close" size="s" />
          </button>
        </div>
      )}

      {/* Pending coach diets banner — different days can carry different diets
          (día A/B/C); this flags the ones still missing food items to hit budget. */}
      {pendingScheduledDiets.length > 0 && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/25 text-warning px-4 py-3 rounded-surface text-body-s">
          <Icon name="pending_actions" size="s" className="text-warning flex-shrink-0" />
          <span>
            Tienes <strong>{pendingScheduledDiets.length}</strong> {pendingScheduledDiets.length === 1 ? 'dieta pendiente de generar' : 'dietas pendientes de generar'}
            {': '}
            {pendingScheduledDiets.map(d => d.name).join(', ')}
          </span>
        </div>
      )}

      {/* Diet mode selector — siempre visible (antes solo si el coach había
          habilitado más de un modo) para que el atleta pueda pasar a "Sin
          pesar" cualquier día, sin depender de que el coach lo active antes. */}
      <div className="flex gap-2 flex-wrap">
        {ALL_DIET_MODES.map(mode => (
          <button key={mode} onClick={() => selectDietMode(mode)}
            className={`px-4 py-2 rounded-control font-sans text-label font-bold uppercase tracking-wider transition-all ${
              activeDietMode === mode
                ? 'bg-accent text-black'
                : 'bg-raised text-ink-2 border border-hairline hover:border-accent/40 hover:text-ink'
            }`}
          >{MODE_LABEL[mode]}</button>
        ))}
      </div>

      {/* Week schedule navigation */}
      {!loading && WD_ORDER.some(d => typeof weeklySchedule[d] === 'string') && (
        <div className="flex gap-2">
          {WD_ORDER.map(day => {
            const isToday = day === TODAY_WD;
            const isViewing = day === viewDay;
            const hasDiet = typeof weeklySchedule[day] === 'string';
            return (
              <button
                key={day}
                onClick={() => setViewDay(day)}
                className={`flex-1 flex flex-col items-center py-3 rounded-control font-mono text-caption font-bold uppercase tracking-wider border transition-all ${
                  isViewing
                    ? 'bg-accent/10 border-accent/50 text-accent'
                    : isToday
                    ? 'bg-raised border-hairline text-ink'
                    : 'bg-raised border-hairline text-ink-2 hover:border-hairline hover:text-ink'
                }`}
              >
                <span>{WD_SHORT[day]}</span>
                <span className={`w-1 h-1 rounded-full ${isToday ? 'bg-accent' : hasDiet ? 'bg-info/50' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        // 05 · Carga — esqueletos con barrido 1,4 s y stagger 150 ms, nunca
        // spinner ni cifras falsas (handoff).
        <div className="bg-raised border border-hairline rounded-canvas p-4 space-y-5">
          <div className="flex items-end justify-between gap-3">
            <Skeleton className="stagger-child h-9 w-28" style={{ '--i': 0 } as React.CSSProperties} />
            <Skeleton className="stagger-child h-5 w-16" style={{ '--i': 1 } as React.CSSProperties} />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <React.Fragment key={i}><Skeleton className="stagger-child h-6 w-full" style={{ '--i': i + 2 } as React.CSSProperties} /></React.Fragment>
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {[0, 1, 2].map(i => (
              <React.Fragment key={i}><Skeleton className="stagger-child h-16 w-full" style={{ '--i': i + 5 } as React.CSSProperties} /></React.Fragment>
            ))}
          </div>
        </div>
      ) : allDietsList.length === 0 && !selectedDiet ? (
        // 04 · Vacío — sin dieta publicada. Ningún vacío culpa al atleta: dice
        // qué falta y quién lo tiene que hacer (handoff).
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center animate-fade-up">
          <span className="flex h-16 w-16 items-center justify-center rounded-field border border-dashed border-accent-line">
            <Icon name="nutrition" size="xl" className="text-accent" />
          </span>
          <div className="flex flex-col gap-2 max-w-[320px]">
            <p className="font-display font-black text-title-l uppercase leading-tight tracking-tight text-ink">
              Dani está montando<br />tu dieta
            </p>
            <p className="font-sans text-body-s text-ink-2">
              En cuanto tu entrenador publique tu plan de nutrición, lo verás aquí y te avisamos.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-field border border-accent-line bg-accent-bg px-4 py-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
            <span className="font-mono text-label font-semibold tracking-[.08em] text-accent">SIN PLAN PUBLICADO TODAVÍA</span>
          </span>
          <Button variant="ghost" onClick={handleStartBlank} className="mt-2">
            Empezar mi propio menú mientras tanto
          </Button>
        </div>
      ) : viewDay !== TODAY_WD ? (() => {
        const browseDietId = weeklySchedule[viewDay] ?? null;
        const browseDiet = browseDietId ? allDietsList.find(d => d.id === browseDietId) ?? null : null;
        return (
          <div className="space-y-4">
            <div className="bg-raised rounded-surface p-4 border border-hairline">
              <span className="block font-mono text-caption text-ink-2 uppercase tracking-widest font-bold mb-1">
                {WD_FULL[viewDay].charAt(0).toUpperCase() + WD_FULL[viewDay].slice(1)}
              </span>
              {browseDiet ? (
                <>
                  <span className="block font-sans font-bold text-title-m text-ink leading-tight">{browseDiet.name}</span>
                  {browseDiet.coachNote && (
                    <span className="block text-label text-accent italic mt-1">{browseDiet.coachNote}</span>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {BUDGET_CATS.map(cat => {
                      const b = browseDiet.budget[cat];
                      return b > 0 ? (
                        <span key={cat} className={`text-caption font-mono font-bold px-3 py-1 rounded-surface border ${CAT_BG[cat]} ${CAT_COLOR[cat]}`}>
                          {cat}: {b} int.
                        </span>
                      ) : null;
                    })}
                  </div>
                </>
              ) : (
                <span className="block font-sans text-ink-2 text-body-s mt-1">Día libre — sin dieta programada.</span>
              )}
            </div>
            <button
              onClick={() => setViewDay(TODAY_WD)}
              className="w-full py-3 rounded-control border border-accent/30 text-accent font-sans text-label font-bold uppercase tracking-wider hover:bg-accent/10 transition-all"
            >
              ← Volver a hoy
            </button>
          </div>
        );
      })() : (
        <>
          {/* Selector de dieta — sustituye la fila de chips (desbordaba con
              varias dietas). Un solo control que resume la dieta activa y
              abre "Mis dietas" para cambiar, crear, duplicar o borrar. */}
          {allDietsList.length > 0 && selectedDiet && (() => {
            const isScheduledToday = weeklySchedule[TODAY_WD] === selectedDiet.id;
            const subtitle = isScheduledToday
              ? `Programada para hoy (${WD_FULL[TODAY_WD]}) por tu coach`
              : !selectedDiet.selfManaged
              ? 'De tu entrenador'
              : 'Tuya';
            const otherCount = allDietsList.length - 1;
            return (
              <button
                type="button"
                onClick={() => setMisDietasOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-control bg-raised border border-hairline hover:border-accent/40 transition-all text-left"
              >
                <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                  <Icon name={selectedDiet.selfManaged ? 'bookmark' : 'military_tech'} size="s" className="text-accent" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans font-bold text-body-s text-ink truncate">{selectedDiet.name}</span>
                  <span className="block font-mono text-caption text-ink-2 truncate">{subtitle}</span>
                </span>
                {otherCount > 0 && (
                  <span className="flex-shrink-0 font-mono text-caption font-bold text-ink-2 bg-bg border border-hairline rounded-full px-2 py-0.5">
                    +{otherCount}
                  </span>
                )}
                <Icon name="expand_more" size="s" className="text-ink-2 flex-shrink-0" />
              </button>
            );
          })()}

          {selectedDiet && (
            <React.Fragment key={selectedDiet.id}>
              {/* ── 01 · Tracker del día (F3.8) ─────────────────────────────────── */}
              <div ref={trackerTargetRef} className="bg-raised border border-hairline rounded-canvas p-4">
                {/* Cabecera de la dieta — antes vivía en una tarjeta aparte junto al
                    cupo diario fijado por el coach; ese cupo se ha quitado del todo
                    (las barras de abajo ya muestran lo mismo) y Dani pidió juntar
                    aquí arriba lo que queda: nombre + nota del coach. */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-caption text-ink-2 uppercase tracking-widest font-bold">
                    {selectedDiet.selfManaged ? 'TU MENÚ' : 'DIETA DE TU ENTRENADOR'}
                  </span>
                  <span className="font-mono text-caption text-accent uppercase tracking-widest font-bold">Hoy, {WD_FULL[TODAY_WD]}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={selectedDiet.name}
                    onChange={e => renameDiet(e.target.value)}
                    aria-label="Nombre de la dieta"
                    className="min-w-0 flex-1 bg-transparent border-none font-sans font-bold text-title-m text-ink leading-tight focus:outline-none focus:ring-0 p-0"
                  />
                  <Icon name="edit" size="s" className="text-ink-3 flex-shrink-0" />
                </div>
                {selectedDiet.coachNote && (
                  <span className="block font-sans text-label text-accent italic mt-1">{selectedDiet.coachNote}</span>
                )}
                <span className="block font-mono text-caption text-ink-2 mt-2">
                  {selectedDiet.meals.length} comida{selectedDiet.meals.length !== 1 ? 's' : ''} · {selectedDiet.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                </span>

                <div className="border-t border-hairline mt-4 pt-4">
                {dayClosed ? (
                  <div className="flex flex-col items-center py-4 text-center animate-fade-up">
                    <RingSeal percent={100} complete size={112} strokeWidth={8} label="Día cerrado en presupuesto" />
                    <p className="font-display font-black text-title-l uppercase leading-tight tracking-tight text-ink mt-5">
                      Día cerrado<br />en presupuesto
                    </p>
                    <p className="text-body-s text-ink-2 mt-2 max-w-[300px]">
                      Registraste tus {totalItems} ingesta{totalItems !== 1 ? 's' : ''} de hoy dentro de tu presupuesto de intercambios.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.16em]">Te quedan</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className={`font-display font-black text-headline leading-none ${leftExch < 0 ? 'text-danger' : 'text-accent'}`}>
                            {fmtQty(leftExch)}
                          </span>
                          <span className="font-sans font-semibold text-body-s text-ink-3">intercambios</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block font-mono text-caption text-ink-3 uppercase tracking-[.14em]">≈ kcal</span>
                        <span className="block font-mono text-title-s text-ink-2 mt-2">
                          {leftKcal < 0 ? '−' : '≈ '}{Math.abs(leftKcal).toLocaleString('es-ES')}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 mt-5">
                      {BUDGET_CATS.map(cat => {
                        const b = selectedDiet.budget[cat] ?? 0;
                        const d = doneByCat[cat];
                        const over = b > 0 && d > b;
                        const pct = b > 0 ? (d / b) * 100 : (d > 0 ? 100 : 0);
                        return (
                          <div key={cat}>
                            <div className="flex items-baseline justify-between mb-2">
                              <span className="font-mono text-caption font-semibold text-ink-2 tracking-[.1em]">{BAR_LABEL[cat]}</span>
                              <span className={`font-mono text-label font-bold ${over ? 'text-danger' : 'text-ink-2'}`}>
                                {fmtQty(d)}/{fmtQty(b)}{over ? `  +${fmtQty(round2(d - b))}` : ''}
                              </span>
                            </div>
                            <ProgressBar value={pct} label={`${BAR_LABEL[cat]}, ${fmtQty(d)} de ${fmtQty(b)} intercambios`} />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                </div>
              </div>

              {/* Aviso de fork: editar una dieta del coach nunca la actualiza in
                  situ (las reglas de Firestore lo prohíben) — al guardar se crea
                  una copia propia. Avisar aquí, antes de que el atleta guarde,
                  en vez de que se entere por el texto del botón. */}
              {!selectedDiet.selfManaged && isDirty && (
                <div className="flex items-start gap-2 bg-info/10 border border-info/25 text-info px-4 py-3 rounded-surface text-body-s">
                  <Icon name="info" size="s" className="flex-shrink-0 mt-0.5" />
                  <span>Esta dieta la creó tu coach. Si la editas, se guardará como copia tuya y la original no se toca.</span>
                </div>
              )}

              {/* El desglose numérico por comida (Paco/Comida 2/Comida 3 + total del
                  día) se ha quitado — duplicaba, con otro estilo, lo que ya muestra
                  el tracker de arriba (panel 01) y la lista de "Ingestas". */}

              <Coachmark
                id="nutrition_swap_hint"
                email={profile.email}
                icon="swap_horiz"
                text="¿No te apetece algo? Toca Cambiar junto a cualquier alimento para sustituirlo por un equivalente."
              />

              {/* Abre la pantalla dedicada de reparto (todas las comidas a la
                  vez), en vez de steppers sueltos en cada tarjeta. */}
              <button
                type="button"
                onClick={() => setRepartoSheetOpen(true)}
                className="self-start flex items-center gap-2 px-3 py-2 rounded-control border bg-raised border-hairline text-ink-2 font-sans text-label font-bold hover:text-accent hover:border-accent/50 transition-colors"
              >
                <Icon name="tune" size="s" />
                Editar reparto por comida
              </button>

              <div className="space-y-4">
                {selectedDiet.meals.map((meal, mi) => {
                  const mealDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
                  return (
                    <div key={meal.id}
                      ref={mi === 0 ? firstMealRowTargetRef : undefined}
                      className={`bg-raised rounded-surface overflow-hidden border transition-all ${mealDone ? 'border-accent/40' : 'border-hairline'}`}
                    >
                      {/* Meal header */}
                      <div className="px-4 py-3 bg-raised/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleMealDone(meal)}
                            title={mealDone ? 'Desmarcar ingesta' : 'Registrar ingesta'}
                            aria-label={mealDone ? 'Desmarcar ingesta' : 'Registrar ingesta'}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${mealDone ? 'bg-accent border-accent' : 'border-hairline hover:border-accent/50'}`}
                          >
                            {mealDone && <span className="material-symbols-outlined text-black" style={{ fontSize: '13px' }}>check</span>}
                          </button>
                          <input
                            type="text"
                            value={meal.name}
                            onChange={e => renameMeal(meal.id, e.target.value)}
                            placeholder={`Comida ${mi + 1}`}
                            className="min-w-0 flex-1 bg-transparent border-none font-sans font-bold text-ink text-title-s focus:outline-none focus:ring-0 p-0"
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono text-caption text-ink-2 hidden sm:block">
                            {meal.items.length} alimento{meal.items.length !== 1 ? 's' : ''}
                          </span>
                          {/* Antes solo aparecía si ya había ≥1 receta guardada —
                              el botón desaparecía del todo y parecía que faltaba.
                              Siempre visible; la hoja que abre ya tiene su propio
                              estado vacío ("el coach todavía no ha publicado
                              recetas"). Cubre tanto recetas del coach como
                              comidas de intercambios que el propio atleta guardó
                              con "Guardar receta" — son la misma lista. */}
                          <button
                            onClick={() => handleOpenRecipePicker(meal.id)}
                            title="Usar receta o comida guardada"
                            className="flex items-center gap-1 px-2 py-1 rounded-control bg-raised border border-hairline hover:border-accent/50 hover:text-accent text-ink-2 transition-all"
                          >
                            <span className="material-symbols-outlined text-label select-none">skillet</span>
                            <span className="font-mono text-caption uppercase tracking-wider hidden sm:block">Receta</span>
                          </button>
                          {meal.items.length > 0 && (
                            <button
                              onClick={() => openSaveMealAsRecipe(meal)}
                              title="Guardar como receta"
                              className="flex items-center gap-1 px-2 py-1 rounded-control bg-raised border border-hairline hover:border-info/50 hover:text-info text-ink-2 transition-all"
                            >
                              <span className="material-symbols-outlined text-label select-none">bookmark_add</span>
                              <span className="font-mono text-caption uppercase tracking-wider hidden sm:block">Guardar receta</span>
                            </button>
                          )}
                          {selectedDiet.meals.length > 1 && (
                            <button
                              onClick={() => removeMeal(meal.id)}
                              title="Quitar comida"
                              className="text-ink-2 hover:text-red-400 transition-colors p-1"
                            >
                              <span className="material-symbols-outlined text-body-s select-none">delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {savingMealAsRecipeId === meal.id && (
                        <div className="px-4 py-3 bg-bg/60 border-b border-hairline flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={recipeNameDraft}
                            onChange={e => setRecipeNameDraft(e.target.value)}
                            placeholder="Nombre de la receta"
                            className="flex-1 min-w-0 bg-raised border border-hairline rounded-control px-3 py-2 text-title-s text-ink font-mono focus:outline-none focus:border-info/50"
                          />
                          <button
                            onClick={() => confirmSaveMealAsRecipe(meal)}
                            disabled={savingRecipe || !recipeNameDraft.trim()}
                            className="px-3 py-2 bg-info text-black font-mono text-caption font-bold uppercase rounded-control disabled:opacity-40 transition-all"
                          >
                            {savingRecipe ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button
                            onClick={() => setSavingMealAsRecipeId(null)}
                            className="text-ink-2 hover:text-ink p-1"
                          >
                            <span className="material-symbols-outlined text-body-s">close</span>
                          </button>
                        </div>
                      )}

                      {/* Objetivo por comida — solo lectura aquí; se edita en la
                          pantalla dedicada ("Editar reparto por comida" arriba). */}
                      {CATS.some(c => (meal.target?.[c] ?? 0) > 0) && (() => {
                        const mDone = mealDoneByCat[meal.id] ?? {} as Record<FoodCategory, number>;
                        const targetCats = CATS.filter(c => (meal.target?.[c] ?? 0) > 0);
                        return (
                          <div className="px-4 py-2 bg-bg/60 border-b border-hairline">
                            <p className="font-mono text-caption text-ink-3 uppercase tracking-wider mb-2">Objetivo comida</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-2 items-center">
                              {targetCats.map(cat => {
                                const tgt = meal.target![cat]!;
                                const d = mDone[cat] ?? 0;
                                const isOk = round2(d) >= round2(tgt);
                                const isOver = d > tgt;
                                const pct = tgt > 0 ? (d / tgt) * 100 : 0;
                                return (
                                  <div key={cat} className="flex items-center gap-1">
                                    <span className={`font-mono text-caption font-bold ${CAT_COLOR[cat]}`}>
                                      {cat.replace('_', ' ')}
                                    </span>
                                    <span className={`font-mono text-caption ${isOver ? 'text-red-400' : isOk ? 'text-green-400' : 'text-ink-2'}`}>
                                      {fmtQty(d)}/{fmtQty(tgt)}{isOk ? ' ✓' : ''}
                                    </span>
                                    <ProgressBar
                                      value={pct}
                                      label={`${CAT_LABEL[cat]} de esta comida, ${fmtQty(d)} de ${fmtQty(tgt)} intercambios`}
                                      widthClassName="w-10 flex-shrink-0"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Item list */}
                      <div className="p-3 border-t border-hairline bg-bg/40 space-y-2">
                        {meal.items.length === 0 ? (
                          <button
                            onClick={() => handleOpenAddPicker(meal.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-surface border border-dashed border-hairline text-ink-2 hover:border-accent/50 hover:text-accent transition-colors active:scale-[0.99]"
                          >
                            <span className="w-8 h-8 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                              <Icon name="add" size="s" className="text-accent" />
                            </span>
                            <span className="font-sans text-body-s font-semibold">Añadir alimento del banco</span>
                          </button>
                        ) : meal.items.map((item, idx) => {
                          const key = `${meal.id}_${idx}`;
                          const st = itemStates[key] ?? { foodLabel: item.foodLabel, done: false };
                          // El botón "Cambiar" es lo único que abre el intercambiador —
                          // antes era la fila entera con un icono decorativo sin ningún
                          // affordance (queja real: "no da feedback ni info al tocar").
                          const canDelete = selectedDiet.selfManaged || idx >= (origItemCounts[meal.id] ?? Infinity);
                          return (
                            <div key={key}
                              className={`flex items-center gap-3 p-3 rounded-surface border transition-colors duration-(--duration-state) ${st.done ? 'bg-surface border-accent/20 opacity-75' : 'bg-surface border-hairline'}`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => handleToggleDone(meal.id, idx)}
                                title={st.done ? 'Desmarcar' : 'Marcar'}
                                className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all active:scale-90 ${st.done ? 'bg-accent text-black border-transparent' : 'border border-ink-2/40 hover:border-accent'}`}
                              >
                                {st.done && <span className="material-symbols-outlined text-body-s font-bold">check</span>}
                              </button>

                              {/* Category tag — cuadro 44px del handoff */}
                              <span className="w-11 h-11 rounded-control bg-inset border border-hairline flex-shrink-0 flex items-center justify-center px-0.5">
                                <span className={`font-mono font-bold text-ink-3 leading-none text-center ${item.category.startsWith('MIX_') ? 'text-[9px] tracking-tight' : 'text-caption'}`}>
                                  {item.category.replace('_', '')}
                                </span>
                              </span>

                              {/* Nombre + gramos en oro (los gramos SOLO viven aquí — el resto de la pantalla habla en intercambios) + equivalencia humana.
                                  También abre el intercambiador — misma acción que "Cambiar", dos zonas táctiles para el mismo gesto. */}
                              <button
                                type="button"
                                onClick={() => handleOpenPicker(meal.id, idx, item.category)}
                                className="flex-1 min-w-0 text-left rounded-control -m-1 p-1 transition-colors hover:bg-raised/60 active:bg-raised"
                              >
                                <div className="flex items-baseline gap-2">
                                  <span className={`text-body-s font-sans font-semibold leading-snug truncate ${st.done ? 'line-through text-ink-2' : 'text-ink'}`}>
                                    {st.foodLabel}
                                  </span>
                                  <span className="font-mono text-body-s font-bold text-accent flex-shrink-0">
                                    {itemWeightLabel(item.foodLabel, item.quantity)}
                                  </span>
                                </div>
                                <span className="block font-sans text-caption text-ink-3 mt-1">
                                  intercambio{item.quantity !== 1 ? 's' : ''} de {CAT_LABEL[item.category].toLowerCase()}
                                </span>
                              </button>

                              {/* Stepper de cantidad — pasos de 0.25 intercambio; los gramos
                                  se recalculan solos vía itemWeightLabel (proporcional a la
                                  equivalencia del alimento). */}
                              <div
                                className="flex items-center gap-1 bg-inset rounded-control border border-hairline flex-shrink-0"
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(meal.id, idx, -0.25)}
                                  aria-label="Restar 0.25 intercambios"
                                  className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-white font-bold text-body-s active:scale-90"
                                >−</button>
                                <span className="w-9 text-center font-mono text-caption text-white">{fmtQty(item.quantity)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(meal.id, idx, 0.25)}
                                  aria-label="Sumar 0.25 intercambios"
                                  className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-white font-bold text-body-s active:scale-90"
                                >+</button>
                              </div>

                              {/* Abrir la receta — solo en el primer alimento del grupo que
                                  vino de ella. Con texto y no solo icono: en móvil no hay
                                  hover, así que un `title` no lo lee nadie. */}
                              {item.originRecipeId && meal.items.findIndex(it => it.originRecipeId === item.originRecipeId) === idx && (
                                <button
                                  type="button"
                                  onClick={() => abrirReceta(meal.id, item.originRecipeId!)}
                                  aria-label="Ver la receta de esta comida"
                                  className="flex-shrink-0 flex items-center gap-1 rounded-control border border-hairline bg-raised px-2 py-2 text-ink-2 transition-transform duration-(--duration-state) hover:text-accent hover:border-accent/40 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-body-s select-none">skillet</span>
                                  <span className="hidden sm:inline font-mono text-caption uppercase tracking-wider">Receta</span>
                                </button>
                              )}

                              {/* Botón "Cambiar" real — antes era un icono decorativo sin onClick */}
                              <button
                                type="button"
                                onClick={() => handleOpenPicker(meal.id, idx, item.category)}
                                aria-label={`Cambiar ${st.foodLabel}`}
                                className="flex-shrink-0 flex items-center gap-1 rounded-control border border-accent-line bg-accent-bg px-2 py-2 text-accent transition-transform duration-(--duration-state) hover:bg-accent/20 active:scale-95"
                              >
                                <Icon name="swap_horiz" size="s" />
                                <span className="hidden sm:inline font-mono text-caption uppercase tracking-wider">Cambiar</span>
                              </button>

                              {/* Delete button — dietas propias: cualquier alimento; dietas
                                  del coach: solo los que se añadieron aquí (no los originales) */}
                              {canDelete && (
                                <button
                                  onClick={() => handleRemoveItem(meal.id, idx)}
                                  title="Quitar"
                                  className="text-ink-2 hover:text-red-400 transition-colors flex-shrink-0 p-2 -m-1.5 active:scale-90"
                                >
                                  <span className="material-symbols-outlined text-body-s select-none">close</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {/* Alta rápida por categoría — solo cuando la comida tiene objetivo
                            fijado por el coach, para ir directo a lo que falta. */}
                        {meal.items.length > 0 && CATS.some(c => (meal.target?.[c] ?? 0) > 0) && (() => {
                          const mDone = mealDoneByCat[meal.id] ?? {} as Record<FoodCategory, number>;
                          return (
                            <div className="flex gap-2 flex-wrap pt-1">
                              {BUDGET_CATS.filter(cat => (meal.target?.[cat] ?? 0) > 0).map(cat => {
                                const missing = (meal.target![cat]! - (mDone[cat] ?? 0)) > 0;
                                return (
                                  <button
                                    key={cat}
                                    onClick={() => handleOpenAddPicker(meal.id, cat)}
                                    className={`px-3 py-1.5 rounded-full font-mono text-caption font-bold uppercase tracking-wider border transition-all active:scale-95 ${
                                      missing
                                        ? 'bg-accent-bg border-accent-line text-accent hover:bg-accent/20'
                                        : 'bg-raised border-hairline text-ink-2 hover:border-hairline'
                                    }`}
                                  >+ {CHIP_LABEL[cat]}</button>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {meal.items.length > 0 && (
                          <button
                            onClick={() => handleOpenAddPicker(meal.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-surface border border-dashed border-hairline text-ink-2 hover:border-accent/50 hover:text-accent transition-colors active:scale-[0.99]"
                          >
                            <span className="w-8 h-8 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                              <Icon name="add" size="s" className="text-accent" />
                            </span>
                            <span className="font-sans text-body-s font-semibold">Añadir alimento del banco</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="flex items-start gap-2 bg-surface border border-hairline rounded-field px-4 py-3">
                  <Icon name="info" size="s" className="text-accent/70 flex-shrink-0 mt-1" />
                  <span className="font-sans text-caption text-ink-3 leading-relaxed">
                    Cambiar un alimento no toca tu presupuesto: la app ajusta los gramos para que valga los mismos intercambios.
                  </span>
                </p>
                <button
                  onClick={addMeal}
                  className="w-full py-3 rounded-control border border-dashed border-hairline text-ink-2 font-sans text-label font-bold uppercase tracking-wider hover:border-accent/40 hover:text-accent transition-all"
                >
                  + Añadir comida
                </button>
              </div>

              {/* Autoguardado — sin botón "Guardar": el estado refleja lo que
                  el autoguardado (más arriba) ya está haciendo solo. La
                  etiqueta avisa de antemano si lo que se está a punto de
                  guardar es un fork (dieta del coach, editada). */}
              {(() => {
                const willFork = !selectedDiet.selfManaged && isDirty;
                const statusLabel = saving
                  ? 'Guardando...'
                  : willFork
                  ? 'Se guardará como copia tuya'
                  : isDirty
                  ? 'Cambios pendientes de autoguardar'
                  : 'Todo guardado';
                return (
                  <div className="sticky bottom-20 md:bottom-4 flex items-center justify-between gap-3 bg-raised border border-hairline rounded-surface p-3 shadow-e1">
                    <span className="font-mono text-caption text-ink-2 uppercase tracking-wider pl-1">
                      {statusLabel}
                    </span>
                    <button
                      onClick={handleSaveAsMenu}
                      disabled={savingMenu}
                      title="Guardar el día entero para repetirlo más adelante"
                      className="flex-none px-3 py-2 bg-white/8 text-ink font-sans font-bold text-label uppercase rounded-control hover:bg-white/12 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap"
                    >
                      {savingMenu ? 'Guardando...' : 'Guardar como menú'}
                    </button>
                  </div>
                );
              })()}
            </React.Fragment>
          )}
        </>
      )}

      {/* "Mis dietas" — gestión de todas las dietas del atleta (programada
          hoy / del coach / propias), sustituye la antigua pestaña separada. */}
      {misDietasOpen && (() => {
        const scheduledTodayId = weeklySchedule[TODAY_WD] ?? null;
        const scheduledToday = allDietsList.filter(d => d.id === scheduledTodayId);
        const fromCoach = allDietsList.filter(d => d.id !== scheduledTodayId && !d.selfManaged);
        const own = allDietsList.filter(d => d.id !== scheduledTodayId && d.selfManaged && !d.menuTemplate);
        const savedMenus = allDietsList.filter(d => d.id !== scheduledTodayId && d.menuTemplate);
        const renderGroup = (label: string, list: Diet[]) => list.length === 0 ? null : (
          <div className="space-y-1">
            <p className="font-mono text-caption text-ink-2 uppercase tracking-wider px-1">{label}</p>
            {list.map(dt => {
              const dPlaced = computeDietPlaced(dt.meals);
              const chips = BUDGET_CATS.filter(cat => dt.budget[cat] > 0)
                .map(cat => `${CHIP_LABEL[cat]} ${fmtQty(dPlaced[cat])}/${fmtQty(dt.budget[cat])}`)
                .join(' · ');
              return (
                <ListRow
                  key={dt.id}
                  title={dt.name}
                  subtitle={chips || 'Sin alimentos todavía'}
                  leading={
                    <span className="w-9 h-9 rounded-control bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                      <Icon name={dt.menuTemplate ? 'restaurant_menu' : dt.selfManaged ? 'bookmark' : 'military_tech'} size="s" className="text-ink-2" />
                    </span>
                  }
                  trailing={
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleDuplicateDiet(dt)}
                        title="Duplicar"
                        aria-label={`Duplicar ${dt.name}`}
                        className="text-ink-2 hover:text-accent transition-colors p-2"
                      >
                        <Icon name="content_copy" size="s" />
                      </button>
                      {dt.selfManaged && (
                        <button
                          type="button"
                          onClick={() => setDietPendingDelete(dt)}
                          title="Eliminar"
                          aria-label={`Eliminar ${dt.name}`}
                          className="text-ink-2 hover:text-red-400 transition-colors p-2"
                        >
                          <Icon name="delete" size="s" />
                        </button>
                      )}
                    </div>
                  }
                  onClick={() => { handleSelectDiet(dt); setMisDietasOpen(false); }}
                />
              );
            })}
          </div>
        );
        return (
          <Sheet
            open
            onClose={() => setMisDietasOpen(false)}
            title="Mis dietas"
            size="l"
            footer={<Button variant="primary" icon="add" fullWidth onClick={handleStartBlankFromSheet}>Nueva dieta</Button>}
          >
            <div className="space-y-4">
              {renderGroup(`Programada hoy (${WD_FULL[TODAY_WD]})`, scheduledToday)}
              {renderGroup('De tu entrenador', fromCoach)}
              {renderGroup('Tuyas', own)}
              {renderGroup('Tus menús guardados', savedMenus)}
            </div>
          </Sheet>
        );
      })()}

      {/* Confirmar borrado de una dieta propia */}
      {dietPendingDelete && (
        <Dialog
          open
          onClose={() => setDietPendingDelete(null)}
          title="¿Eliminar esta dieta?"
          size="s"
          footer={(
            <>
              <Button onClick={() => setDietPendingDelete(null)} variant="secondary">Cancelar</Button>
              <Button onClick={confirmDeleteDiet} variant="danger" loading={deletingDiet}>Eliminar</Button>
            </>
          )}
        >
          <p className="text-body-s text-ink-2">
            Se eliminará «{dietPendingDelete.name}». Si estaba programada algún día de la semana, dejará de estarlo.
          </p>
        </Dialog>
      )}

      {/* Recipe picker sheet */}
      {recipePickerMealId && (() => {
        const targetMeal = selectedDiet?.meals.find(m => m.id === recipePickerMealId);
        return (
          <Sheet
            open
            onClose={() => setRecipePickerMealId(null)}
            title="Usar receta"
            alto="completo"
            toolbar={(
              <>
                {targetMeal && (
                  <div className="px-4 pb-2 font-mono text-caption text-ink-2 uppercase">
                    {mealLabel(targetMeal.name, (selectedDiet?.meals.indexOf(targetMeal) ?? 0) + 1)}
                  </div>
                )}

              {/* Fuente: recetas propias/del coach vs. el recetario del catálogo */}
              <div className="px-4 pb-2 flex gap-2">
                {([
                  { id: 'mias' as const, label: 'Mis recetas' },
                  { id: 'recetario' as const, label: 'Recetario' },
                ]).map(src => (
                  <button
                    key={src.id}
                    onClick={() => setRecipeSource(src.id)}
                    className={`px-3 py-2 rounded-control font-sans text-caption font-bold uppercase tracking-wider transition-all ${
                      recipeSource === src.id
                        ? 'bg-accent text-on-accent'
                        : 'bg-raised text-ink-2 border border-hairline hover:border-accent/50'
                    }`}
                  >{src.label}</button>
                ))}
              </div>

              {/* Search */}
              <div className="px-4 py-2 bg-surface flex items-center gap-2 border-b border-hairline">
                <Icon name="search" size="s" className="text-ink-2" />
                <input
                  type="text"
                  placeholder="Buscar receta..."
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                  className="w-full bg-transparent border-none text-ink text-title-s focus:ring-0 focus:outline-none p-2 placeholder-ink-2/45"
                />
              </div>

              {/* Category filter */}
              {recipeSource === 'mias' ? (
                availableRecipeCats.length > 0 && (
                  <div className="px-4 py-2 bg-surface border-b border-hairline flex gap-2 overflow-x-auto hide-scrollbar">
                    {[{ id: 'all', label: 'Todas' }, ...availableRecipeCats.map(c => ({ id: c, label: c }))].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setRecipeCatFilter(cat.id)}
                        className={`px-3 py-2 rounded-full font-sans text-caption font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                          recipeCatFilter === cat.id
                            ? 'bg-accent text-black'
                            : 'bg-raised text-ink-2 border border-transparent hover:border-hairline'
                        }`}
                      >{cat.label}</button>
                    ))}
                  </div>
                )
              ) : (
                <div className="px-4 py-2 bg-surface border-b border-hairline flex gap-2 overflow-x-auto hide-scrollbar">
                  {RECETAS_CATS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setRecetarioCat(cat)}
                      className={`px-3 py-2 rounded-full font-sans text-caption font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                        recetarioCat === cat
                          ? 'bg-accent text-black'
                          : 'bg-raised text-ink-2 border border-transparent hover:border-hairline'
                      }`}
                    >{cat}</button>
                  ))}
                </div>
              )}
              </>
            )}
          >
              {/* Recipe list */}
              <div className="pt-4 space-y-2">
                {recipeSource === 'mias' ? (
                  sortedPickerRecipes.length === 0 ? (
                    <div className="text-center py-10 font-mono text-label text-ink-2 italic">
                      {recipes.length === 0 ? 'El coach todavía no ha publicado recetas.' : 'Ninguna receta coincide.'}
                    </div>
                  ) : sortedPickerRecipes.map(recipe => (
                    <RecipePickerRow key={recipe.id} recipe={recipe} isFav={recipeFavorites.recipeIds.includes(recipe.id)} enabledModes={enabledModes} onSelect={handleApplyRecipe} />
                  ))
                ) : recetarioLoading ? (
                  <div className="text-center py-10 font-mono text-label text-ink-2 italic">Cargando recetario…</div>
                ) : sortedRecetarioResults.length === 0 ? (
                  <div className="text-center py-10 font-mono text-label text-ink-2 italic">Ninguna receta coincide.</div>
                ) : (
                  <>
                    {sortedRecetarioResults.map(recipe => (
                      <RecipePickerRow key={recipe.id} recipe={recipe} isFav={recipeFavorites.recipeIds.includes(recipe.id)} enabledModes={enabledModes} onSelect={handleApplyRecipe} />
                    ))}
                    {recetarioHasMore && (
                      <button
                        onClick={handleRecetarioLoadMore}
                        disabled={recetarioLoadingMore}
                        className="w-full text-center py-3 font-sans text-label font-bold text-accent disabled:opacity-50"
                      >
                        {recetarioLoadingMore ? 'Cargando…' : 'Cargar más'}
                      </button>
                    )}
                  </>
                )}
              </div>
          </Sheet>
        );
      })()}

      {/* Ver la receta de una comida del plan, y cambiarla desde dentro */}
      {recetaAbierta && (
        <Dialog open onClose={cerrarReceta} size="l" title={recetaDetalle?.name ?? 'Receta'}>
          <div className="space-y-3">
            {cargandoReceta ? (
              <div className="flex items-center justify-center py-10">
                <Icon name="progress_activity" size="l" className="text-accent animate-spin" />
              </div>
            ) : recetaDetalle ? (
              <>
                {(recetaDetalle.image ?? recetaDetalle.photoUrl) && (
                  <div className="w-full aspect-[16/9] rounded-surface overflow-hidden bg-raised">
                    <img src={recetaDetalle.image ?? recetaDetalle.photoUrl} alt={recetaDetalle.name} className="w-full h-full object-cover" />
                  </div>
                )}
                {(recetaDetalle.kcal != null || recetaDetalle.cookingTime != null) && (
                  <p className="font-mono text-caption text-ink-2">
                    {[recetaDetalle.kcal != null && `${recetaDetalle.kcal} kcal`,
                      recetaDetalle.cookingTime != null && `${recetaDetalle.cookingTime} min`]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}
                {(recetaDetalle.ingredientsText?.length || recetaDetalle.ingredients?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Ingredientes</p>
                    <ul>
                      {(recetaDetalle.ingredientsText?.length
                        ? recetaDetalle.ingredientsText.map(i => ({ label: i.name, qty: `${i.quantity}g` }))
                        : (recetaDetalle.ingredients ?? []).map(i => ({ label: i.foodLabel, qty: `×${i.quantity}` }))
                      ).map((ing, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 py-1 border-b border-hairline last:border-0">
                          <span className="text-label font-sans flex-1 pr-2">{ing.label}</span>
                          <span className="font-mono text-caption text-ink-2 flex-shrink-0">{ing.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {recetaDetalle.stepsText?.length ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Preparación</p>
                    <ol className="space-y-2">
                      {recetaDetalle.stepsText.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-mono text-caption text-accent flex-shrink-0">{s.position ?? i + 1}</span>
                          <span className="text-label font-sans text-ink-2">{s.description}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              // Sin conexión o receta borrada: se dice, y el cambio se deja
              // disponible igual — no poder leerla no impide querer otra.
              <p className="font-sans text-label text-ink-2 py-6 text-center">
                No se pudo cargar la receta. Puedes cambiarla de todas formas.
              </p>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const { mealId, recipeId } = recetaAbierta;
                cerrarReceta();
                handleOpenSwapPicker(mealId, recipeId);
              }}
            >
              Cambiar por otra receta
            </Button>
          </div>
        </Dialog>
      )}

      {/* Cambiar comida sheet */}
      {swapContext && (
        <Sheet
          open
          onClose={handleCloseSwap}
          alto="completo"
          title="Cambiar comida"
          toolbar={
            <div className="px-4 pb-3 space-y-3">
              {swapSourceRecipe && (
                <div className="font-sans text-caption text-ink-2">
                  Mismos intercambios que <span className="text-ink font-bold">{swapSourceRecipe.name}</span>
                  {' · '}
                  <span className="font-mono text-accent">
                    {fmtQty(recipeExchanges(swapSourceRecipe).HC + recipeExchanges(swapSourceRecipe).PROT + recipeExchanges(swapSourceRecipe).GRASA)} int.
                  </span>
                </div>
              )}
              <input
                value={swapSearch}
                onChange={e => setSwapSearch(e.target.value)}
                placeholder="Buscar entre las alternativas…"
                className="w-full px-3 py-2 bg-raised border border-hairline rounded-control font-sans text-label text-ink placeholder:text-ink-2 focus:border-accent/40 outline-none"
              />
              {/* Familias de plato disponibles. Es la respuesta directa a "no me
                  apetece otro batido": un toque y la lista cambia de familia. */}
              {swapDishTypes.length > 1 && (
                <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
                  <button
                    onClick={() => setSwapDishFilter(null)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full font-sans text-caption font-bold border transition-colors ${
                      swapDishFilter === null
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : 'bg-surface border-hairline text-ink-2 hover:text-ink'}`}
                  >
                    Todo ({swapCandidates.length})
                  </button>
                  {swapDishTypes.map(({ type, count }) => (
                    <button
                      key={type}
                      onClick={() => setSwapDishFilter(t => t === type ? null : type)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full font-sans text-caption font-bold border transition-colors ${
                        swapDishFilter === type
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-surface border-hairline text-ink-2 hover:text-ink'}`}
                    >
                      {dishTypeLabel(type)} ({count})
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        >
            <div className="pt-2 space-y-2">
              {swapLoading ? (
                <div className="space-y-2 pt-2">
                  {[0, 1, 2, 3].map(i => <div key={i}><Skeleton className="h-20 w-full rounded-control" /></div>)}
                </div>
              ) : !swapSourceRecipe ? (
                <div className="text-center py-10 font-sans text-label text-ink-2 italic">
                  No se ha podido cargar la receta original.
                </div>
              ) : visibleSwapCandidates.length === 0 ? (
                <div className="text-center py-10 font-sans text-label text-ink-2 italic">
                  {swapSearch || swapDishFilter
                    ? 'Ninguna alternativa coincide con este filtro.'
                    : 'Sin alternativas con los mismos intercambios que respeten tus alergias y preferencias.'}
                </div>
              ) : visibleSwapCandidates.map(alt => (
                <SwapCandidateRow
                  key={alt.recipe.id}
                  alt={alt}
                  isFav={recipeFavorites.recipeIds.includes(alt.recipe.id)}
                  onSelect={handleApplySwap}
                />
              ))}
            </div>
        </Sheet>
      )}

      {/* Food picker sheet. T13: alto="completo" — mismo motivo que el
          selector del coach: con la barra de modos/categorías/buscador
          encima, "auto" dejaba la lista en un tercio de pantalla. */}
      {pickerItem && (() => {
        const totalAdded = Object.values<number>(pickerAddedCounts).reduce((a, b) => a + b, 0);
        return (
        <Sheet
          open
          onClose={() => setPickerItem(null)}
          title={pickerItem.itemIdx === null ? 'Añadir alimento' : 'Cambiar alimento'}
          alto="completo"
          footer={
            pickerItem.itemIdx === null ? (
              <Button onClick={() => setPickerItem(null)} fullWidth>
                {totalAdded > 0 ? `Hecho · ${totalAdded} añadido${totalAdded === 1 ? '' : 's'}` : 'Hecho'}
              </Button>
            ) : undefined
          }
          toolbar={(
            <>
              <div className="px-4 pb-2 font-sans text-caption text-ink-2 uppercase">
                {isSearchingFoods ? `Todas las categorías · ${MODE_LABEL[activeDietMode]}` : `${CAT_LABEL[pickerCategory]} · ${MODE_LABEL[activeDietMode]}`}
              </div>

            {enabledModes.length > 1 && (
              <div className="px-4 py-2 bg-bg border-b border-hairline flex gap-2 flex-wrap">
                {enabledModes.map(mode => (
                  <button key={mode} onClick={() => setActiveDietMode(mode)}
                    className={`px-3 py-1 rounded-full font-sans text-caption font-bold uppercase tracking-wider transition-all ${activeDietMode === mode ? 'bg-accent text-black' : 'bg-raised text-ink-2 border border-hairline'}`}
                  >{MODE_LABEL[mode]}</button>
                ))}
              </div>
            )}

            <div className={`p-3 bg-surface border-b border-hairline flex gap-2 flex-wrap transition-opacity ${isSearchingFoods ? 'opacity-40' : ''}`}>
              {CATS.map(cat => (
                <button key={cat} onClick={() => { setPickerCategory(cat); setSearchTerm(''); }}
                  className={`px-3 py-2 rounded-full font-sans text-caption font-bold uppercase tracking-wider transition-all ${pickerCategory === cat && !isSearchingFoods ? 'bg-accent text-black' : 'bg-raised text-ink-2 border border-transparent hover:border-hairline'}`}
                >{cat.replace('_', ' ')}</button>
              ))}
            </div>

            <div className="px-4 py-2 bg-surface flex items-center gap-2 border-b border-hairline">
              <Icon name="search" size="s" className="text-ink-2" />
              <input type="text" placeholder="Buscar en todas las categorías..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-ink text-title-s focus:ring-0 focus:outline-none p-2 placeholder-ink-2/45"
              />
            </div>
            </>
          )}
        >
            <div className="pt-4 space-y-2">
              {filteredFoods.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title={searchTerm ? `Nada para «${searchTerm}»` : 'Sin alimentos en esta categoría.'}
                  description={searchTerm ? 'Prueba con otra palabra o cambia de categoría.' : undefined}
                  actionLabel={searchTerm ? 'Quitar búsqueda' : undefined}
                  onAction={searchTerm ? () => setSearchTerm('') : undefined}
                />
              ) : filteredFoods.map(food => {
                const veces = pickerAddedCounts[food.id] ?? 0;
                const reciente = pickerRecentlyAdded === food.id;
                return (
                  <button key={food.id} onClick={() => handleSelectFood(food)}
                    className={`w-full flex items-center gap-3 p-4 rounded-control border text-left transition-all active:scale-[0.98] group ${
                      reciente ? 'bg-success/10 border-success/40' : 'bg-surface hover:bg-raised border-hairline hover:border-accent/40'
                    }`}
                  >
                    {isSearchingFoods && (
                      <span className={`text-caption font-mono font-bold px-2 rounded-control border flex-shrink-0 ${CAT_BG[food.category]} ${CAT_COLOR[food.category]}`}>
                        {food.category.replace('_', ' ')}
                      </span>
                    )}
                    <span className="flex-1 block font-sans text-label text-ink group-hover:text-accent transition-colors leading-snug">{food.label}</span>
                    {reciente ? (
                      <span className="flex items-center gap-1 flex-shrink-0 text-success">
                        <Icon name="check_circle" size="m" />
                        {veces > 1 && <span className="font-mono text-caption font-bold">×{veces}</span>}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
                    )}
                  </button>
                );
              })}
            </div>
        </Sheet>
        );
      })()}

      {/* Hoja de ajuste (F3.8, panel 02) — steppers por macro, píldora de encaje en vivo */}
      {/* Pantalla de reparto — cuánto del cupo diario fijo (`selectedDiet.budget`,
          lo fija el coach) asigna el atleta a cada comida. Un solo botón la abre
          para TODAS las comidas a la vez, tamaño mediano (no pantalla completa). */}
      {repartoSheetOpen && selectedDiet && (
        <Sheet
          open
          onClose={() => setRepartoSheetOpen(false)}
          title="Editar distribución de intercambios"
          size="m"
          footer={<Button variant="primary" size="l" fullWidth onClick={() => setRepartoSheetOpen(false)}>Guardar</Button>}
        >
          <div className="pt-2 space-y-3">
            <p className="font-sans text-body-s text-ink-2">
              El total del día lo fija tu coach. Reparte cuánto de ese cupo va a cada comida.
            </p>

            {/* Restantes por repartir — siempre visible, no solo cuando no
                cuadra, para que se vea en vivo mientras se mueven los
                steppers de abajo. */}
            <div className="bg-raised border border-hairline rounded-field p-3 flex flex-wrap gap-x-4 gap-y-1">
              {BUDGET_CATS.map(cat => {
                const left = round2((selectedDiet.budget[cat] ?? 0) - mealTargetSumByCat[cat]);
                return (
                  <div key={cat} className="flex items-center gap-1.5">
                    <span className={`font-mono text-caption font-bold ${CAT_COLOR[cat]}`}>{cat}</span>
                    <span className={`font-mono text-caption ${left < 0 ? 'text-red-400' : left === 0 ? 'text-green-400' : 'text-ink-2'}`}>
                      {left === 0 ? 'repartido' : left > 0 ? `quedan ${fmtQty(left)}` : `te pasas ${fmtQty(-left)}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {selectedDiet.meals.map((meal, mi) => (
              <div key={meal.id} className="bg-field border border-hairline rounded-field p-3">
                <p className="font-sans font-bold text-body-s text-ink mb-3">{mealLabel(meal.name, mi + 1)}</p>
                <div className="flex flex-col gap-2">
                  {BUDGET_CATS.map(cat => (
                    <div key={cat} className="flex items-center justify-between gap-3">
                      <span className={`font-mono text-caption font-bold tracking-[.08em] ${CAT_COLOR[cat]}`}>{BAR_LABEL[cat]}</span>
                      <Stepper
                        label={`${BAR_LABEL[cat]} de ${mealLabel(meal.name, mi + 1)}`}
                        value={meal.target?.[cat] ?? 0}
                        onChange={v => updateMealTargetCat(meal.id, cat, round2(v - (meal.target?.[cat] ?? 0)))}
                        step={0.25}
                        min={0}
                        max={12}
                        dense
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      )}


      {/* Choose which diet to add a recipe to (hand-off from Recetas, first step) */}
      {chooseDietForRecipe && (
        <Sheet
          open
          onClose={() => setChooseDietForRecipe(null)}
          title={`¿A qué dieta añadir "${chooseDietForRecipe.name}"?`}
          size="m"
          footer={<Button variant="ghost" onClick={() => setChooseDietForRecipe(null)} fullWidth>Cancelar</Button>}
        >
            <div className="space-y-2 pt-2">
              {allDietsList.map(dt => (
                <button
                  key={dt.id}
                  onClick={() => handleChooseDietForRecipe(dt)}
                  className="w-full flex items-center justify-between p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all"
                >
                  <span className="text-body-s text-ink font-sans truncate">{dt.name}</span>
                  <span className="material-symbols-outlined text-ink-2 text-title-s flex-shrink-0">add_circle</span>
                </button>
              ))}
              <button
                onClick={() => handleChooseDietForRecipe('new')}
                className="w-full flex items-center justify-between p-4 bg-surface hover:bg-raised rounded-control border border-dashed border-accent/40 hover:border-accent text-left transition-all"
              >
                <span className="text-body-s text-accent font-sans font-bold">Nueva dieta</span>
                <span className="material-symbols-outlined text-accent text-title-s flex-shrink-0">add_circle</span>
              </button>
            </div>
        </Sheet>
      )}

      {/* Choose which meal to add a recipe to (hand-off from Recetas, multi-meal case) */}
      {chooseMealForRecipe && selectedDiet && (
        <Sheet
          open
          onClose={() => setChooseMealForRecipe(null)}
          title={`¿A qué comida añadir "${chooseMealForRecipe.name}"?`}
          size="m"
          footer={<Button variant="ghost" onClick={() => setChooseMealForRecipe(null)} fullWidth>Cancelar</Button>}
        >
            <div className="space-y-2 pt-2">
              {selectedDiet.meals.map((meal, mi) => (
                <button
                  key={meal.id}
                  onClick={() => { addRecipeToMeal(chooseMealForRecipe, meal.id, selectedDiet); setChooseMealForRecipe(null); }}
                  className="w-full flex items-center justify-between p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all"
                >
                  <span className="text-body-s text-ink font-sans">{mealLabel(meal.name, mi + 1)}</span>
                  <span className="material-symbols-outlined text-ink-2 text-title-s">add_circle</span>
                </button>
              ))}
            </div>
        </Sheet>
      )}
    </div>
  );
}
