import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Diet, DietMeal, DietItem, FoodCategory, DietMode, MealItem, Recipe, RecipeFavorites, RefeedDay } from '../types';
import { getDietsForAthlete, getAthleteDietConfig, saveAthleteDietConfig, createDiet, updateDiet, deleteDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, saveAthleteNutritionConfig, getRecipes, getRecipeFavorites, getNutritionProgram, markNutritionPhaseSeen, computeActivePhase, createNotificationDeduped, getDietCompletionLog, saveDietCompletionLog, createRecipe, queryRecetas, queryRecetasForGenerator, getOnboarding, getRecipeById } from '../dbService';
import type { RecetasCursor } from '../dbService';
import { CATS, BUDGET_CATS, CAT_LABEL, CAT_COLOR, CAT_BG, MODE_LABEL, ALL_DIET_MODES, round2, fmtQty, itemWeightLabel, foodNameWithoutGrams, addToPlaced, recipeToDietItems, computeDietPlaced } from '../utils/exchangeHelpers';
import { findRecipeAlternatives, recipeExchanges, groupByDishType, ordenarPorCupo, type RecipeAlternative, type AlternativePrefs } from '../utils/recipeMatch';
import { ingredientMatch, violatesDietType } from '../utils/foodPrefs';
import { dishType, dishTypeLabel, type DishType } from '../utils/dishTypes';
import { filasDeComida, escalarReceta } from '../utils/filasDelPlan';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { useToast } from '../hooks/useToast';
import Coachmark from './Coachmark';
import { haptics } from '../services/haptics';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import FotoDeReceta from './FotoDeReceta';
import { Skeleton } from './ui';
import { EmptyState, Sheet, Icon, Button, ProgressBar, RingSeal, Stepper, Dialog, ListRow, Input } from './ui';
import MealItemSwipeRow from './nutrition/MealItemSwipeRow';
import { NotaDeFuente } from './FuentesCientificasSheet';

import {
  COACH_EMAIL, makeId, dietSnapshot, estructuraDeDia, fechaLarga,
  WD_FULL,
  mealLabel, BAR_LABEL, CHIP_LABEL, ItemState,
} from './nutrition/dietHelpers';
import { useDiaActual, diaSemanaDe } from '../hooks/useDiaActual';
import { addDays } from '../utils/trainingWeek';

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
  'Alimentos y suplementos',
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
  const photo = fotoDeReceta(recipe);
  return (
    <button
      onClick={() => onSelect(recipe)}
      className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all group"
    >
      <FotoDeReceta
        src={photo}
        alt=""
        className="w-12 h-12 rounded-surface object-cover flex-shrink-0"
        fallback={(
          <div className="w-12 h-12 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
            <Icon name="skillet" size="m" className="text-ink-2" />
          </div>
        )}
      />
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
      <FotoDeReceta
        src={fotoDeReceta(recipe)}
        alt={recipe.name}
        className="w-12 h-12 rounded-surface object-cover flex-shrink-0"
        fallback={(
          <div className="w-12 h-12 rounded-surface bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-ink-2 text-title-m">skillet</span>
          </div>
        )}
      />
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

  /* Qué día se está viendo (YYYY-MM-DD). Antes esto era un día de la SEMANA
     (`viewDay: WeekDay`) porque el plan lo ponía el coach en un calendario
     semanal y los otros días eran solo una ficha de consulta. Ahora el plan es
     del atleta y de cada día concreto, así que se navega por fechas reales y
     cualquier día pasado se puede editar igual que hoy. */
  const { fecha: hoyFecha } = useDiaActual();
  const [viewDate, setViewDate] = useState(hoyFecha);
  const viendoHoy = viewDate === hoyFecha;
  // Si la app cruza la medianoche con la pantalla abierta en "hoy", "hoy" pasa
  // a ser el día nuevo — sin esto se quedaría escribiendo en el día anterior.
  const hoyPrevioRef = useRef(hoyFecha);
  useEffect(() => {
    if (hoyPrevioRef.current === hoyFecha) return;
    setViewDate(prev => (prev === hoyPrevioRef.current ? hoyFecha : prev));
    hoyPrevioRef.current = hoyFecha;
  }, [hoyFecha]);

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
    queryKey: ['recipes', profile.userId],
    queryFn: () => getRecipes({ ownerId: profile.userId }).catch(() => [] as Recipe[]),
    enabled: !loadingPhase1,
  });
  const setRecipes = (updater: React.SetStateAction<Recipe[]>) =>
    queryClient.setQueryData<Recipe[]>(['recipes', profile.userId], prev =>
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

  /* ── El registro del día que se está viendo ────────────────────────────────
     Este documento ES el plan de ese día: qué comidas tenía y cuáles se
     comieron. Antes el plan vivía en una `Diet` compartida por todos los días y
     el registro guardaba solo marcas de "hecho" que apuntaban a ella por
     posición; de ahí venían los dos fallos que veía el atleta —al reabrir la
     app el día aparecía vacío, y el histórico se reescribía solo al editar la
     dieta. Ver el comentario de `DietCompletionLog.meals` en types.ts. */
  const diaKey = ['dietCompletionLog', profile.email, viewDate] as const;
  const { data: diaLog = null, isPending: loadingDia } = useQuery({
    queryKey: diaKey,
    queryFn: () => getDietCompletionLog(profile.email, viewDate),
    enabled: !loadingPhase1,
  });

  /* Cupo pautado por el coach. Es lo ÚNICO que el coach fija en nutrición: ya
     no programa comidas (nunca lo hizo — las pauta con el menú semanal), así
     que su "dieta" es solo el presupuesto de intercambios del día. Sale de la
     fase activa de periodización si la hay, y si no de la dieta activa. */
  const cupoPautado = useMemo(() => {
    // El coach puede tener cupos distintos por día (el "día A/B/C" del
    // calendario semanal, que sigue usando el generador de menús): se respeta
    // el del día que se está mirando, no el de hoy.
    const programada = dietConfigRaw?.weeklySchedule?.[diaSemanaDe(viewDate)];
    const activos = new Set(dietConfigRaw?.activeDietIds ?? []);
    const pautada =
      (programada && allDietsList.find(d => d.id === programada))
      || allDietsList.find(d => activos.has(d.id) && !d.selfManaged)
      || allDietsList.find(d => !d.selfManaged)
      || null;
    return pautada?.budget ?? null;
  }, [allDietsList, dietConfigRaw, viewDate]);

  const loading = loadingPhase1 || loadingFoodItems || loadingRecipesQ || loadingFavs || loadingDia;

  // ── Local editor/draft state — seeded once from the queries above, then
  // mutated locally as the athlete edits (this is a live editor, not a
  // read-only view, so it can't just be the query data directly) ───────────
  const [selectedDiet, setSelectedDiet] = useState<Diet | null>(null);
  const [savedDietSnapshot, setSavedDietSnapshot] = useState('');
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
  /* Al abrir el recetario desde una comida se pregunta primero contra qué cupo
     hay que cuadrar: el de ESA comida o el que queda del día entero. Son dos
     respuestas distintas —a media tarde te sobra medio día pero la merienda ya
     está casi llena— y adivinarlo por el atleta se equivocaba la mitad de las
     veces. `null` = todavía no ha contestado; la hoja de recetas no se abre
     hasta que lo haga. */
  const [preguntaAmbito, setPreguntaAmbito] = useState<string | null>(null);
  const [ambitoCupo, setAmbitoCupo] = useState<'comida' | 'dia'>('dia');
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

  // "Añadir a Intercambios" desde Recetas — solo queda elegir la comida del día
  // (antes había un paso previo para elegir la dieta; ya no hay dietas).
  const [chooseMealForRecipe, setChooseMealForRecipe] = useState<Recipe | null>(null);


  // Nutrition periodization
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  /** Recarga que el coach ha marcado para HOY (NutritionProgram.refeedDays). */
  const [refeedHoy, setRefeedHoy] = useState<RefeedDay | null>(null);

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
      const dietConfig = dietConfigRaw;
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

      // Día de recarga marcado por el coach para hoy — es solo un aviso.
      setRefeedHoy((program?.refeedDays ?? []).find(r => r.date === hoyFecha) ?? null);
    })().catch(err => console.error('NutritionScreen init error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPhase1, profile.email]);

  /* ── Cargar en el editor el día que se está viendo ─────────────────────────

     Un solo sitio decide qué se ve: el registro de ESE día. Antes eran dos
     efectos peleándose —uno elegía una `Diet` (la programada por el coach
     ganaba a la que el atleta estaba usando) y otro le pegaba encima las
     marcas de "hecho", que se descartaban enteras si el `dietId` del registro
     no coincidía con la dieta elegida. Resultado práctico: registrabas el
     desayuno, salías, volvías y no había nada, hasta que ibas a "Mis dietas" y
     elegías a mano la dieta buena. Eso ya no puede pasar: no hay nada que
     elegir, el día es el día.

     `cargadoPara` evita repisar lo que el atleta está editando: el efecto solo
     siembra el editor cuando de verdad cambia el día que se mira. */
  const cargadoPara = useRef<string | null>(null);
  useEffect(() => {
    if (loadingPhase1 || loadingDia) return;
    const marca = `${profile.email}_${viewDate}`;
    if (cargadoPara.current === marca) return;
    cargadoPara.current = marca;

    const meals: DietMeal[] = diaLog?.meals?.length
      ? diaLog.meals
      : estructuraDeDia((onboarding?.meals ?? []).map(m => ({ name: m.name, slot: m.intakeType })));
    const plan: Diet = {
      id: `dia_${viewDate}`,
      athleteId: profile.email,
      name: `Plan del ${WD_FULL[diaSemanaDe(viewDate)]}`,
      budget: diaLog?.budget ?? cupoPautado ?? { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
      meals,
      selfManaged: true,
    };

    const hechos = new Set(diaLog?.doneItemIds ?? []);
    const estados: Record<string, ItemState> = {};
    const counts: Record<string, number> = {};
    for (const meal of meals) {
      counts[meal.id] = meal.items.length;
      meal.items.forEach((item, idx) => {
        const key = `${meal.id}_${idx}`;
        estados[key] = { foodLabel: item.foodLabel, done: hechos.has(key) };
      });
    }
    setSelectedDiet(plan);
    setSavedDietSnapshot(dietSnapshot(plan));
    setItemStates(estados);
    setOrigItemCounts(counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPhase1, loadingDia, viewDate, diaLog, cupoPautado, profile.email]);

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

  // Presupuesto efectivo del tracker. Una dieta del coach trae su cupo en
  // `budget`; un menú propio en construcción no tiene cupo (todo a 0), así que
  // el baseline de las barras y del "te quedan" es lo que el propio menú suma
  // —no cero—. Sin esto, marcar el único alimento de un menú a medio montar
  // llenaba las barras al 100 % y cerraba el día "en presupuesto".
  const plannedByCat = useMemo(() => computeDietPlaced(selectedDiet?.meals), [selectedDiet]);
  const effBudget: Record<'HC' | 'PROT' | 'GRASA', number> = {
    HC: (selectedDiet?.budget.HC ?? 0) || plannedByCat.HC,
    PROT: (selectedDiet?.budget.PROT ?? 0) || plannedByCat.PROT,
    GRASA: (selectedDiet?.budget.GRASA ?? 0) || plannedByCat.GRASA,
  };

  // "TE QUEDAN" del tracker — suma de las tres categorías de presupuesto,
  // igual que el handoff (nunca desglosa MIX_HC/MIX_GRASA en la cifra grande).
  const leftByCat = useMemo(() => ({
    HC: effBudget.HC - doneByCat.HC,
    PROT: effBudget.PROT - doneByCat.PROT,
    GRASA: effBudget.GRASA - doneByCat.GRASA,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [effBudget.HC, effBudget.PROT, effBudget.GRASA, doneByCat]);
  const totalBudget = effBudget.HC + effBudget.PROT + effBudget.GRASA;
  const totalEaten = BUDGET_CATS.reduce((s, c) => s + doneByCat[c], 0);
  const leftExch = round2(totalBudget - totalEaten);
  const leftKcal = Math.round(exchangeToKcal(leftByCat)); // puede ser negativo si el día se pasa
  // El sello "Día cerrado en presupuesto" solo sale cuando de verdad has
  // consumido tu cupo en las tres categorías —no por marcar "todos los
  // alimentos que llevas añadidos", que en un menú a medio montar era 1 y
  // cerraba el día con el presupuesto casi intacto.
  const dayClosed = totalBudget > 0
    && doneItems > 0
    && BUDGET_CATS.every(c => round2(doneByCat[c]) + 0.05 >= round2(effBudget[c]));

  // Haptic success solo en la TRANSICIÓN a día cerrado (handoff, panel 06) —
  // no en cada render mientras ya está cerrado, ni al reabrirlo desmarcando algo.
  const dayClosedRef = useRef(false);
  useEffect(() => {
    if (dayClosed && !dayClosedRef.current) void haptics.success();
    dayClosedRef.current = dayClosed;
  }, [dayClosed]);

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

  /* Lo que queda por cubrir, según lo que el atleta haya contestado: el cupo de
     ESA comida (su reparto menos lo que ya lleva puesto ahí) o el del día
     entero. Sin reparto asignado a la comida, "la comida" no tiene cupo propio
     que mirar y se cae al del día — que es la respuesta honesta, no un cero
     que dejaría la lista vacía. */
  const cupoDisponible = useMemo(() => {
    const delDia = { HC: Math.max(0, leftByCat.HC), PROT: Math.max(0, leftByCat.PROT), GRASA: Math.max(0, leftByCat.GRASA) };
    if (ambitoCupo === 'dia' || !recipePickerMealId) return delDia;
    const meal = selectedDiet?.meals.find(m => m.id === recipePickerMealId);
    const target = meal?.target;
    if (!target) return delDia;
    const puesto = mealDoneByCat[recipePickerMealId] ?? { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    return {
      HC: Math.max(0, round2(target.HC - puesto.HC)),
      PROT: Math.max(0, round2(target.PROT - puesto.PROT)),
      GRASA: Math.max(0, round2(target.GRASA - puesto.GRASA)),
    };
  }, [ambitoCupo, recipePickerMealId, selectedDiet, mealDoneByCat, leftByCat]);

  const sortedPickerRecipes = useMemo(() => {
    const withIngredients = recipes.filter(r =>
      r.ingredients.some(ing => enabledModes.includes(ing.mode))
    );
    const filtered = withIngredients.filter(r => {
      const matchCat = recipeCatFilter === 'all' || r.categories.includes(recipeCatFilter);
      const matchSearch = !recipeSearch || r.name.toLowerCase().includes(recipeSearch.toLowerCase());
      return matchCat && matchSearch && isSafeForAthlete(r);
    });
    // Solo lo que cabe en el cupo elegido, y de lo que mejor lo aprovecha en
    // adelante — ofrecer una receta que no entra no ayuda a nadie.
    return ordenarPorPreferencia(ordenarPorCupo(filtered, cupoDisponible));
  }, [recipes, enabledModes, recipeCatFilter, recipeSearch, isSafeForAthlete, ordenarPorPreferencia, cupoDisponible]);

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
    return ordenarPorPreferencia(ordenarPorCupo(buscadas, cupoDisponible));
  }, [recetarioResults, recipeSearch, isSafeForAthlete, ordenarPorPreferencia, cupoDisponible]);

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

  /** Los menús que el atleta se ha guardado para repetir (no son dietas del
   *  coach ni planes de un día: son plantillas suyas). */
  const menusGuardados = useMemo(
    () => allDietsList.filter(d => d.selfManaged),
    [allDietsList],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const isDirty = selectedDiet ? dietSnapshot(selectedDiet) !== savedDietSnapshot : false;

  /**
   * Vuelca un menú guardado sobre el día que se está viendo.
   *
   * Antes esto "cambiaba de dieta" y el día se quedaba colgando de ella; ahora
   * el menú es una plantilla que se copia y ya está —lo que pase después con
   * ella no toca este día. Los `mealId` se renuevan a propósito: si se
   * reutilizaran, las marcas de "comido" de un día que ya usó ese mismo menú
   * podrían colarse aquí.
   *
   * Todo lo que se carga entra ya como comido: si te pones el menú del día es
   * porque es lo que has comido (ver `handleAddItem`).
   */
  const cargarMenuEnElDia = (dt: Diet) => {
    const meals: DietMeal[] = dt.meals.map(m => ({ ...m, id: makeId(), items: [...m.items] }));
    const plan: Diet = { ...selectedDiet, id: `dia_${viewDate}`, athleteId: profile.email, name: dt.name, budget: selectedDiet?.budget ?? dt.budget, meals, selfManaged: true };
    const estados: Record<string, ItemState> = {};
    const counts: Record<string, number> = {};
    for (const meal of meals) {
      counts[meal.id] = 0;
      meal.items.forEach((item, idx) => { estados[`${meal.id}_${idx}`] = { foodLabel: item.foodLabel, done: true }; });
    }
    setItemStates(estados);
    setOrigItemCounts(counts);
    setSelectedDiet(plan);
  };

  /** Vaciar el día — deja la estructura de comidas pero sin alimentos. */
  const handleStartBlank = () => {
    const meals = estructuraDeDia((onboarding?.meals ?? []).map(m => ({ name: m.name, slot: m.intakeType })));
    setSelectedDiet(prev => prev ? { ...prev, meals } : prev);
    setItemStates({});
    setOrigItemCounts(Object.fromEntries(meals.map(m => [m.id, 0])));
  };

  // ── "Mis menús": los menús que el atleta se guarda para repetir ───────────

  const handleStartBlankFromSheet = () => {
    handleStartBlank();
    setMisDietasOpen(false);
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

  /* Renombrar y duplicar un menú guardado. Antes solo se podía borrar: si te
     equivocabas con el nombre, o querías una variante de "Día de entreno",
     tocaba rehacer el día entero y volver a guardarlo. */
  const [menuPendingRename, setMenuPendingRename] = useState<Diet | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingMenu, setRenamingMenu] = useState(false);
  const [duplicandoMenuId, setDuplicandoMenuId] = useState<string | null>(null);

  const abrirRenombrar = (dt: Diet) => { setRenameDraft(dt.name); setMenuPendingRename(dt); };

  const confirmRenameMenu = async () => {
    const dt = menuPendingRename;
    const nombre = renameDraft.trim();
    if (!dt || !nombre) return;
    setRenamingMenu(true);
    try {
      await updateDiet(dt.id, { name: nombre });
      setAllDietsList(prev => prev.map(d => d.id === dt.id ? { ...d, name: nombre } : d));
      showToast('Menú renombrado.', 'success');
      setMenuPendingRename(null);
    } catch (err) {
      console.error(err);
      showToast('No se pudo renombrar el menú.');
    } finally {
      setRenamingMenu(false);
    }
  };

  const handleDuplicateMenu = async (dt: Diet) => {
    setDuplicandoMenuId(dt.id);
    try {
      const copia = await createDiet({
        athleteId: profile.email,
        name: `${dt.name} (copia)`,
        budget: { ...dt.budget },
        meals: dt.meals.map(m => ({ ...m, id: makeId(), items: m.items.map(it => ({ ...it })) })),
        selfManaged: true,
        menuTemplate: dt.menuTemplate ?? true,
      });
      setAllDietsList(prev => [...prev, copia]);
      showToast('Menú duplicado.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo duplicar el menú.');
    } finally {
      setDuplicandoMenuId(null);
    }
  };

  const confirmDeleteDiet = async () => {
    const dt = dietPendingDelete;
    if (!dt) return;
    setDeletingDiet(true);
    try {
      await deleteDiet(dt.id);
      setAllDietsList(prev => prev.filter(d => d.id !== dt.id));

      // deleteDiet() no limpia la referencia a esta dieta en la config del
      // atleta — sin esto `activeDietIds` seguiría apuntando a un id borrado.
      const activeIds = dietConfigRaw?.activeDietIds ?? [];
      if (activeIds.includes(dt.id)) {
        const nextConfig = {
          ...(dietConfigRaw ?? { athleteId: profile.email }),
          activeDietIds: activeIds.filter(id => id !== dt.id),
        };
        await saveAthleteDietConfig(nextConfig).catch(() => {});
        queryClient.setQueryData(athleteDietConfigKey, nextConfig);
      }
      showToast('Menú eliminado.', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo eliminar la dieta.');
    } finally {
      setDeletingDiet(false);
      setDietPendingDelete(null);
    }
  };

  /**
   * Guarda el día que se está viendo: sus comidas y qué se ha comido de ellas.
   *
   * Una sola escritura por día (`dietCompletionLogs/{email}_{fecha}`) en vez de
   * las dos de antes —la dieta por un lado y las marcas por otro—, que era de
   * donde salía el desajuste: se guardaba una y fallaba la otra, o la dieta
   * cambiaba y las marcas quedaban apuntando a comidas que ya no existían.
   *
   * El fallo se dice. Antes esto era un `.catch(() => {})`: el atleta marcaba
   * la cena, no había red, y no se enteraba nunca de que no se había guardado.
   */
  const guardarDia = useCallback((meals: DietMeal[], doneItemIds: string[], budget: Record<FoodCategory, number>) => {
    const dietId = allDietsList.find(d => !d.selfManaged)?.id ?? '';
    const log = { athleteId: profile.email, date: viewDate, dietId, doneItemIds, meals, budget };
    queryClient.setQueryData(['dietCompletionLog', profile.email, viewDate], { ...log, id: `${profile.email}_${viewDate}` });
    return saveDietCompletionLog(log)
      .catch(() => showToast('No se pudo guardar el registro del día. Se reintentará al recargar.', 'error'));
  }, [profile.email, viewDate, allDietsList, queryClient, showToast]);

  /** Atajo para los sitios que solo cambian marcas, sin tocar las comidas. */
  const persistCompletion = (_dietId: string, doneItemIds: string[]) => {
    if (!selectedDiet) return;
    void guardarDia(selectedDiet.meals, doneItemIds, selectedDiet.budget);
  };

  /* Ya no hay `handleToggleDone` ni `handleToggleMealDone`. Marcar "comido"
     era un paso que no decidía nada: si un alimento está en tu día es porque te
     lo has comido. Se marca solo al añadirlo, y para deshacerlo se quita la
     fila (deslizando a la izquierda), que es lo que el atleta quería hacer de
     verdad cuando desmarcaba. */

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
      // Nace COMIDO. Si lo has metido en el día es porque te lo has comido: el
      // paso de "ahora deslízalo a la derecha" no aportaba nada y dejaba el cupo
      // sin descontar hasta que te acordabas de hacerlo.
      setItemStates(prev => ({ ...prev, [`${mealId}_${newIdx}`]: { foodLabel: newItem.foodLabel, done: true } }));
      setSearchTerm('');
      // El picker se queda abierto para encadenar varias añadidas seguidas
      // (ver comentario arriba) — sin esto, tocar "+" no daba ninguna señal
      // de que el toque había hecho algo.
      void haptics.light();
      // El objetivo del tour "registrar una ingesta" se cumple aquí: antes lo
      // marcaba el botón de marcar la comida entera, que ya no existe.
      tutorial.markActionDone('registrar-ingesta');
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
      // Cambiar un alimento por otro no lo "descome": es la misma ingesta, solo
      // que ahora es pasta en vez de arroz.
      const key = `${mealId}_${itemIdx}`;
      setItemStates(prev => ({ ...prev, [key]: { foodLabel: food.label, done: prev[key]?.done ?? true } }));
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

  /** Abrir el recetario desde una comida: primero la pregunta del cupo. */
  const handleOpenRecipePicker = (mealId: string) => {
    setPreguntaAmbito(mealId);
  };

  const abrirRecetarioConAmbito = (mealId: string, ambito: 'comida' | 'dia') => {
    setPreguntaAmbito(null);
    setAmbitoCupo(ambito);
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

    // Las recetas del recetario importado (pestaña «Recetario») no traen
    // `ingredients` estructurados —nunca—, solo `exchanges`. `recipeToDietItems`
    // cae a esos intercambios; el `.map` a pelo de antes devolvía [] y el sheet
    // se cerraba sin añadir nada.
    const newItems: DietItem[] = recipeToDietItems(recipe, enabledModes);

    if (newItems.length === 0) {
      showToast(`No se pudo añadir "${recipe.name}": no tiene datos de intercambios.`, 'error');
      setRecipePickerMealId(null);
      return;
    }

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
      newStates[`${recipePickerMealId}_${startIdx + i}`] = { foodLabel: item.foodLabel, done: true };
    });
    setItemStates(prev => ({ ...prev, ...newStates }));
    setRecipePickerMealId(null);
  };

  /** Quitar una receta entera: se van todos sus ítems de golpe, no uno a uno. */
  const handleRemoveReceta = (mealId: string, idxs: number[]) => {
    if (!selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const fuera = new Set(idxs);
    const quedan = meal.items.filter((_, i) => !fuera.has(i));
    const conservados = meal.items.map((_, i) => i).filter(i => !fuera.has(i));

    setSelectedDiet(prev => prev ? {
      ...prev,
      meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: quedan }),
    } : prev);

    // Reindexar: las claves de "comido" son posicionales, así que quitar por en
    // medio desplaza todo lo que venía detrás.
    setItemStates(prev => {
      const next: Record<string, ItemState> = {};
      Object.keys(prev).forEach(k => { if (!k.startsWith(`${mealId}_`)) next[k] = prev[k]; });
      conservados.forEach((viejo, nuevo) => {
        const st = prev[`${mealId}_${viejo}`];
        if (st) next[`${mealId}_${nuevo}`] = st;
      });
      return next;
    });
  };

  /** El +/− de un renglón de receta escala el plato completo. */
  const handleEscalarReceta = (mealId: string, idxs: number[], delta: number) => {
    setSelectedDiet(prev => prev ? {
      ...prev,
      meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: escalarReceta(m.items, idxs, delta) }),
    } : prev);
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
        const oldState = prev[`${mealId}_${i}`] ?? { foodLabel: meal.items[i].foodLabel, done: true };
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
        next[`${mealId}_${newIdx}`] = prev[`${mealId}_${oldIdx}`] ?? { foodLabel: item.foodLabel, done: true };
      });
      // La receta que entra al cambiar de comida también cuenta ya como comida.
      newIngredientItems.forEach((item, i) => {
        next[`${mealId}_${keptItems.length + i}`] = { foodLabel: item.foodLabel, done: true };
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

  /* Autoguardado del día. Antes esto decidía entre tres caminos —crear una
     dieta nueva, actualizar la propia, o clonar la del coach porque las reglas
     de Firestore no dejan al atleta escribir en ella— y el tercero creaba por
     detrás una dieta "(mi versión)" que al reabrir la app no se volvía a
     seleccionar. Ya no hay nada que decidir: se escribe el día, siempre en el
     mismo sitio. La pausa evita una escritura por cada tecla. */
  /* Lo pendiente de guardar, en un ref, para poder soltarlo de golpe si el
     atleta se va del día antes de que salte el temporizador. Sin esto, cambiar
     de día (o de pantalla) justo después de tocar algo se comía el cambio: la
     limpieza del efecto cancelaba el temporizador y nadie escribía nada. */
  const pendiente = useRef<{ guardar: () => void } | null>(null);
  useEffect(() => {
    if (!selectedDiet || !isDirty) { pendiente.current = null; return; }
    const plan = selectedDiet;
    const escribir = () => {
      pendiente.current = null;
      const doneItemIds = (Object.entries(itemStates) as [string, ItemState][]).filter(([, v]) => v.done).map(([k]) => k);
      setSavedDietSnapshot(dietSnapshot(plan));
      void guardarDia(plan.meals, doneItemIds, plan.budget);
    };
    pendiente.current = { guardar: escribir };
    const t = setTimeout(escribir, 1200);
    return () => clearTimeout(t);
  }, [isDirty, selectedDiet, itemStates, guardarDia]);

  /** Suelta lo pendiente ya. Se llama antes de cambiar de día y al salir. */
  const guardarYa = useCallback(() => { pendiente.current?.guardar(); }, []);
  useEffect(() => guardarYa, [guardarYa]);

  const irAlDia = (fecha: string) => {
    guardarYa();
    setViewDate(fecha);
  };

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
    newItems.forEach((item, i) => { newStates[`${mealId}_${startIdx + i}`] = { foodLabel: item.foodLabel, done: true }; });
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
    // Antes había que elegir primero A QUÉ DIETA iba la receta. Ya no hay
    // dietas entre las que elegir: la receta va al día de hoy, y lo único que
    // queda por decidir es en qué comida.
    setChooseMealForRecipe(pendingRecipe);
    onConsumedPendingRecipe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecipe, loading]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-display text-ink tracking-tight">Mi plan</h1>
        <p className="text-ink-2 text-body-s mt-1">Construye tu menú del día con intercambios.</p>
      </div>

      {/* Día de recarga marcado por el coach — va antes que el cambio de fase
          porque es lo que cambia lo que come HOY. */}
      {refeedHoy && (
        <div
          className="flex items-start gap-2.5 rounded-surface px-4 py-3"
          style={{ background: 'color-mix(in srgb, var(--color-refeed) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-refeed) 30%, transparent)' }}
        >
          <Icon name="local_fire_department" size="m" style={{ color: 'var(--color-refeed)', flexShrink: 0 }} />
          <div className="min-w-0">
            <p className="font-sans font-bold text-body-s" style={{ color: 'var(--color-refeed)' }}>Hoy toca recarga</p>
            {refeedHoy.note && <p className="font-sans text-label text-ink-2 mt-0.5">{refeedHoy.note}</p>}
          </div>
        </div>
      )}

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

      {/* Navegación por días. Antes era una fila de siete letras (L M X J V S D)
          que enseñaba QUÉ DIETA te había programado el coach cada día y no
          dejaba tocar nada fuera de hoy. Ahora son días de verdad, hacia atrás,
          y cualquiera de ellos se edita igual que hoy: si ayer se te olvidó
          apuntar la cena, la apuntas. */}
      {!loading && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => irAlDia(addDays(viewDate, -1))}
            aria-label="Día anterior"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Icon name="chevron_left" size="m" />
          </button>

          <div className="flex-1 min-w-0 text-center">
            <span className="block font-mono text-caption uppercase tracking-widest font-bold text-accent">
              {viendoHoy ? 'Hoy' : WD_FULL[diaSemanaDe(viewDate)]}
            </span>
            <span className="block font-sans text-label text-ink-2 truncate">{fechaLarga(viewDate)}</span>
          </div>

          <button
            type="button"
            onClick={() => irAlDia(addDays(viewDate, 1))}
            disabled={viendoHoy}
            aria-label="Día siguiente"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-control border border-hairline bg-raised text-ink-2 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:hover:border-hairline disabled:hover:text-ink-2"
          >
            <Icon name="chevron_right" size="m" />
          </button>
        </div>
      )}

      {!loading && !viendoHoy && (
        <button
          type="button"
          onClick={() => irAlDia(hoyFecha)}
          className="w-full rounded-control border border-accent/30 py-2 font-sans text-label font-bold uppercase tracking-wider text-accent transition-all hover:bg-accent/10"
        >
          ← Volver a hoy
        </button>
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
      ) : (
        <>
          {/* Acceso a los menús guardados. Antes esto era el selector de DIETA
              (la del coach, las tuyas, la programada de hoy…) y elegir mal era
              justo lo que hacía desaparecer el registro del día. Ahora el día
              no se elige: esto solo abre los menús que te has guardado para
              volver a ponerte uno. */}
          {menusGuardados.length > 0 && (
            <button
              type="button"
              onClick={() => setMisDietasOpen(true)}
              className="w-full flex items-center gap-3 p-3 rounded-control bg-raised border border-hairline hover:border-accent/40 transition-all text-left"
            >
              <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                <Icon name="bookmark" size="s" className="text-accent" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-sans font-bold text-body-s text-ink truncate">Mis menús guardados</span>
                <span className="block font-mono text-caption text-ink-2 truncate">
                  {menusGuardados.length} {menusGuardados.length === 1 ? 'menú listo para repetir' : 'menús listos para repetir'}
                </span>
              </span>
              <Icon name="expand_more" size="s" className="text-ink-2 flex-shrink-0" />
            </button>
          )}

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
                    TU PLAN DEL DÍA
                  </span>
                  <span className="font-mono text-caption text-accent uppercase tracking-widest font-bold">
                    {viendoHoy ? `Hoy, ${WD_FULL[diaSemanaDe(viewDate)]}` : fechaLarga(viewDate)}
                  </span>
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
                        const b = effBudget[cat] ?? 0;
                        const d = doneByCat[cat];
                        const over = b > 0 && d > b;
                        const pct = b > 0 ? (d / b) * 100 : 0;
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
                          {/* Ya no hay botón de "registrar ingesta": lo que está
                              en la comida cuenta como comido desde que se mete.
                              El punto solo dice si la comida tiene algo. */}
                          <span
                            aria-hidden
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${mealDone ? 'bg-accent' : 'bg-hairline'}`}
                          />
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
                        ) : filasDeComida(meal.items).map(fila => {
                          /* Una receta ocupa UN renglón, con la suma de sus
                             intercambios; un alimento suelto, el suyo. Ver
                             utils/filasDelPlan.ts para por qué. */
                          if (fila.tipo === 'receta') {
                            const nombreReceta = recipes.find(r => r.id === fila.recipeId)?.name ?? fila.nombre;
                            const total = round2(BUDGET_CATS.reduce((s, c) => s + fila.intercambios[c], 0));
                            return (
                              <React.Fragment key={`${meal.id}_receta_${fila.idxs[0]}`}>
                                <MealItemSwipeRow
                                  className="rounded-surface"
                                  onDelete={() => handleRemoveReceta(meal.id, fila.idxs)}
                                >
                                  <div className="flex items-center gap-3 p-3 rounded-surface border border-hairline bg-surface transition-colors duration-(--duration-state)">
                                    <span className="w-8 h-8 rounded-control bg-accent-bg border border-accent/20 flex-shrink-0 flex items-center justify-center">
                                      <span className="material-symbols-outlined text-body-s text-accent select-none">skillet</span>
                                    </span>

                                    {/* Toda la fila abre la receta: foto, ingredientes y
                                        pasos, igual que desde el Recetario. */}
                                    <button
                                      type="button"
                                      onClick={() => abrirReceta(meal.id, fila.recipeId)}
                                      className="flex-1 min-w-0 text-left rounded-control -m-1 p-1 transition-colors hover:bg-raised/60 active:bg-raised"
                                    >
                                      <span className="block font-sans text-body-s font-semibold leading-snug text-ink">
                                        {nombreReceta}
                                      </span>
                                      <span className="block font-mono text-caption text-ink-2">
                                        {fmtQty(total)} int. · {BUDGET_CATS.filter(c => fila.intercambios[c] > 0).map(c => `${CHIP_LABEL[c]} ${fmtQty(fila.intercambios[c])}`).join(' · ') || 'sin intercambios'}
                                      </span>
                                    </button>

                                    {/* El stepper mueve el plato entero, no un ingrediente. */}
                                    <div className="flex items-center gap-1 bg-inset rounded-control border border-hairline flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleEscalarReceta(meal.id, fila.idxs, -0.25)}
                                        aria-label={`Reducir ${nombreReceta}`}
                                        className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-white font-bold text-body-s active:scale-90"
                                      >−</button>
                                      <span className="w-9 text-center font-mono text-caption text-white">{fmtQty(total)}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleEscalarReceta(meal.id, fila.idxs, 0.25)}
                                        aria-label={`Aumentar ${nombreReceta}`}
                                        className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-white font-bold text-body-s active:scale-90"
                                      >+</button>
                                    </div>
                                  </div>
                                </MealItemSwipeRow>
                              </React.Fragment>
                            );
                          }

                          const { idx, item } = fila;
                          const key = `${meal.id}_${idx}`;
                          const st = itemStates[key] ?? { foodLabel: item.foodLabel, done: true };
                          const canDelete = selectedDiet.selfManaged || idx >= (origItemCounts[meal.id] ?? Infinity);
                          return (
                            <React.Fragment key={key}>
                              <MealItemSwipeRow
                                className="rounded-surface"
                                onDelete={canDelete ? () => handleRemoveItem(meal.id, idx) : undefined}
                              >
                                {/* El alimento se ve SIEMPRE igual: ni tachado ni
                                    apagado por estar comido. Está en tu día, cuenta en
                                    tus intercambios y se puede sumar o restar; tacharlo
                                    lo hacía parecer descartado. */}
                                <div className="flex items-center gap-3 p-3 rounded-surface border border-hairline bg-surface transition-colors duration-(--duration-state)">
                                  {/* Category tag — compacto, no compite con el nombre */}
                                  <span className="w-8 h-8 rounded-control bg-inset border border-hairline flex-shrink-0 flex items-center justify-center px-0.5">
                                    <span className={`font-mono font-bold text-ink-3 leading-none text-center ${item.category.startsWith('MIX_') ? 'text-[8px] tracking-tight' : 'text-[10px]'}`}>
                                      {item.category.replace('_', '')}
                                    </span>
                                  </span>

                                  {/* Cantidad (en oro) + nombre, seguidos: "250g harina de
                                      avena". Los gramos SOLO viven aquí; el nombre nunca se
                                      trunca. Tocar abre el intercambiador. */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPicker(meal.id, idx, item.category)}
                                    className="flex-1 min-w-0 text-left rounded-control -m-1 p-1 transition-colors hover:bg-raised/60 active:bg-raised"
                                  >
                                    <span className="font-mono text-body-s font-bold text-accent whitespace-nowrap">
                                      {itemWeightLabel(item.foodLabel, item.quantity)}
                                    </span>
                                    {' '}
                                    <span className="font-sans text-body-s font-semibold leading-snug text-ink">
                                      {foodNameWithoutGrams(st.foodLabel)}
                                    </span>
                                  </button>

                                  {/* Stepper de cantidad — pasos de 0.25 intercambio. */}
                                  <div className="flex items-center gap-1 bg-inset rounded-control border border-hairline flex-shrink-0">
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
                                </div>
                              </MealItemSwipeRow>
                            </React.Fragment>
                          );
                        })}
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

              {/* Autoguardado — sin botón "Guardar". Ya no avisa de que se vaya a
                  crear una copia: no hay dieta del coach que forkear, el día se
                  guarda en su propio registro y punto. */}
              {(() => {
                const statusLabel = isDirty ? 'Guardando el día...' : 'Día guardado';
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

      {/* Los menús que el atleta se ha guardado, para volver a ponerse uno en el
          día que esté viendo. Antes esta hoja gestionaba DIETAS —la programada
          de hoy, las del coach, las tuyas— y elegir una cambiaba de qué colgaba
          el día; ya no hay nada de eso. */}
      {misDietasOpen && (
        <Sheet
          open
          onClose={() => setMisDietasOpen(false)}
          title="Mis menús guardados"
          size="l"
          footer={<Button variant="secondary" fullWidth onClick={handleStartBlankFromSheet}>Vaciar el día</Button>}
        >
          {menusGuardados.length === 0 ? (
            <EmptyState
              icon="restaurant_menu"
              title="Todavía no has guardado ningún menú"
              description="Monta tu día y pulsa «Guardar como menú» para repetirlo cuando quieras."
            />
          ) : (
            <div className="space-y-1">
              {menusGuardados.map(dt => {
                const dPlaced = computeDietPlaced(dt.meals);
                const chips = BUDGET_CATS.filter(cat => dPlaced[cat] > 0)
                  .map(cat => `${CHIP_LABEL[cat]} ${fmtQty(dPlaced[cat])}`)
                  .join(' · ');
                return (
                  <ListRow
                    key={dt.id}
                    title={dt.name}
                    subtitle={chips || 'Sin alimentos'}
                    leading={
                      <span className="w-9 h-9 rounded-control bg-raised border border-hairline flex items-center justify-center flex-shrink-0">
                        <Icon name="restaurant_menu" size="s" className="text-ink-2" />
                      </span>
                    }
                    trailing={
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => abrirRenombrar(dt)}
                          title="Renombrar"
                          aria-label={`Renombrar ${dt.name}`}
                          className="text-ink-2 hover:text-accent transition-colors p-2"
                        >
                          <Icon name="edit" size="s" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicateMenu(dt)}
                          disabled={duplicandoMenuId === dt.id}
                          title="Duplicar"
                          aria-label={`Duplicar ${dt.name}`}
                          className="text-ink-2 hover:text-accent disabled:opacity-40 transition-colors p-2"
                        >
                          <Icon name="content_copy" size="s" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDietPendingDelete(dt)}
                          title="Eliminar"
                          aria-label={`Eliminar ${dt.name}`}
                          className="text-ink-2 hover:text-red-400 transition-colors p-2"
                        >
                          <Icon name="delete" size="s" />
                        </button>
                      </div>
                    }
                    onClick={() => { cargarMenuEnElDia(dt); setMisDietasOpen(false); showToast(`"${dt.name}" cargado en el día.`, 'success'); }}
                  />
                );
              })}
            </div>
          )}
        </Sheet>
      )}

      {/* 1.4.1 de Apple: la cita de los cálculos de la pantalla. Va al pie, por
          decisión de producto — arriba comía la cabecera de "Mi plan". */}
      <NotaDeFuente>
        Tu presupuesto lo fija tu entrenador. Los cálculos de la app (1 intercambio ≈ 100 kcal,
        objetivos de proteína y grasa, valores de referencia de nutrientes) se apoyan en EFSA, OMS,
        ACSM y BEDCA. Información educativa, no consejo médico.
      </NotaDeFuente>

      {/* Renombrar un menú guardado */}
      {menuPendingRename && (
        <Dialog
          open
          onClose={() => setMenuPendingRename(null)}
          title="Renombrar menú"
          size="s"
          footer={(
            <>
              <Button onClick={() => setMenuPendingRename(null)} variant="secondary">Cancelar</Button>
              <Button
                onClick={() => void confirmRenameMenu()}
                variant="primary"
                loading={renamingMenu}
                disabled={!renameDraft.trim()}
              >Guardar</Button>
            </>
          )}
        >
          <Input
            label="Nombre"
            value={renameDraft}
            onChange={setRenameDraft}
            placeholder="Día de entreno"
          />
        </Dialog>
      )}

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
                {fotoDeReceta(recetaDetalle) && (
                  <div className="w-full aspect-[16/9] rounded-surface overflow-hidden bg-raised">
                    <FotoDeReceta
                      src={fotoDeReceta(recetaDetalle)}
                      alt={recetaDetalle.name}
                      className="w-full h-full object-cover"
                      fallback={null}
                    />
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


      {/* ¿Contra qué cupo cuadramos? — a petición de Dani. Se pregunta antes de
          enseñar recetas porque la respuesta cambia la lista entera. */}
      {preguntaAmbito && (() => {
        const meal = selectedDiet?.meals.find(m => m.id === preguntaAmbito);
        const idx = selectedDiet?.meals.findIndex(m => m.id === preguntaAmbito) ?? 0;
        const nombreComida = meal ? mealLabel(meal.name, idx + 1) : 'esta comida';
        const sinReparto = !meal?.target;
        const totalDia = round2(Math.max(0, leftByCat.HC) + Math.max(0, leftByCat.PROT) + Math.max(0, leftByCat.GRASA));
        const restanteComida = meal?.target
          ? round2(BUDGET_CATS.reduce((s, c) => s + Math.max(0, (meal.target![c] ?? 0) - (mealDoneByCat[meal.id]?.[c] ?? 0)), 0))
          : null;
        return (
          <Sheet
            open
            onClose={() => setPreguntaAmbito(null)}
            title="¿Qué recetas te enseño?"
            size="m"
            footer={<Button variant="ghost" onClick={() => setPreguntaAmbito(null)} fullWidth>Cancelar</Button>}
          >
            <div className="space-y-2 pt-2">
              <p className="font-sans text-body-s text-ink-2 px-1">
                Solo verás recetas que te quepan en el cupo que elijas.
              </p>

              <button
                onClick={() => abrirRecetarioConAmbito(preguntaAmbito, 'comida')}
                disabled={sinReparto}
                className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all disabled:opacity-40 disabled:hover:border-hairline"
              >
                <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                  <Icon name="restaurant" size="s" className="text-accent" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans font-bold text-body-s text-ink">Que cuadre en {nombreComida}</span>
                  <span className="block font-mono text-caption text-ink-2">
                    {sinReparto
                      ? 'Esta comida no tiene reparto asignado todavía'
                      : `Te quedan ${fmtQty(restanteComida ?? 0)} int. en esta comida`}
                  </span>
                </span>
              </button>

              <button
                onClick={() => abrirRecetarioConAmbito(preguntaAmbito, 'dia')}
                className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all"
              >
                <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                  <Icon name="today" size="s" className="text-accent" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans font-bold text-body-s text-ink">Que cuadre en lo que me queda del día</span>
                  <span className="block font-mono text-caption text-ink-2">Te quedan {fmtQty(totalDia)} int. hoy</span>
                </span>
              </button>
            </div>
          </Sheet>
        );
      })()}

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
