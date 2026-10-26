import { useReglasDeReceta, useListaDeMenu, useSeleccionDeRecetas } from '../hooks/useReglasDeReceta';
import { quiereAlgunaDieta } from '../utils/seleccionDeRecetas';
import { recetaPermitida, type AmbitoDeRegla } from '../utils/reglasDeReceta';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { minutosDeReceta } from '../utils/tiempoDeReceta';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile, Diet, DietMeal, DietItem, FoodCategory, DietMode, MealItem, Recipe, RecipeFavorites, RecetaPendiente, MenuCompletionLog, DietCompletionLog, Macros } from '../types';
import { macrosDeIntercambios, objetivoDelRegistro, intercambiosDeMacros, macrosDeLineas, objetivoDeDieta } from '../utils/macrosLegado';
import { sonMacrosVacios, sinNegativos, restarMacros, escalarMacros, redondearMacros } from '../utils/macros';
import { macrosDeReceta, ordenarPorLoQueQueda } from '../utils/macrosDeReceta';
import { getDietsForAthlete, getAthleteDietConfig, saveAthleteDietConfig, createDiet, updateDiet, deleteDiet, getFoodItems, seedFoodItemsIfEmpty, getAthleteNutritionConfig, saveAthleteNutritionConfig, getRecipes, getRecipeFavorites, getNutritionProgram, markNutritionPhaseSeen, computeActivePhase, createNotificationDeduped, getDietCompletionLog, saveDietCompletionLog, createRecipe, queryRecetasForGenerator, cargarIndiceRecetas, getOnboarding, getRecipeById, getMenuCompletionLog, saveMenuCompletionLog, getAlimentosPersonales, getCatalogoAlimentos, crearAlimentoPersonal, actualizarAlimentoPersonal, borrarAlimentoPersonal, getDietCompletionLogsForAthlete } from '../dbService';
import { esPlatoDelRecetario } from '../db/recetasHidratacion';
import RecetarioDescubrir from './RecetarioDescubrir';
import { BUDGET_CATS, MODE_LABEL, ALL_DIET_MODES, round2, fmtQty, foodNameWithoutGrams, addToPlaced, recipeToDietItems } from '../utils/exchangeHelpers';
import { parseBaseGrams, etiquetaDePeso, pesoDeItem } from '../utils/conversionNutricional';
import { findRecipeAlternatives, recipeExchanges, groupByDishType, type RecipeAlternative, type AlternativePrefs } from '../utils/recipeMatch';
import { ingredientMatch, violatesDietType } from '../utils/foodPrefs';
import { athleteConditions, violatesHealthConditions } from '../utils/dietaryRestrictions';
import { dietTypeVigente } from '../utils/foodPrefs';
import { coincideBusqueda } from '../utils/busqueda';
import { coincidePorEquivalencia } from '../utils/equivalenciasDeAlimentos';
import { dishType, dishTypeLabel, type DishType } from '../utils/dishTypes';
import { filasDeComida, escalarReceta } from '../utils/filasDelPlan';
import { escalarRecetaEntera, escalaDeReceta } from '../utils/escalarRecetaEntera';
import { objetivoDelDia } from '../utils/objetivoDelDia';
import { resumenDelDia } from '../utils/resumenDelDia';
import { useToast } from '../hooks/useToast';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import Coachmark from './Coachmark';
import { haptics } from '../services/haptics';
import { useTourTarget } from '../features/tutorial/TourTargetContext';
import { useTutorialEngine } from '../features/tutorial/TutorialEngine';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import FotoDeReceta from './FotoDeReceta';
import { Skeleton } from './ui';
import { EmptyState, Sheet, Icon, Button, Dialog, ListRow, Input } from './ui';
import MealItemSwipeRow from './nutrition/MealItemSwipeRow';
import { SemanaDelDiario, TarjetaDelDia, EtiquetaMacro } from './nutrition/DiaDeNutricion';
import AnadirAlimentoCalorias, { type FilaAlimento, type PestanaAnadir, type SeccionFilas } from './nutrition/calorias/AnadirAlimentoCalorias';
import { alimentosGeneralesPorGrupo, type AlimentoGeneral } from '../utils/alimentosGenerales';
import FichaAlimentoCalorias, { FichaProductoOff, racionesDe } from './nutrition/calorias/FichaAlimentoCalorias';
import { lineasDelDiario, type LineaDiario } from '../utils/diarioCalorias';
import { recetaDesglosada, faltanCantidades } from '../utils/recetaDesglosada';

import CrearAlimentoSheet from './nutrition/CrearAlimentoSheet';
import GramosSheet from './nutrition/GramosSheet';
import { alimentosUsados, claveDeCatalogo, claveDeProducto, type AlimentoUsado } from '../utils/alimentosFrecuentes';
import { itemsDeAlimentoPorGramos, sePuedeEnGramos, previsionDeGramos, gramosPorIntercambioDe, gramosSugeridos } from '../utils/gramosDeAlimento';
import { itemsDeProducto } from '../utils/productoAIntercambios';
import ProductoOffSheet from './nutrition/ProductoOffSheet';
import ScannerSheet from './nutrition/ScannerSheet';
import { encontrarPorCodigo } from '../utils/codigoBarras';
import ProductoEscaneadoSheet from './nutrition/ProductoEscaneadoSheet';
import { cargarIndiceOff, ATRIBUCION_OFF } from '../services/openFoodFacts';
import { buscarEnIndiceOff, extrasDeRacion, type EntradaIndiceOff, type OffProducto } from '../utils/productoOff';
import { buscarEnCatalogo, comoProducto, nombreDeAlimento, type AlimentoCatalogo } from '../utils/catalogoAlimentos';
import { NotaDeFuente } from './FuentesCientificasSheet';

import { filtroDuro } from '../utils/menuEngine';
import {
  COACH_EMAIL, makeId, dietSnapshot, estructuraDeDia, sembrarDiaDelPlan, plantillaDeComidas,
  WD_FULL,
  mealLabel, ItemState,
} from './nutrition/dietHelpers';
import { useDiaActual, diaSemanaDe } from '../hooks/useDiaActual';
import { addDays, hoyIsoLocal} from '../utils/trainingWeek';
import SemanaNutricionAtleta from './nutrition/SemanaNutricionAtleta';
import HabitosDelDia from './nutrition/HabitosDelDia';
import { getWorkoutAssignmentsForAthlete } from '../dbService';

// ── Types ──────────────────────────────────────────────────────────────────────
// (ItemState viene de dietHelpers.ts — compartido con el resto de "Mi plan")

interface Props {
  profile: UserProfile;
  pendingRecipe?: RecetaPendiente | null;
  onConsumedPendingRecipe?: () => void;
}

// Fila del picker de recetas — compartida entre "Mis recetas" (propias/coach)
// y "Recetario" (catálogo), antes duplicada entera en el JSX de cada una.
// Fila de una alternativa en "Cambiar comida". A diferencia de RecipePickerRow,
// esta muestra kcal y gramos —lo que tiene que cuadrar— y avisa cuando las kcal
// no son idénticas.
/** Lo que suma un menú guardado: «1.850 kcal · P 140 · HC 200 · G 55 g». */
function resumenDeMenu(meals: DietMeal[]): string {
  const items = meals.flatMap(m => m.items);
  if (items.length === 0) return '';
  const m = macrosDeLineas(items);
  return `${Math.round(m.kcal).toLocaleString('es-ES')} kcal · P ${Math.round(m.p)} · HC ${Math.round(m.hc)} · G ${Math.round(m.g)} g`;
}

function SwapCandidateRow({ alt, isFav, onSelect }: {
  alt: RecipeAlternative; isFav: boolean; onSelect: (r: Recipe) => void;
  key?: React.Key;
}) {
  const { recipe, macros: m, kcalDrift } = alt;
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
        <span className="font-sans font-bold text-body-s text-ink group-hover:text-accent-ink transition-colors truncate block">
          {isFav && <Icon name="favorite" size="s" className="text-accent-ink mr-1 align-middle" />}
          {recipe.name}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-caption text-accent-ink/70">{Math.round(m.kcal)} kcal</span>
          <span className="font-mono text-caption text-ink-2">
            P {Math.round(m.p)} · HC {Math.round(m.hc)} · G {Math.round(m.g)} g
          </span>
          {/* Honestidad: si las kcal no son las mismas se dice, no se esconde. */}
          {kcalDrift >= 1 && (
            <span className="font-mono text-caption text-ink-2 italic">(±{Math.round(kcalDrift)} kcal)</span>
          )}
          <span className="font-sans text-caption text-ink-2">· {dishTypeLabel(alt.dishType)}</span>
        </div>
      </div>
      <Icon name="swap_horiz" size="s" className="text-ink-2 group-hover:text-accent-ink transition-colors flex-shrink-0" />
    </button>
  );
}

function RecipePickerRow({ recipe, isFav, enabledModes, onSelect }: {
  recipe: Recipe; isFav: boolean; enabledModes: DietMode[]; onSelect: (r: Recipe) => void;
  // El repo no tiene `@types/react`, así que TS no excluye `key` de las props
  // por su cuenta — mismo workaround que `Badge.tsx`.
  key?: React.Key;
}) {
  // kcal y gramos (utils/macrosDeReceta.ts). `enabledModes` ya no hace falta:
  // las macros de la receta no dependen del modo.
  void enabledModes;
  const m = macrosDeReceta(recipe);
  const exchStr = m.kcal > 0
    ? `${Math.round(m.kcal)} kcal · P ${Math.round(m.p)} · HC ${Math.round(m.hc)} · G ${Math.round(m.g)} g`
    : '—';

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
            <span className="material-symbols-outlined text-accent-ink text-label" style={{ fontVariationSettings: "'FILL' 1", fontSize: '12px' }}>favorite</span>
          )}
          <span className="font-sans font-bold text-body-s text-ink group-hover:text-accent-ink transition-colors truncate">{recipe.name}</span>
        </div>
        {recipe.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {recipe.categories.slice(0, 3).map(c => (
              <span key={c} className="px-2 rounded-control bg-raised font-mono text-caption text-ink-2 uppercase">{c}</span>
            ))}
          </div>
        )}
        <span className="font-mono text-caption text-accent-ink/70">{exchStr}</span>
      </div>
      <span className="material-symbols-outlined text-ink-2 group-hover:text-accent-ink transition-colors select-none text-title-s flex-shrink-0">add_circle</span>
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
  /* Hacia delante se puede planificar, no solo mirar: hasta 7 días, para que
     el atleta que sabe que el sábado come fuera pueda dejarlo apuntado antes
     de que llegue. Pasado ese tope no hay "plan" que valga —ni el coach pauta
     tan lejos ni tiene sentido dejar el selector crecer sin límite. */
  const maxFechaFutura = addDays(hoyFecha, 7);
  const viendoFuturo = viewDate > hoyFecha;
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
  const { data: foodItemsComunes = [], isPending: loadingFoodItems } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => seedFoodItemsIfEmpty().catch(() => {}).then(getFoodItems),
    enabled: !loadingPhase1,
  });

  /* El banco PROPIO del atleta: lo que se ha añadido él con la calculadora.
     Vive en su propio documento (`alimentosPersonales/{email}`) y no en
     `foodItems`, que es de todos — ver db/nutrition.ts. Se mezcla aquí, y solo
     aquí, para que el resto de la pantalla siga viendo una única lista. */
  const { data: alimentosPropios = [] } = useQuery({
    queryKey: ['alimentosPersonales', profile.email],
    queryFn: () => getAlimentosPersonales(profile.email).catch(() => [] as MealItem[]),
    enabled: !loadingPhase1,
  });

  // Los propios van DELANTE: quien se ha molestado en crear un alimento lo
  // busca para usarlo, y enterrado bajo 310 del sistema no lo encuentra.
  const foodItems = useMemo(
    () => [...alimentosPropios, ...foodItemsComunes],
    [alimentosPropios, foodItemsComunes],
  );
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
  /* La dieta que el coach ha puesto para ESTE día. Antes de aquí solo salía el
     cupo; ahora se conserva la dieta entera porque también siembra las comidas
     del día (ver `sembrarDiaDelPlan`). El panel del coach dice literalmente
     "Asigna una dieta a cada día. El atleta la verá cargada automáticamente" y
     eso no era cierto: al atleta le llegaba el cupo y un día en blanco, y si el
     coach le había puesto Día A de lunes a viernes y Día B el fin de semana,
     el Día B no aparecía por ningún lado (caso de Pedro, 07-09-2026). */
  // El coach puede tener cupos distintos por día (el "día A/B/C" del calendario
  // semanal, que sigue usando el generador de menús): se respeta el del día que
  // se está mirando, no el de hoy. La regla vive en utils/nutritionSummary
  // porque es la misma que usa el resumen de Hoy y tiene tests.
  // La dieta del día con lo que la periodización programa para ESA semana
  // (ajustes de intercambios, mantenimiento, comida libre). Ver semanasNutricion.ts.
  // Solo se piden si la periodización cicla hidratos por entreno. Misma clave
  // que la pantalla de Entrenamiento: si ya se abrió, no se lee nada más.
  const { data: asignacionesEntreno } = useQuery({
    queryKey: ['workoutAssignmentsForAthlete', profile.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete({ uid: profile.userId, email: profile.email }),
    enabled: !!program?.ciclado,
  });
  const entrenaEseDia = program?.ciclado && asignacionesEntreno
    ? asignacionesEntreno.some(a => a.date === viewDate && a.status !== 'skipped')
    : undefined;
  // Una sola respuesta a «qué le toca hoy», la misma que usa Inicio (utils/objetivoDelDia.ts).
  const objetivoHoy = useMemo(
    () => objetivoDelDia({ diets: allDietsList, config: dietConfigRaw ?? null, program, fecha: viewDate, entrena: entrenaEseDia }),
    [allDietsList, dietConfigRaw, viewDate, program, entrenaEseDia],
  );
  const dietaPautada = objetivoHoy.dieta;
  const cupoPautado = dietaPautada?.budget ?? null;

  /* Las dietas del coach que el atleta puede cargarse en un día. Solo las
     ACTIVAS: una dieta que el coach dejó a medias o desactivó no tiene por qué
     salirle al atleta (Dani, 07-09-2026). La programada del día va la primera
     aunque no esté marcada activa: es la de hoy. */
  const dietasDelCoach = useMemo(() => {
    const activos = new Set(dietConfigRaw?.activeDietIds ?? []);
    const programadas = new Set(Object.values(dietConfigRaw?.weeklySchedule ?? {}).filter(Boolean) as string[]);
    return allDietsList
      .filter(d => !d.selfManaged && !d.isDraft && (activos.has(d.id) || programadas.has(d.id) || d.id === dietaPautada?.id))
      .sort((a, b) => Number(b.id === dietaPautada?.id) - Number(a.id === dietaPautada?.id)
        || a.name.localeCompare(b.name));
  }, [allDietsList, dietConfigRaw, dietaPautada]);

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
  /* «Cambiar» un alimento (desde su ficha): la hoja de Añadir se abre para
     elegir otro, y lo elegido ocupa el sitio de esas líneas. */
  const [reemplazo, setReemplazo] = useState<{ mealId: string; idxs: number[] } | null>(null);
  const [crearAlimentoAbierto, setCrearAlimentoAbierto] = useState(false);
  const [alimentoABorrar, setAlimentoABorrar] = useState<MealItem | null>(null);
  const [alimentoAEditar, setAlimentoAEditar] = useState<MealItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // T13 (18-08): mismo tick + ×N que el selector del coach, para la rama de
  // "añadir" (itemIdx === null) — "cambiar" sigue siendo una sustitución
  // única que cierra al terminar, no hace falta contador ahí.
  const [pickerAddedCounts, setPickerAddedCounts] = useState<Record<string, number>>({});

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
  /* El buscador filtra el catálogo ENTERO (8.850) en cada tecla, así que sin
     debounce se ordena y recorre todo el índice mientras el atleta escribe, en
     el hilo principal y en un móvil. Mismo patrón (y mismos 200 ms) que la
     pestaña Recetas, que ya buscaba sobre el índice completo. */
  const recipeSearchDebounced = useDebouncedValue(recipeSearch, 200);
  const [recipeCatFilter, setRecipeCatFilter]       = useState<string>('all');
  // Dos fuentes en el mismo picker (a petición de Dani): "Mis recetas" (propias
  // + del coach, via getRecipes — lo que ya había) y "Recetario" (el catálogo
  // de ~8.850, con la misma portada «Descubrir» que la pestaña Recetas).
  const [recipeSource, setRecipeSource]             = useState<'mias' | 'recetario'>('mias');
  // El índice ENTERO (8.850): la portada calcula sus colecciones y su buscador
  // sobre él. `cargarIndiceRecetas` memoiza la promesa: si la pestaña Recetas
  // ya lo bajó, aquí no se descarga otra vez.
  const [indiceRecetario, setIndiceRecetario] = useState<Recipe[]>([]);
  const [indiceRecetarioEstado, setIndiceRecetarioEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  // Tracks how many items each meal had originally (before any recipe was applied)
  const [origItemCounts, setOrigItemCounts]         = useState<Record<string, number>>({});

  /* Ver la receta que hay dentro de una comida del plan.
     Cambiarla ya se podía —y cambiar alimentos sueltos también—, pero la única
     puerta era un icono de sartén sin texto, con la explicación en un `title`
     que en un móvil no se ve nunca: en la práctica nadie llegaba. Ahora la
     receta se abre como en Mi menú (foto, ingredientes, pasos) y desde dentro
     se cambia, que es donde uno la busca después de leerla. */
  const [recetaAbierta, setRecetaAbierta] = useState<{ mealId: string; recipeId: string; factor: number } | null>(null);
  const [recetaDetalle, setRecetaDetalle] = useState<Recipe | null>(null);
  const [cargandoReceta, setCargandoReceta] = useState(false);
  const peticionRecetaRef = useRef(0);
  /* La receta tal y como está EN EL PLATO: con sus gramos, kcal e intercambios
     multiplicados por las veces que el atleta la ha escalado en la comida. */
  const recetaEscalada = useMemo(
    () => (recetaDetalle ? escalarRecetaEntera(recetaDetalle, recetaAbierta?.factor ?? 1) : null),
    [recetaDetalle, recetaAbierta?.factor],
  );

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

  // "Añadir a la comida" desde Recetas — solo queda elegir la comida del día
  // (antes había un paso previo para elegir la dieta; ya no hay dietas).
  const [chooseMealForRecipe, setChooseMealForRecipe] = useState<RecetaPendiente | null>(null);


  // Nutrition periodization
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  /** Recarga que el coach ha marcado para el día que se está viendo
   *  (NutritionProgram.refeedDays) — sigue a `viewDate`, no solo a hoy: si el
   *  atleta navega a un día futuro con recarga programada, tiene que verla
   *  antes de llegar, no solo el día de. */
  const refeedDelDia = useMemo(
    () => (program?.refeedDays ?? []).find(r => r.date === viewDate) ?? null,
    [program, viewDate],
  );

  // Pantalla de reparto (a petición de Dani) — un único botón "Editar reparto
  // por comida" abre esta pantalla con el reparto de TODAS las comidas a la
  // vez, en vez de steppers sueltos en cada tarjeta. Sustituye a la antigua
  // "hoja de ajuste" (registro rápido por macros), que se ha quitado.

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

      // Aviso de cambio de fase
      if (program && program.phases.length > 0) {
        const todayStr = hoyIsoLocal();
        const activePhase = computeActivePhase(program, todayStr);
        if (activePhase && activePhase.dietId) {
          // Antes aquí se reescribía `activeDietIds` con la dieta de la fase. Ya no:
          // la dieta de la fase la resuelve `objetivoDelDia`, sin escribir nada.
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

    // Ojo: esto NO es `diaLog.meals ?? estructura vacía`. Un registro anterior
    // a 09-2026 guarda las comidas fuera, en la dieta a la que apunta con
    // `dietId`; sembrar una estructura nueva para esos días le enseñaba al
    // atleta el día en blanco Y con ids de comida nuevos, contra los que sus
    // marcas guardadas ya no casaban. Ver `sembrarDiaDelPlan`.
    const { meals, budget } = sembrarDiaDelPlan(
      diaLog,
      allDietsList,
      plantillaDeComidas(),
      cupoPautado,
      // Las comidas del día empiezan vacías (Dani, 26-10-2026): solo sale lo
      // que apunta el atleta. El coach pauta el objetivo, no los alimentos.
      null,
    );
    // Objetivo en kcal: el congelado del día si lo tiene; si no, el de la
    // dieta del coach en formato nuevo. Sin ninguno, sale del cupo (`budget`).
    const delRegistro = objetivoDelRegistro(diaLog);
    const objetivo = (!sonMacrosVacios(delRegistro) ? delRegistro : null) ?? dietaPautada?.objetivo;
    const plan: Diet = {
      id: `dia_${viewDate}`,
      athleteId: profile.email,
      name: `Plan del ${WD_FULL[diaSemanaDe(viewDate)]}`,
      budget,
      ...(objetivo ? { objetivo } : {}),
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
  }, [loadingPhase1, loadingDia, viewDate, diaLog, cupoPautado, dietaPautada, allDietsList, profile.email]);

  /* ¿El coach ha cambiado el cupo DESPUÉS de que se sembrara el día?
     El cupo se congela al sembrar el día a propósito: mover el objetivo con la
     comida ya marcada haría que el atleta viera cómo «desaprueba» un día que
     ya había cuadrado. Pero quedarse callado es peor: se queda comiendo contra
     un número viejo sin saberlo. Para hoy y para cualquier día futuro que esté
     planificando (el coach puede cambiar el cupo de un día que el atleta ya
     había dejado montado) — los días PASADOS se quedan con el cupo que
     tuvieron, que es lo que de verdad pasó. */
  const cupoCambiado = useMemo(() => {
    if (!selectedDiet || !cupoPautado || viewDate < hoyIsoLocal()) return false;
    return BUDGET_CATS.some(c => round2(selectedDiet.budget[c] ?? 0) !== round2(cupoPautado[c] ?? 0));
  }, [selectedDiet, cupoPautado, viewDate]);

  /** Adopta el cupo nuevo sin tocar lo que el atleta ya tiene puesto ni marcado. */
  const actualizarAlCupoNuevo = useCallback(() => {
    if (!cupoPautado) return;
    setSelectedDiet(prev => (prev ? {
      ...prev,
      budget: { ...cupoPautado },
      objetivo: dietaPautada?.objetivo ?? macrosDeIntercambios(cupoPautado),
    } : prev));
  }, [cupoPautado, dietaPautada]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  /** Cuántos alimentos hay marcados como comidos en el día. */
  const doneItems = useMemo(
    () => (selectedDiet?.meals ?? []).reduce((n, meal) => n + meal.items.filter((_, idx) => itemStates[`${meal.id}_${idx}`]?.done).length, 0),
    [selectedDiet, itemStates],
  );

  /* Una sola vista, en kcal y gramos (10-2026): los intercambios ya no se
     enseñan en ningún sitio. */
  /* Buscador por modo (D-03). En «Calorías y macros» la hoja de añadir abre con
     lo que el atleta ya apunta (recientes y frecuentes del último mes) y
     «Mostrar todos» despliega el banco. Una consulta acotada a SU email. */
  const [gramosDe, setGramosDe] = useState<MealItem | null>(null);
  const usarListaRapida = !!pickerItem && pickerItem.itemIdx === null;
  const desdeUsados = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const { data: registrosUsados = [] } = useQuery({
    queryKey: ['dietCompletionLogs', profile.email, 'desde', desdeUsados],
    queryFn: () => getDietCompletionLogsForAthlete(profile.email, desdeUsados),
    staleTime: 10 * 60_000,
  });
  const usados = useMemo(() => alimentosUsados(registrosUsados), [registrosUsados]);
  /** Gramos de la última vez que apuntó este producto o alimento del catálogo, si se sabe. */
  const ultimosGramos = (clave: string) =>
    [...usados.recientes, ...usados.frecuentes].find(u => u.clave === clave)?.gramos;
  // Productos de supermercado (Open Food Facts en local): el índice de nombres
  // se baja una vez, al abrir el buscador para añadir, y se busca en el móvil.
  const [productoOffAbierto, setProductoOffAbierto] = useState<EntradaIndiceOff | null>(null);
  // Escáner: hoja de la cámara y, ya leído, el código pendiente de resolver.
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [codigoEscaneado, setCodigoEscaneado] = useState<string | null>(null);
  // Crear un alimento desde un producto escaneado: nombre (si se conoce) y código.
  const [crearInicial, setCrearInicial] = useState<{ nombre?: string; codigo?: string } | null>(null);
  const { data: indiceOff = [] } = useQuery({
    queryKey: ['offIndice'],
    queryFn: cargarIndiceOff,
    staleTime: Infinity,
    retry: 1,
    enabled: !!pickerItem && pickerItem.itemIdx === null,
  });
  // Catálogo por 100 g (N-04): solo en «Calorías y macros». En Intercambios
  // manda el banco de siempre (Dani, 23-10). Se baja al abrir el buscador.
  const [alimentoCatalogoAbierto, setAlimentoCatalogoAbierto] = useState<AlimentoCatalogo | null>(null);
  const { data: catalogoAlimentos = [] } = useQuery({
    queryKey: ['catalogoAlimentos'],
    queryFn: getCatalogoAlimentos,
    staleTime: 60 * 60_000,
    enabled: usarListaRapida,
  });
  const resumenMacros = useMemo(
    () => resumenDelDia(selectedDiet?.meals, (Object.entries(itemStates) as [string, ItemState][]).filter(([, st]) => st.done).map(([k]) => k)),
    [selectedDiet, itemStates],
  );
  /* Objetivo del día en kcal y gramos (10-2026). El del propio día si ya lo
     trae (`objetivo`, o su cupo viejo congelado), traducido con las
     equivalencias de siempre (utils/macrosLegado.ts). */
  const objetivoDia: Macros = selectedDiet?.objetivo ?? macrosDeIntercambios(selectedDiet?.budget);
  const kcalObjetivo = Math.round(objetivoDia.kcal);
  // El sello "Día cerrado" sale cuando de verdad has llegado a tu objetivo:
  // las kcal dentro de un ±5 % y la proteína casi completa (≥ 90 %).
  const dayClosed = kcalObjetivo > 0
    && doneItems > 0
    && Math.abs(resumenMacros.kcal - kcalObjetivo) <= kcalObjetivo * 0.05
    && (objetivoDia.p <= 0 || resumenMacros.p >= objetivoDia.p * 0.9);

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
  const alimentosDelCatalogo = useMemo(
    () => (usarListaRapida && isSearchingFoods ? buscarEnCatalogo(catalogoAlimentos, searchTerm, 12) : []),
    [usarListaRapida, isSearchingFoods, catalogoAlimentos, searchTerm],
  );
  const productosOff = useMemo(
    () => (pickerItem?.itemIdx === null && isSearchingFoods ? buscarEnIndiceOff(indiceOff, searchTerm, 12) : []),
    [pickerItem, isSearchingFoods, indiceOff, searchTerm],
  );
  const availableRecipeCats = useMemo(() => {
    const s = new Set<string>();
    recipes.forEach(r => r.categories.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }, [recipes]);

  // Restricciones del atleta que CUALQUIER lista de recetas mostrada aquí debe
  // respetar. Las alergias y el tipo de dieta son filtros DUROS — antes solo
  // los aplicaba "Cambiar comida"; el resto de listas (este picker, el
  // recetario) no miraban nada de esto.
  const recetasOcultas = useReglasDeReceta(profile.email);
  const listaMenu = useListaDeMenu(profile.email);
  const { seleccion, paquetes } = useSeleccionDeRecetas(profile.email);
  const swapPrefs: AlternativePrefs = useMemo(() => ({
    allergies:         onboarding?.allergies ?? [],
    conditions:        athleteConditions(onboarding),
    dislikedFoods:     onboarding?.dislikedFoods ?? [],
    likedFoods:        onboarding?.likedFoods ?? [],
    // Igual que los tipos de plato de abajo: manda lo corregido en el perfil.
    dietType:          dietTypeVigente(nutConfig?.dietType, onboarding?.dietType),
    cookingMaxTime:    nutConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime,
    quiereRapidas:     nutConfig?.quiereRapidas ?? onboarding?.quiereRapidas,
    favoriteRecipeIds: recipeFavorites.recipeIds,
    dislikedRecipeIds: recipeFavorites.dislikedIds ?? [],
    preferredDishTypes: (nutConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as DishType[],
    excludedDishTypes:  (nutConfig?.excludedDishTypes  ?? onboarding?.excludedDishTypes  ?? []) as DishType[],
    recetasOcultas,
    listaMenu,
    seleccion,
    paquetes,
  }), [onboarding, nutConfig, recipeFavorites, recetasOcultas, listaMenu, seleccion, paquetes]);

  // Un tipo de plato excluido es una decisión explícita del atleta en sus
  // preferencias, igual de firme que una alergia: faltaba aquí, así que los
  // buscadores de esta pantalla seguían ofreciéndole justo lo que había
  // marcado que no quería ver.
  const isSafeForAthlete = useCallback((r: Recipe, ambito: AmbitoDeRegla = 'cambios') =>
    !swapPrefs.allergies!.some(f => ingredientMatch(r, f)) &&
    !violatesHealthConditions(r, swapPrefs.conditions) &&
    !swapPrefs.dislikedRecipeIds!.includes(r.id) &&
    // Escondida por el coach: para hoy, que es el día que el atleta está planificando.
    recetaPermitida(r.id, swapPrefs.recetasOcultas, ambito, ambito === 'recetario' ? undefined : [diaSemanaDe(hoyFecha)]) &&
    !(swapPrefs.excludedDishTypes ?? []).includes(dishType(r)) &&
    !violatesDietType(r, swapPrefs.dietType), [swapPrefs, hoyFecha]);

  /** Lo que el atleta ha pedido, primero: sus favoritas y después los tipos de
   *  plato que marcó querer más. Dentro de cada grupo, por nombre. */
  const ordenarPorPreferencia = useCallback((lista: Recipe[]) => {
    const preferidos = new Set(swapPrefs.preferredDishTypes ?? []);
    const rango = (r: Recipe) =>
      recipeFavorites.recipeIds.includes(r.id) ? 0 : preferidos.has(dishType(r)) ? 1 : 2;
    return [...lista].sort((a, b) => rango(a) - rango(b) || a.name.localeCompare(b.name));
  }, [swapPrefs, recipeFavorites]);

  /* Lo que queda por cubrir (10-2026, sin reparto por comidas): lo que queda
     del día y, para «esta comida», eso mismo entre las comidas que faltan por
     hacer (las que aún no tienen nada comido, contando esta). */
  const quedaDelDia = useMemo(
    () => sinNegativos(restarMacros(objetivoDia, { kcal: resumenMacros.kcal, p: resumenMacros.p, hc: resumenMacros.hc, g: resumenMacros.g })),
    [objetivoDia, resumenMacros],
  );
  const comidasPorHacer = useCallback((incluir?: string) => {
    const meals = (selectedDiet?.meals ?? []).filter(m => !m.libre);
    const vacias = meals.filter(m => !m.items.some((_, k) => itemStates[`${m.id}_${k}`]?.done)).map(m => m.id);
    return Math.max(1, vacias.length + (incluir && !vacias.includes(incluir) ? 1 : 0));
  }, [selectedDiet, itemStates]);
  const cupoDisponible = useMemo((): Macros => {
    if (ambitoCupo === 'dia' || !recipePickerMealId) return quedaDelDia;
    return escalarMacros(quedaDelDia, 1 / comidasPorHacer(recipePickerMealId));
  }, [ambitoCupo, recipePickerMealId, quedaDelDia, comidasPorHacer]);

  /* 2-3 recetas guardadas que encajan en cada comida que aún está vacía (lo
     que queda del día entre las comidas que faltan), para no tener que abrir
     el buscador. Mismo orden que el selector: lo que mejor aprovecha el hueco
     y, a igualdad, sus favoritas. */
  const sugerenciasPorComida = useMemo(() => {
    const out: Record<string, Recipe[]> = {};
    const seguras = recipes.filter(r => ((r.ingredients ?? []).length === 0 || r.ingredients.some(ing => enabledModes.includes(ing.mode))) && isSafeForAthlete(r));
    if (seguras.length === 0 || !selectedDiet) return out;
    const hueco = escalarMacros(quedaDelDia, 1 / comidasPorHacer());
    if (hueco.kcal < 100) return out;
    for (const meal of selectedDiet.meals) {
      if (meal.libre || meal.items.some((_, k) => itemStates[`${meal.id}_${k}`]?.done)) continue;
      out[meal.id] = ordenarPorPreferencia(ordenarPorLoQueQueda(seguras, hueco, true)).slice(0, 3);
    }
    return out;
  }, [recipes, enabledModes, isSafeForAthlete, selectedDiet, itemStates, ordenarPorPreferencia, quedaDelDia, comidasPorHacer]);

  const sortedPickerRecipes = useMemo(() => {
    // Una receta guardada del recetario no trae `ingredients` (ver
    // hidratarEntradaIndice), así que el `.some()` la descartaba siempre y el
    // atleta no encontraba aquí un plato que sí ve en Mis recetas. Sin
    // ingredientes no hay modo que comprobar; el tipo de dieta lo sigue
    // filtrando isSafeForAthlete.
    const withIngredients = recipes.filter(r =>
      (r.ingredients ?? []).length === 0 ||
      r.ingredients.some(ing => enabledModes.includes(ing.mode))
    );
    const filtered = withIngredients.filter(r => {
      const matchCat = recipeCatFilter === 'all' || r.categories.includes(recipeCatFilter);
      const matchSearch = coincideBusqueda(r.name, recipeSearchDebounced);
      return matchCat && matchSearch && isSafeForAthlete(r);
    });
    // Solo lo que cabe en el cupo elegido, y de lo que mejor lo aprovecha en
    // adelante — ofrecer una receta que no entra no ayuda a nadie.
    return ordenarPorPreferencia(
      ordenarPorLoQueQueda(filtered, cupoDisponible, recipeSearchDebounced.trim().length === 0));
  }, [recipes, enabledModes, recipeCatFilter, recipeSearchDebounced, isSafeForAthlete, ordenarPorPreferencia, cupoDisponible]);

  /* El recetario para «Usar receta»: lo que el atleta puede comer, con lo que
     mejor llena el hueco elegido delante y sus favoritas y tipos de plato
     preferidos por encima. Se ordena una vez (la portada no reordena), así que
     cada colección sale ya en ese orden. */
  const poolSelectorRecetario = useMemo(() => {
    const seguras = indiceRecetario.filter(r => esPlatoDelRecetario(r) && isSafeForAthlete(r, 'recetario'));
    const porCupo = ordenarPorLoQueQueda(seguras, cupoDisponible, false);
    const favoritas = new Set(recipeFavorites.recipeIds);
    const preferidos = new Set(swapPrefs.preferredDishTypes ?? []);
    const rango = (r: Recipe) => (favoritas.has(r.id) ? 0 : preferidos.has(dishType(r)) ? 1 : 2);
    // `sort` es estable: dentro de cada rango se queda el orden por cupo.
    return porCupo.sort((a, b) => rango(a) - rango(b));
  }, [indiceRecetario, isSafeForAthlete, cupoDisponible, recipeFavorites, swapPrefs]);
  const favoritasSet = useMemo(() => new Set(recipeFavorites.recipeIds), [recipeFavorites]);

  const swapCandidates = useMemo(() => {
    if (!swapSourceRecipe || swapPool.length === 0) return [];
    return findRecipeAlternatives(swapSourceRecipe, swapPool, {
      prefs: swapPrefs,
      dias: [diaSemanaDe(viewDate)],
      ambito: 'cambios',
      dietId: objetivoHoy.dietaBase?.id,
      intakeType: swapContext?.slot,
      search: swapSearch.trim() || undefined,
      limit: 40,
    });
  }, [swapSourceRecipe, swapPool, swapPrefs, swapContext?.slot, swapSearch, viewDate, objetivoHoy.dietaBase?.id]);

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

  const isDirty = selectedDiet
    ? dietSnapshot(selectedDiet) !== savedDietSnapshot
    : false;

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
    const meals = estructuraDeDia(plantillaDeComidas());
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
  const guardarDia = useCallback((meals: DietMeal[], doneItemIds: string[], dia: Pick<Diet, 'budget' | 'objetivo'>, habitos?: { aguaMl?: number; racionesVegetales?: number }) => {
    /* El objetivo se guarda en kcal (`objetivo`) y, mientras haya móviles con
       la versión vieja de la app, también en intercambios (`budget`), que es lo
       único que ellos saben leer. */
    const objetivo = dia.objetivo ?? macrosDeIntercambios(dia.budget);
    const budget = dia.objetivo && sonMacrosVacios(macrosDeIntercambios(dia.budget))
      ? intercambiosDeMacros(dia.objetivo)
      : dia.budget;
    const dietId = allDietsList.find(d => !d.selfManaged)?.id ?? '';
    // El día se reescribe entero: el agua y la verdura apuntadas van con él.
    const previo = queryClient.getQueryData<DietCompletionLog | null>(diaKey);
    const aguaMl = habitos?.aguaMl ?? previo?.aguaMl;
    const racionesVegetales = habitos?.racionesVegetales ?? previo?.racionesVegetales;
    const log = {
      athleteId: profile.email, date: viewDate, dietId, doneItemIds, meals, budget, objetivo,
      ...(aguaMl !== undefined ? { aguaMl } : {}),
      ...(racionesVegetales !== undefined ? { racionesVegetales } : {}),
    };
    queryClient.setQueryData(['dietCompletionLog', profile.email, viewDate], { ...log, id: `${profile.email}_${viewDate}` });
    return saveDietCompletionLog(log)
      .catch(() => showToast('No se pudo guardar el registro del día. Se reintentará al recargar.', 'error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- diaKey se deriva de profile.email y viewDate
  }, [profile.email, viewDate, allDietsList, queryClient, showToast]);

  const guardarHabitos = (patch: { aguaMl?: number; racionesVegetales?: number }) => {
    if (!selectedDiet) return;
    const hechos = (Object.entries(itemStates) as [string, ItemState][]).filter(([, st]) => st.done).map(([k]) => k);
    void guardarDia(selectedDiet.meals, hechos, selectedDiet, patch);
  };

  /** Atajo para los sitios que solo cambian marcas, sin tocar las comidas. */
  const persistCompletion = (_dietId: string, doneItemIds: string[]) => {
    if (!selectedDiet) return;
    void guardarDia(selectedDiet.meals, doneItemIds, selectedDiet);
  };

  /* Ya no hay `handleToggleDone` ni `handleToggleMealDone`. Marcar "comido"
     era un paso que no decidía nada: si un alimento está en tu día es porque te
     lo has comido. Se marca solo al añadirlo, y para deshacerlo se quita la
     fila (deslizando a la izquierda), que es lo que el atleta quería hacer de
     verdad cuando desmarcaba. */


  const handleOpenAddPicker = (mealId: string, category: FoodCategory = 'HC') => {
    setPickerItem({ mealId, itemIdx: null, category });
    setSearchTerm('');
    setPickerAddedCounts({});
  };

  /** Mete una o varias líneas (un producto repartido en categorías) en la comida
   *  abierta, ya marcadas como comidas, con tick, toast y «Deshacer». */
  const agregarItems = (newItems: DietItem[], etiqueta: string, foodId: string, mealIdDestino?: string) => {
    const mealId = mealIdDestino ?? pickerItem?.mealId;
    if (!mealId || !selectedDiet) return;
    if (reemplazo) {
      cambiarLineas(reemplazo, { mealId, items: newItems });
      setReemplazo(null);
      setPickerItem(null);
      void haptics.light();
      showToast(`Cambiado por ${foodNameWithoutGrams(etiqueta)}.`, 'success');
      return;
    }
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) { setPickerItem(null); return; }
    const primerIdx = meal.items.length;
    setSelectedDiet(prev => {
      if (!prev) return prev;
      return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: [...m.items, ...newItems] }) };
    });
    // Nace COMIDO: si lo has metido en el día es porque te lo has comido.
    setItemStates(prev => {
      const next = { ...prev };
      newItems.forEach((it, k) => { next[`${mealId}_${primerIdx + k}`] = { foodLabel: it.foodLabel, done: true }; });
      return next;
    });
    setSearchTerm('');
    void haptics.light();
    tutorial.markActionDone('registrar-ingesta');
    setPickerAddedCounts(prev => ({ ...prev, [foodId]: (prev[foodId] ?? 0) + 1 }));
    showToast(`${foodNameWithoutGrams(etiqueta)} añadido.`, 'success', {
      actionLabel: 'Deshacer',
      onAction: () => {
        setSelectedDiet(prev => {
          if (!prev) return prev;
          return { ...prev, meals: prev.meals.map(m => m.id !== mealId ? m : { ...m, items: m.items.filter(it => !newItems.includes(it)) }) };
        });
        setItemStates(prev => {
          const next = { ...prev };
          newItems.forEach((_, k) => { delete next[`${mealId}_${primerIdx + k}`]; });
          return next;
        });
        setPickerAddedCounts(prev => ({ ...prev, [foodId]: Math.max(0, (prev[foodId] ?? 1) - 1) }));
      },
    });
  };

  const nuevoLineaId = () => `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const confirmarGramos = (food: MealItem, gramos: number) => {
    const items = itemsDeAlimentoPorGramos(food, gramos, nuevoLineaId());
    setGramosDe(null);
    agregarItems(items, food.label, food.id);
  };

  const confirmarProductoOff = (prod: OffProducto, gramos: number) => {
    const extras = extrasDeRacion(prod, gramos);
    const r = itemsDeProducto({
      nombre: prod.n, ...(prod.b ? { marca: prod.b } : {}), gramos, lineaId: nuevoLineaId(),
      origen: { tipo: 'off', codigo: prod.c },
      porCien: { kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g },
      ...(extras ? { extras } : {}),
    });
    setProductoOffAbierto(null);
    if (r.items.length === 0) {
      showToast('Esa ración es demasiado pequeña para contarla en tu día.', 'info');
      return;
    }
    agregarItems(r.items, prod.n, `off_${prod.c}`);
  };

  const confirmarAlimentoCatalogo = (a: AlimentoCatalogo, gramos: number) => {
    const prod = comoProducto(a);
    const extras = extrasDeRacion(prod, gramos);
    const r = itemsDeProducto({
      nombre: prod.n, gramos, lineaId: nuevoLineaId(),
      origen: { tipo: 'catalogo', id: a.id },
      porCien: { kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g },
      ...(extras ? { extras } : {}),
    });
    setAlimentoCatalogoAbierto(null);
    if (r.items.length === 0) {
      showToast('Esa ración es demasiado pequeña para contarla en tu día.', 'info');
      return;
    }
    agregarItems(r.items, prod.n, `cat_${a.id}`);
  };



  const handleSelectFood = (food: MealItem) => {
    if (!pickerItem || !selectedDiet) return;
    const { mealId } = pickerItem;
    // Se pregunta cuántos gramos, si se pueden saber; lo que no se pesa
    // (medidas caseras) entra como una ración.
    if (sePuedeEnGramos(food)) { abrirFichaBanco(food, mealId); return; }
    const newItem: DietItem = {
      category: food.category, foodLabel: food.label, quantity: 1,
      baseGrams: parseBaseGrams(food.label) ?? undefined,
    };
    agregarItems([newItem], food.label, food.id);
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
  };

  // El índice se pide en cuanto se entra en la pestaña "Recetario" del picker
  // — no antes, para no bajar nada si el atleta se queda en "Mis recetas".
  const cargarIndiceRecetario = useCallback(() => {
    setIndiceRecetarioEstado('cargando');
    cargarIndiceRecetas()
      .then(rs => { setIndiceRecetario(rs); setIndiceRecetarioEstado(rs.length > 0 ? 'listo' : 'error'); })
      .catch(() => setIndiceRecetarioEstado('error'));
  }, []);
  useEffect(() => {
    if (!recipePickerMealId || recipeSource !== 'recetario' || indiceRecetario.length > 0) return;
    cargarIndiceRecetario();
  }, [recipePickerMealId, recipeSource, indiceRecetario.length, cargarIndiceRecetario]);

  // ── "Guardar como receta" ────────────────────────────────────────────────

  const openSaveMealAsRecipe = (meal: DietMeal) => {
    setSavingMealAsRecipeId(meal.id);
    setRecipeNameDraft(meal.name);
  };

  const confirmSaveMealAsRecipe = async (meal: DietMeal) => {
    const name = recipeNameDraft.trim();
    // Se guarda lo comido de esa comida, con sus kcal y gramos reales (los de
    // las etiquetas cuando los hay): son los que luego lee la receta.
    const items = meal.items.filter((_, i) => itemStates[`${meal.id}_${i}`]?.done);
    if (!name || items.length === 0) return;
    setSavingRecipe(true);
    try {
      const placed: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
      for (const item of items) addToPlaced(placed, item.category, item.quantity);
      const exchanges = { HC: placed.HC, PROT: placed.PROT, GRASA: placed.GRASA };
      const macrosComida = redondearMacros(macrosDeLineas(items));
      const ingredients: Recipe['ingredients'] = items.map(item => ({
        foodLabel: item.foodLabel, category: item.category, mode: activeDietMode, quantity: item.quantity,
      }));
      const saved = await createRecipe({
        ownerId: profile.userId,
        name,
        categories: [],
        ingredients,
        extras: [],
        steps: [],
        // `exchanges` sigue para los binarios viejos; manda `macros`.
        exchanges,
        macros: { prot: macrosComida.p, carb: macrosComida.hc, fat: macrosComida.g },
        kcal: Math.round(macrosComida.kcal),
      });
      setRecipes(prev => [...prev, saved]);
      showToast(`"${name}" guardada como receta — ya está disponible en Recetas.`, 'success');
      setSavingMealAsRecipeId(null);
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleApplyRecipe = (recipe: Recipe, mealIdDirecta?: string) => {
    const mealIdObjetivo = mealIdDirecta ?? recipePickerMealId;
    if (!mealIdObjetivo || !selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealIdObjetivo);
    if (!meal) return;
    setRecipePickerMealId(null);
    void anadirRecetaCalorias(recipe, mealIdObjetivo);
  };

  /**
   * Desmarca en «Mi menú» una comida que se acaba de quitar del plan.
   *
   * Sin esto, las dos pantallas se contradicen: el plato ya no está en el plan
   * pero el menú lo sigue enseñando con el tick puesto, y al volver a marcarlo
   * `registrarComidaDelMenu` lo daría por ya registrado y no haría nada — el
   * atleta se quedaría sin poder devolverlo. La clave del menú (`${día}_${id}`)
   * es exactamente la misma que `origenMenu`, así que basta con quitarla.
   */
  const desmarcarEnElMenu = async (origenMenu: string) => {
    try {
      const log = await getMenuCompletionLog(profile.email, viewDate);
      if (!log?.doneMealKeys?.includes(origenMenu)) return;
      const doneMealKeys = log.doneMealKeys.filter(k => k !== origenMenu);
      await saveMenuCompletionLog({
        athleteId: profile.email, date: viewDate, menuId: log.menuId, doneMealKeys,
      });
      queryClient.setQueryData<MenuCompletionLog | null>(
        ['menuCompletionLog', profile.email, viewDate],
        prev => prev ? { ...prev, doneMealKeys } : prev,
      );
    } catch {
      // Que no se pueda desmarcar en el menú no debe impedir quitarlo del plan:
      // el registro del día es lo que cuenta para los macros.
    }
  };

  /** Quitar una receta entera: se van todos sus ítems de golpe, no uno a uno. */
  const handleRemoveReceta = (mealId: string, idxs: number[]) => {
    if (!selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const origenMenu = meal.items[idxs[0]]?.origenMenu;
    if (origenMenu) void desmarcarEnElMenu(origenMenu);
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

  /** El stepper de una receta entera va en raciones del plato (×1, ×1,25…),
   *  no en intercambios: `escalarReceta` mueve el plato por su ítem mayor, así
   *  que el paso se traduce a esa escala. Por debajo de ¼ de ración, no baja. */
  const escalarRacionesDeReceta = (meal: DietMeal, idxs: number[], pasoRaciones: number) => {
    const escala = meal.items[idxs[0]]?.escala ?? 1;
    if (escala + pasoRaciones < 0.25) return;
    const base = idxs.reduce((max, i) => Math.max(max, meal.items[i]?.quantity ?? 0), 0);
    if (base <= 0) return;
    handleEscalarReceta(meal.id, idxs, base * (pasoRaciones / escala));
  };

  const handleRemoveItem = (mealId: string, itemIdx: number) => {
    if (!selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    // Un acompañamiento que vino del menú: al quitarlo del plan hay que
    // desmarcar su comida, o el menú se queda con el tick puesto.
    const origenSuelto = meal.items[itemIdx]?.origenMenu;
    if (origenSuelto) void desmarcarEnElMenu(origenSuelto);
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

  /**
   * Abre la ficha de una receta del plan. `intercambiosEnElPlato` es lo que esa
   * receta ocupa AHORA en la comida, que no tiene por qué ser lo que ocupa de
   * fábrica: si el atleta le ha dado al + del renglón, la ficha tiene que
   * enseñar los gramos escalados y no los originales (era el fallo: subías los
   * intercambios y la avena seguía diciendo 40 g).
   */
  const abrirReceta = async (mealId: string, recipeId: string, intercambiosEnElPlato: number, escalaGuardada?: number) => {
    // Testigo de "esta es la petición que vale". Sin él, abrir una receta que
    // hay que ir a buscar y pasar deprisa a otra dejaba ganar a la que
    // respondiera la última: la ficha se cambiaba sola por la anterior, y si
    // para entonces ya se había cerrado el diálogo, volvía a abrirse solo.
    const peticion = ++peticionRecetaRef.current;
    setRecetaAbierta({ mealId, recipeId, factor: 1 });
    setRecetaDetalle(null);
    setCargandoReceta(true);
    // Puede estar ya entre las recetas cargadas (las del coach y las propias);
    // si no, es una del recetario y se pide la completa, con pasos y cantidades.
    const yaCargada = recipes.find(r => r.id === recipeId);
    const completa = yaCargada ?? await getRecipeById(recipeId).catch(() => null);
    if (peticion !== peticionRecetaRef.current) return;
    if (completa) {
      const base = BUDGET_CATS.reduce((s, c) => s + recipeExchanges(completa)[c], 0);
      // La escala guardada manda: deducirla fallaba en los platos de 5,5-6
      // intercambios, donde un toque del stepper queda por debajo del umbral
      // de ruido. Ver escalaDeReceta.
      setRecetaAbierta({ mealId, recipeId, factor: escalaDeReceta({ escala: escalaGuardada }, intercambiosEnElPlato, base) });
    }
    setRecetaDetalle(completa);
    setCargandoReceta(false);
  };

  const cerrarReceta = () => {
    peticionRecetaRef.current++;
    setCargandoReceta(false);
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
      ? await queryRecetasForGenerator(slot, 300, listaMenu, quiereAlgunaDieta(seleccion, paquetes), filtroDuro({ ...swapPrefs, allergies: swapPrefs.allergies ?? [], seleccion })).catch(() => [] as Recipe[])
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
      void guardarDia(plan.meals, doneItemIds, plan);
    };
    pendiente.current = { guardar: escribir };
    const t = setTimeout(escribir, 1200);
    return () => clearTimeout(t);
  }, [isDirty, selectedDiet, itemStates, guardarDia]);

  /** Suelta lo pendiente ya. Se llama antes de cambiar de día y al salir. */
  const guardarYa = useCallback(() => { pendiente.current?.guardar(); }, []);
  useEffect(() => guardarYa, [guardarYa]);

  /* Y también al irse de la app, que es lo que de verdad pasa aquí.
     El atleta apunta el desayuno y se va: pulsa el botón de inicio, cambia de
     app, bloquea el móvil. Nada de eso desmonta el componente, así que la
     limpieza de arriba no corre y lo que quedara dentro de la pausa de 1,2 s
     se perdía — el día volvía a aparecer en blanco. `visibilitychange` cubre
     el navegador y la web dentro del binario; `pagehide` cubre el cierre. */
  useEffect(() => {
    const alOcultarse = () => { if (document.visibilityState === 'hidden') guardarYa(); };
    document.addEventListener('visibilitychange', alOcultarse);
    window.addEventListener('pagehide', guardarYa);
    return () => {
      document.removeEventListener('visibilitychange', alOcultarse);
      window.removeEventListener('pagehide', guardarYa);
    };
  }, [guardarYa]);

  const irAlDia = (fecha: string) => {
    guardarYa();
    setViewDate(fecha);
  };

  // ── Recipe hand-off from Recetas (favoritos → "Añadir a Intercambios") ──────

  // Mirrors handleApplyRecipe, but takes an explicit mealId instead of reading it
  // from recipePickerMealId state — needed when the target meal is decided
  // programmatically (auto when there's a single meal, or via chooseMealForRecipe).
  const addRecipeToMeal = (pendiente: RecetaPendiente, mealId: string, currentDiet: Diet) => {
    const meal = currentDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const { recipe } = pendiente;
    // En «Calorías y macros» la receta entra ingrediente a ingrediente, salvo
    // que venga de «Mi menú» con su ración ya resuelta.
    if (!pendiente.items) { void anadirRecetaCalorias(recipe, mealId, pendiente.escala); return; }
    /* Si quien manda la receta ya sabe qué se come exactamente —«Mi menú», que
     * conoce la escala servida y los extras—, esos ítems mandan. Reconstruirlos
     * aquí desde la receta cruda era el «20 intercambios salen 26»: entraba el
     * plato base en vez de la ración y media con pan que el atleta se comió.
     * Ver utils/paridadDeCaminos.test.ts. */
    const newItems: DietItem[] = pendiente.items ?? recipeToDietItems(recipe, enabledModes);
    if (newItems.length === 0) {
      showToast(`No se pudo añadir "${recipe.name}": no tiene datos nutricionales.`, 'error');
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
  const pendingRecipeProcesadaRef = useRef<RecetaPendiente | null>(null);
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

  // ── Diario en «Calorías y macros» (Dani, 25-10-2026) ─────────────────────────
  // Ver components/nutrition/calorias/. Mismo registro del día; cambia cómo se
  // enseña y cómo se apunta. Aquí no se habla de intercambios.

  const conMayuscula = (t: string) => t.charAt(0).toLocaleUpperCase('es-ES') + t.slice(1);
  const hechosDelDia = useMemo(
    () => new Set((Object.entries(itemStates) as [string, ItemState][]).filter(([, st]) => st.done).map(([k]) => k)),
    [itemStates],
  );
  const nombreDeReceta = useCallback((id: string) => recipes.find(r => r.id === id)?.name, [recipes]);

  /**
   * Quita unas líneas de una comida y mete otras, en un solo paso. Si es la
   * misma comida, las nuevas ocupan el sitio de las quitadas (editar los gramos
   * de algo no lo manda al final de la lista). Lo nuevo nace comido.
   */
  const cambiarLineas = (
    origen: { mealId: string; idxs: number[] } | null,
    destino: { mealId: string; items: DietItem[] } | null,
  ) => {
    if (!selectedDiet) return;
    const states = { ...itemStates };
    const meals = selectedDiet.meals.map(m => {
      const quita = origen?.mealId === m.id ? new Set(origen.idxs) : null;
      const mete = destino?.mealId === m.id ? destino.items : null;
      if (!quita && !mete) return m;
      const filas: { item: DietItem; st?: ItemState }[] = [];
      let hueco = -1;
      m.items.forEach((item, i) => {
        if (quita?.has(i)) { if (hueco < 0) hueco = filas.length; return; }
        filas.push({ item, st: itemStates[`${m.id}_${i}`] });
      });
      if (mete) {
        const nuevas = mete.map(item => ({ item, st: { foodLabel: item.foodLabel, done: true } }));
        filas.splice(hueco >= 0 ? hueco : filas.length, 0, ...nuevas);
      }
      Object.keys(states).forEach(k => { if (k.startsWith(`${m.id}_`)) delete states[k]; });
      filas.forEach((f, i) => { if (f.st) states[`${m.id}_${i}`] = f.st; });
      return { ...m, items: filas.map(f => f.item) };
    });
    setSelectedDiet({ ...selectedDiet, meals });
    setItemStates(states);
  };

  const comidasDelDia = useMemo(
    () => (selectedDiet?.meals ?? []).map((m, i) => ({ id: m.id, nombre: mealLabel(m.name, i + 1) })),
    [selectedDiet],
  );


  /* La ficha (cantidad, raciones, comida). Un solo estado para todos los
     orígenes: quien la abre deja dicho qué hacer al confirmar. */
  type FichaAbierta =
    | ({ tipo: 'valores'; alConfirmar: (gramos: number, mealId: string) => void } & Omit<React.ComponentProps<typeof FichaAlimentoCalorias>, 'comidas' | 'onConfirm' | 'onClose'>)
    | { tipo: 'off'; codigo: string; nombre: string; marca?: string; ultimos?: number; mealId: string };
  const [ficha, setFicha] = useState<FichaAbierta | null>(null);

  function abrirFichaBanco(food: MealItem, mealId: string) {
    const ultimos = ultimosGramos(food.id) ?? ultimosGramos(food.label);
    const exacto = food.personal && food.porCien;
    const porCien = exacto
      ? { kcal: food.porCien!.kcal, p: food.porCien!.prot, hc: food.porCien!.hc, g: food.porCien!.grasa }
      : previsionDeGramos(food, 100).nutrientes;
    if (!porCien) { agregarItems([{ category: food.category, foodLabel: food.label, quantity: 1 }], food.label, food.id, mealId); return; }
    const racion = gramosPorIntercambioDe(food) ?? undefined;
    setFicha({
      tipo: 'valores',
      nombre: conMayuscula(foodNameWithoutGrams(food.label)),
      porCien,
      raciones: racionesDe({ ultimos, racion: exacto ? undefined : racion }),
      aproximado: !exacto,
      mealId,
      alConfirmar: (g, m) => {
        const items = itemsDeAlimentoPorGramos(food, g, nuevoLineaId());
        agregarItems(items, food.label, food.id, m);
      },
    });
  }

  function abrirFichaCatalogo(a: AlimentoCatalogo, mealId: string) {
    const prod = comoProducto(a);
    setFicha({
      tipo: 'valores',
      nombre: nombreDeAlimento(a),
      porCien: { kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g },
      extrasPorCien: { f: prod.f, az: prod.az, sat: prod.sat, sal: prod.sal },
      raciones: racionesDe({ ultimos: ultimosGramos(claveDeCatalogo(a.id)), unidad: a.unidad }),
      nota: a.fuente ? `Valores por 100 g · ${a.fuente}` : undefined,
      mealId,
      alConfirmar: (g, m) => {
        const extras = extrasDeRacion(prod, g);
        const r = itemsDeProducto({
          nombre: prod.n, gramos: g, lineaId: nuevoLineaId(), origen: { tipo: 'catalogo', id: a.id },
          porCien: { kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g },
          ...(extras ? { extras } : {}),
        });
        if (r.items.length === 0) { showToast('Esa ración es demasiado pequeña para contarla en tu día.', 'info'); return; }
        agregarItems(r.items, prod.n, `cat_${a.id}`, m);
      },
    });
  }

  const confirmarFichaOff = (codigo: string, gramos: number, mealId: string) => {
    const prod = queryClient.getQueryData<OffProducto | null>(['offProducto', codigo]);
    if (!prod) return;
    const extras = extrasDeRacion(prod, gramos);
    const r = itemsDeProducto({
      nombre: prod.n, ...(prod.b ? { marca: prod.b } : {}), gramos, lineaId: nuevoLineaId(),
      origen: { tipo: 'off', codigo: prod.c },
      porCien: { kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g },
      ...(extras ? { extras } : {}),
    });
    if (r.items.length === 0) { showToast('Esa ración es demasiado pequeña para contarla en tu día.', 'info'); return; }
    agregarItems(r.items, prod.n, `off_${prod.c}`, mealId);
  };

  /** Tocar una línea del diario: su ficha, con sus gramos, para cambiarla o moverla de comida. */
  const abrirLineaDelDiario = (mealId: string, linea: LineaDiario) => {
    const meal = selectedDiet?.meals.find(m => m.id === mealId);
    if (!meal) return;
    const primera = meal.items[linea.idxs[0]];
    if (linea.tipo === 'plato') {
      if (!primera?.originRecipeId) return;
      const total = linea.idxs.reduce((s, i) => s + (meal.items[i]?.quantity ?? 0), 0);
      void abrirReceta(mealId, primera.originRecipeId, total, primera.escala);
      return;
    }
    if (!linea.gramos || !linea.macros || linea.kcal === null) return;
    const f = 100 / linea.gramos;
    const porCien = { kcal: linea.kcal * f, p: linea.macros.p * f, hc: linea.macros.hc * f, g: linea.macros.g * f };
    const conDatos = linea.idxs.map(i => meal.items[i]).find(it => it.extras) ?? primera;
    const ex = conDatos.extras;
    const extrasPorCien = ex ? { f: ex.f != null ? ex.f * f : undefined, az: ex.az != null ? ex.az * f : undefined, sat: ex.sat != null ? ex.sat * f : undefined, sal: ex.sal != null ? ex.sal * f : undefined } : undefined;
    setFicha({
      tipo: 'valores',
      nombre: linea.nombre,
      marca: linea.marca,
      porCien,
      extrasPorCien,
      raciones: [{ etiqueta: `${linea.gramos} g`, gramos: linea.gramos, nota: 'Apuntado' }, ...(linea.gramos === 100 ? [] : [{ etiqueta: '100 g', gramos: 100 }])],
      aproximado: linea.aproximado,
      mealId,
      textoBoton: 'Guardar',
      onCambiar: () => {
        setFicha(null);
        setReemplazo({ mealId, idxs: linea.idxs });
        handleOpenAddPicker(mealId);
      },
      alConfirmar: (g, m) => {
        let nuevos: DietItem[];
        if (linea.tipo === 'producto') {
          const r = itemsDeProducto({
            nombre: primera.foodLabel, ...(primera.marca ? { marca: primera.marca } : {}), gramos: g, lineaId: nuevoLineaId(),
            origen: primera.origen ?? { tipo: 'personal' }, porCien,
            ...(extrasPorCien ? { extras: Object.fromEntries(Object.entries(extrasPorCien).filter(([, v]) => v != null).map(([k, v]) => [k, Math.round((v as number) * g) / 100])) } : {}),
            ...(primera.hora ? { hora: primera.hora } : {}),
          });
          nuevos = r.items.map(it => (primera.receta ? { ...it, receta: primera.receta } : it));
        } else {
          const base = primera.baseGrams ?? linea.gramos / Math.max(0.01, primera.quantity);
          nuevos = [{ ...primera, quantity: Math.max(0.01, Math.round((g / base) * 100) / 100), baseGrams: base }];
        }
        if (nuevos.length === 0) { showToast('Esa ración es demasiado pequeña para contarla en tu día.', 'info'); return; }
        cambiarLineas({ mealId, idxs: linea.idxs }, { mealId: m, items: nuevos });
      },
    });
  };

  /** Una receta en «Calorías y macros»: ingrediente a ingrediente si hay datos. */
  const anadirRecetaCalorias = async (recipe: Recipe, mealId: string, escala = 1) => {
    let completa = recipe;
    if (faltanCantidades(recipe)) {
      completa = (await getRecipeById(recipe.id).catch(() => null)) ?? recipe;
    }
    const catalogo = await queryClient.fetchQuery({ queryKey: ['catalogoAlimentos'], queryFn: getCatalogoAlimentos, staleTime: 60 * 60_000 })
      .catch(() => [] as AlimentoCatalogo[]);
    const { items } = recetaDesglosada(completa, { catalogo, nuevoLineaId, enabledModes, factor: escala });
    if (items.length === 0) {
      showToast(`No se pudo añadir "${recipe.name}": no trae sus cantidades.`, 'error');
      return;
    }
    agregarItems(items, recipe.name, `receta_${recipe.id}`, mealId);
  };

  /** Copia a una comida lo que se apuntó en la misma comida ayer. */
  const copiarDeAyer = async (mealId: string) => {
    if (!selectedDiet) return;
    const idx = selectedDiet.meals.findIndex(m => m.id === mealId);
    const ayer = await getDietCompletionLog(profile.email, addDays(viewDate, -1)).catch(() => null);
    const comidaAyer = ayer?.meals?.find(m => m.id === mealId)
      ?? ayer?.meals?.find(m => m.name === selectedDiet.meals[idx]?.name)
      ?? ayer?.meals?.[idx];
    if (!ayer || !comidaAyer) { showToast('Ayer no apuntaste nada en esta comida.', 'info'); return; }
    const hechosAyer = new Set(ayer.doneItemIds ?? []);
    const ids = new Map<string, string>();
    const items = comidaAyer.items
      .filter((_, i) => hechosAyer.has(`${comidaAyer.id}_${i}`))
      .map(({ hora: _h, origenMenu: _o, ...it }) => {
        if (!it.lineaId) return it;
        if (!ids.has(it.lineaId)) ids.set(it.lineaId, nuevoLineaId());
        return { ...it, lineaId: ids.get(it.lineaId)! };
      });
    if (items.length === 0) { showToast('Ayer no apuntaste nada en esta comida.', 'info'); return; }
    cambiarLineas(null, { mealId, items });
    showToast(`Copiado de ayer: ${items.length === 1 ? '1 alimento' : `${new Set(items.map(i => i.lineaId ?? i.foodLabel)).size} alimentos`}.`, 'success');
  };

  /* La semana del diario: kcal apuntadas por día (los últimos 30 días, ya
     pedidos para el historial) más el día que se está editando, en vivo. */
  const kcalPorFecha = useMemo(() => {
    const out: Record<string, number> = {};
    for (const log of registrosUsados) out[log.date] = resumenDelDia(log.meals, log.doneItemIds ?? []).kcal;
    out[viewDate] = resumenMacros.kcal;
    return out;
  }, [registrosUsados, viewDate, resumenMacros.kcal]);

  /* «Añadir alimento» en calorías: pestañas y filas. */
  const [pestanaAnadir, setPestanaAnadir] = useState<PestanaAnadir>('recientes');
  const hayRecientes = usados.recientes.length + usados.frecuentes.length > 0;
  useEffect(() => {
    if (usarListaRapida) setPestanaAnadir(hayRecientes ? 'recientes' : 'generales');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir la hoja
  }, [usarListaRapida]);

  const seccionesAnadir = useMemo((): { secciones: SeccionFilas[]; vacio: string } => {
    if (!usarListaRapida || !pickerItem) return { secciones: [], vacio: '' };
    const mealId = pickerItem.mealId;
    const term = searchTerm.trim();
    const coincide = (label: string) => !term || coincideBusqueda(label, term) || coincidePorEquivalencia(label, term);
    const veces = (clave: string) => pickerAddedCounts[clave] ?? 0;

    const filaBanco = (food: MealItem): FilaAlimento => {
      const g = gramosSugeridos(food, ultimosGramos(food.id));
      const n = previsionDeGramos(food, g).nutrientes;
      return {
        clave: `banco_${food.id}`,
        nombre: conMayuscula(foodNameWithoutGrams(food.label)),
        detalle: n ? `${n.kcal} kcal, ${g} g` : undefined,
        tuyo: !!food.personal,
        anadido: veces(food.id),
        onAbrir: () => handleSelectFood(food),
        ...(food.personal && food.porCien ? { onEditar: () => setAlimentoAEditar(food) } : {}),
      };
    };
    const filaUsado = (u: AlimentoUsado): FilaAlimento | null => {
      const detalle = [u.kcal != null ? `${u.kcal} kcal` : null, u.gramos ? `${u.gramos} g` : null].filter(Boolean).join(', ') || undefined;
      const reanadir = u.lineas && u.lineas.length > 0
        ? () => {
          const id = nuevoLineaId();
          agregarItems(u.lineas!.map(l => (l.lineaId ? { ...l, lineaId: id } : l)), u.label, u.clave);
        }
        : undefined;
      if (u.tipo === 'off' && u.codigo) {
        const codigo = u.codigo;
        return { clave: u.clave, nombre: u.label, detalle, anadido: veces(u.clave), onAbrir: () => setFicha({ tipo: 'off', codigo, nombre: u.label, marca: u.marca, ultimos: u.gramos, mealId }), onAnadir: reanadir };
      }
      if (u.tipo === 'catalogo') {
        const a = catalogoAlimentos.find(x => claveDeCatalogo(x.id) === u.clave);
        return { clave: u.clave, nombre: a ? nombreDeAlimento(a) : u.label, detalle, anadido: veces(u.clave), onAbrir: () => (a ? abrirFichaCatalogo(a, mealId) : reanadir?.()), onAnadir: reanadir };
      }
      const food = foodItems.find(f => f.id === u.clave) ?? foodItems.find(f => f.label === u.clave);
      if (!food) return reanadir ? { clave: u.clave, nombre: conMayuscula(foodNameWithoutGrams(u.label)), detalle, anadido: veces(u.clave), onAbrir: reanadir, onAnadir: reanadir } : null;
      return { ...filaBanco(food), clave: u.clave, detalle: detalle ?? filaBanco(food).detalle, anadido: veces(u.clave) + veces(food.id), onAnadir: reanadir };
    };

    /* Alimentos generales: los 310 del banco en el modo de dieta del atleta,
       por grupo, con las kcal de su ración (utils/alimentosGenerales.ts). */
    const filaGeneral = (a: AlimentoGeneral): FilaAlimento => ({
      clave: `banco_${a.food.id}`,
      nombre: a.nombre,
      detalle: `${a.porRacion.kcal} kcal · ${a.racion}`,
      anadido: veces(a.food.id),
      onAbrir: () => handleSelectFood(a.food),
    });
    const generales = alimentosGeneralesPorGrupo(foodItemsComunes, activeDietMode)
      .map(g => ({ titulo: g.titulo, filas: g.alimentos.filter(a => coincide(a.food.label) || coincide(a.nombre)).map(filaGeneral) }));
    const filasRecetas = recipes
      .filter(r => coincideBusqueda(r.name, term) && isSafeForAthlete(r))
      .map((r): FilaAlimento => {
        const kcal = Math.round(macrosDeReceta(r).kcal);
        return { clave: `receta_${r.id}`, nombre: r.name, detalle: kcal ? `${kcal} kcal` : undefined, anadido: veces(`receta_${r.id}`), onAbrir: () => void anadirRecetaCalorias(r, mealId) };
      });
    const filasMios = alimentosPropios.filter(f => coincide(f.label)).map(filaBanco);

    if (pestanaAnadir === 'generales') {
      return { secciones: generales, vacio: 'Ningún alimento general se llama así. Prueba en «Todo».' };
    }
    if (pestanaAnadir === 'comidas') {
      return {
        secciones: [
          { titulo: 'Mis recetas y comidas', filas: filasRecetas },
          { titulo: 'Mis alimentos', filas: filasMios },
        ],
        vacio: term
          ? 'Nada tuyo se llama así.'
          : 'Aún no tienes nada tuyo. Guarda una comida desde su menú «···» o crea un alimento desde su etiqueta.',
      };
    }
    if (pestanaAnadir === 'recientes') {
      const vistos = new Set<string>();
      const historial = [...usados.recientes, ...usados.frecuentes]
        .filter(u => { if (vistos.has(u.clave)) return false; vistos.add(u.clave); return true; })
        .filter(u => coincide(u.label))
        .map(filaUsado).filter((x): x is FilaAlimento => !!x);
      return { secciones: [{ titulo: 'Lo que más apuntas', filas: historial }], vacio: term ? 'No has apuntado nada con ese nombre. Prueba en «Todo».' : 'Aún no has apuntado nada. Mira los alimentos generales o busca uno.' };
    }
    // Todo: el buscador sobre toda la app.
    if (!term) {
      return { secciones: [], vacio: 'Escribe para buscar entre todos los alimentos, los productos del supermercado y tus recetas.' };
    }
    return {
      secciones: [
        { titulo: 'Mis alimentos', filas: filasMios },
        { titulo: 'Alimentos', filas: alimentosDelCatalogo.map((a): FilaAlimento => ({
          clave: `cat_${a.id}`, nombre: nombreDeAlimento(a), detalle: `${Math.round(a.porCien.kcal)} kcal, 100 g`,
          anadido: veces(`cat_${a.id}`), onAbrir: () => abrirFichaCatalogo(a, mealId),
        })) },
        { titulo: 'Alimentos generales', filas: generales.flatMap(g => g.filas).slice(0, 20) },
        { titulo: 'Mis recetas y comidas', filas: filasRecetas.slice(0, 20) },
        { titulo: 'Supermercado', filas: productosOff.map((e): FilaAlimento => ({
          clave: `off_${e.c}`, nombre: e.n, detalle: e.b || undefined, anadido: veces(`off_${e.c}`),
          onAbrir: () => setFicha({ tipo: 'off', codigo: e.c, nombre: e.n, marca: e.b || undefined, ultimos: ultimosGramos(claveDeProducto(e.c)), mealId }),
        })) },
      ],
      vacio: 'No hay nada con ese nombre. Prueba a escanearlo o créalo desde su etiqueta.',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los handlers se rehacen en cada render; lo que cambia la lista son los datos de abajo
  }, [usarListaRapida, pickerItem, searchTerm, pestanaAnadir, pickerAddedCounts, usados, foodItems, foodItemsComunes, alimentosPropios, catalogoAlimentos, alimentosDelCatalogo, productosOff, recipes, activeDietMode, isSafeForAthlete]);

  // ── Render ────────────────────────────────────────────────────────────────────

  /* ── Diario fusionado: apoyos de la tarjeta del día y de las comidas ── */
  const [menuDiaAbierto, setMenuDiaAbierto] = useState(false);
  const [menuComidaId, setMenuComidaId] = useState<string | null>(null);
  const numEs = (n: number) => Math.round(n).toLocaleString('es-ES');
  const navTarjeta = {
    etiquetaDia: viendoHoy ? 'Hoy'
      : viewDate === addDays(hoyFecha, -1) ? 'Ayer'
      : viewDate === addDays(hoyFecha, 1) ? 'Mañana'
      : `${conMayuscula(WD_FULL[diaSemanaDe(viewDate)])} ${Number(viewDate.slice(8))}`,
    puedeAvanzar: viewDate < maxFechaFutura,
    onDiaAnterior: () => irAlDia(addDays(viewDate, -1)),
    onDiaSiguiente: () => irAlDia(addDays(viewDate, 1)),
    onHoy: () => irAlDia(hoyFecha),
    onMasOpciones: () => setMenuDiaAbierto(true),
  };
  // Sin dieta del coach para el día no hay objetivo: decirlo en vez de enseñar
  // ceros que parecen un fallo (caso de danielbriz8, 26-10-2026).
  const notaTarjeta = kcalObjetivo === 0 && !dietaPautada
    ? 'Tu entrenador todavía no te ha puesto un objetivo para este día. Lo verás aquí en cuanto lo haga.'
    : undefined;

  /* Marcar o desmarcar como comido. Lo que mete el atleta nace comido; lo que
     trae sembrado el plan del coach entra sin marcar y se marca aquí. Una
     receta o un producto son varias líneas y se marcan juntas. */
  const alternarComido = (mealId: string, idxs: number[]) => {
    if (!selectedDiet) return;
    const meal = selectedDiet.meals.find(m => m.id === mealId);
    if (!meal) return;
    const todas = idxs.every(i => itemStates[`${mealId}_${i}`]?.done);
    const states = { ...itemStates };
    idxs.forEach(i => {
      const k = `${mealId}_${i}`;
      states[k] = { foodLabel: states[k]?.foodLabel ?? meal.items[i]?.foodLabel ?? '', done: !todas };
    });
    setItemStates(states);
    if (!todas) void haptics.light();
    persistCompletion('', (Object.entries(states) as [string, ItemState][]).filter(([, st]) => st.done).map(([k]) => k));
  };
  const opcionMenu = (icon: string, label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-control px-2 py-3.5 text-left hover:bg-raised">
      <Icon name={icon} size="m" className="text-ink-2" />
      <span className="font-sans text-body text-ink">{label}</span>
    </button>
  );
  /** Círculo de «comido» de una fila. */
  const circuloComido = (mealId: string, idxs: number[], nombre: string) => {
    const hecho = idxs.length > 0 && idxs.every(i => itemStates[`${mealId}_${i}`]?.done);
    return (
      <button
        type="button"
        onClick={() => alternarComido(mealId, idxs)}
        aria-pressed={hecho}
        aria-label={hecho ? `Desmarcar ${nombre}` : `Marcar ${nombre} como comido`}
        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 transition-colors active:scale-90 ${hecho ? 'border-accent bg-accent text-on-accent' : 'border-ink-4 text-transparent hover:border-accent/60'}`}
      >
        <Icon name="check" size="s" />
      </button>
    );
  };
  /** Tocar una fila: su ficha con los gramos, para cambiarlos (o moverla de
   *  comida). Las líneas viejas del banco sin `baseGrams` sacan los gramos de
   *  su etiqueta. Devuelve false si no se puede pesar (medidas caseras). */
  const abrirFichaDeFila = (meal: DietMeal, idxs: number[]): boolean => {
    const todo = new Set<string>(meal.items.map((_, k) => `${meal.id}_${k}`));
    const linea = lineasDelDiario(meal, todo, nombreDeReceta).find(l => l.idxs[0] === idxs[0]);
    if (!linea) return false;
    if (!linea.gramos && linea.tipo === 'alimento') {
      const g = pesoDeItem(meal.items[idxs[0]]).gramos;
      if (!g) return false;
      abrirLineaDelDiario(meal.id, { ...linea, gramos: Math.round(g) });
      return true;
    }
    abrirLineaDelDiario(meal.id, linea);
    return true;
  };
  /** kcal de unas líneas de una comida (alimento suelto, receta o producto). */
  const kcalDeLineasComida = (meal: DietMeal, idxs: number[]) =>
    resumenDelDia([{ ...meal, items: idxs.map(i => meal.items[i]) }], idxs.map((_, k) => `${meal.id}_${k}`)).kcal;

  return (
    <div className="w-full space-y-6">
      {/* Sin cabecera propia: la barra de pestañas de Nutrición ya dice en qué
          pantalla estás, y repetirlo debajo con letra de titular se comía la
          primera pantalla entera del móvil (Dani, 10-09-2026). */}

      {/* Día de recarga marcado por el coach para el día que se está viendo —
          va antes que el cambio de fase porque es lo que cambia lo que come
          ESE día. */}
      {refeedDelDia && (
        <div
          className="flex items-start gap-2.5 rounded-surface px-4 py-3"
          style={{ background: 'color-mix(in srgb, var(--color-refeed) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-refeed) 30%, transparent)' }}
        >
          <Icon name="local_fire_department" size="m" style={{ color: 'var(--color-refeed)', flexShrink: 0 }} />
          <div className="min-w-0">
            <p className="font-sans font-bold text-body-s" style={{ color: 'var(--color-refeed)' }}>
              {viendoHoy ? 'Hoy toca recarga' : viendoFuturo ? 'Ese día toca recarga' : 'Ese día tocó recarga'}
            </p>
            {refeedDelDia.note && <p className="font-sans text-label text-ink-2 mt-0.5">{refeedDelDia.note}</p>}
          </div>
        </div>
      )}

      {program && <SemanaNutricionAtleta program={program} fecha={viewDate} />}
      {program?.minimos && (program.minimos.aguaL || program.minimos.raciones) && selectedDiet && (
        <HabitosDelDia
          minimos={program.minimos}
          aguaMl={diaLog?.aguaMl ?? 0}
          raciones={diaLog?.racionesVegetales ?? 0}
          onCambiar={guardarHabitos}
        />
      )}

      {/* Phase change banner */}
      {phaseBanner && (
        <div className="flex items-center justify-between gap-3 bg-accent/10 border border-accent/30 rounded-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="swap_horiz" size="m" className="text-accent-ink flex-shrink-0" />
            <p className="font-sans font-bold text-accent-ink text-body-s">{phaseBanner}</p>
          </div>
          <button
            onClick={() => setPhaseBanner(null)}
            className="text-accent-ink/60 hover:text-accent-ink transition-colors flex-shrink-0"
          >
            <Icon name="close" size="s" />
          </button>
        </div>
      )}

      <>
      {/* Diario de nutrición (10-2026): una sola pantalla, en kcal y gramos.
          Ver nutrition/DiaDeNutricion.tsx. */}
      {!loading && (
        <>
          <SemanaDelDiario
            fecha={viewDate}
            maxFecha={maxFechaFutura}
            onIrAlDia={irAlDia}
            pctPorFecha={f => { const k = kcalPorFecha[f]; return k && kcalObjetivo > 0 ? (k / kcalObjetivo) * 100 : null; }}
          />
        </>
      )}

      {loading ? (
        // 05 · Carga — esqueletos con barrido 1,4 s y stagger 150 ms, nunca
        // spinner ni cifras falsas (handoff).
        <div className="bg-surface border border-hairline rounded-canvas p-4 space-y-5">
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

          {selectedDiet && (
            <React.Fragment key={selectedDiet.id}>
              {/* ── 01 · Tarjeta del día ─────────────────────────────────────────── */}
              <div ref={trackerTargetRef}>
                <TarjetaDelDia
                  {...navTarjeta}
                  comido={resumenMacros.kcal}
                  objetivo={kcalObjetivo}
                  fmt={numEs}
                  etiquetaComido="comido"
                  pie="kcal"
                  macros={[
                    { etiqueta: 'Hidratos', comido: resumenMacros.hc, objetivo: objetivoDia.hc, color: 'var(--color-macro-hc)' },
                    { etiqueta: 'Grasa', comido: resumenMacros.g, objetivo: objetivoDia.g, color: 'var(--color-macro-grasa)' },
                    { etiqueta: 'Proteína', comido: resumenMacros.p, objetivo: objetivoDia.p, color: 'var(--color-macro-prot)' },
                  ]}
                  fmtMacro={(c, o) => `${numEs(c)}/${numEs(o)} g`}
                  cerrado={dayClosed}
                  nota={notaTarjeta ?? ((resumenMacros.aproximado || resumenMacros.incompletos > 0) ? (
                    <>
                      {resumenMacros.aproximado && 'Algunos alimentos son una estimación: el total es aproximado. '}
                      {resumenMacros.incompletos > 0 && `${resumenMacros.incompletos} ${resumenMacros.incompletos === 1 ? 'producto no declara' : 'productos no declaran'} sus nutrientes y no ${resumenMacros.incompletos === 1 ? 'suma' : 'suman'}.`}
                    </>
                  ) : undefined)}
                />
                {selectedDiet.coachNote && (
                  <p className="mt-2 px-1 font-sans text-label italic text-accent-ink">{selectedDiet.coachNote}</p>
                )}
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
                profile={profile}
                icon="swap_horiz"
                text="¿No te apetece algo? Toca Cambiar junto a cualquier alimento para sustituirlo por un equivalente."
              />


              {/* El cupo del día se CONGELA al sembrarlo: si el coach cambia la
                  dieta a media mañana, el atleta sigue con el de antes y no se
                  entera. Congelarlo es lo correcto —no se le puede mover el
                  objetivo con la comida ya marcada— pero callárselo no. */}
              {cupoCambiado && (
                <div className="bg-accent-bg border border-accent-line rounded-surface px-4 py-3.5 flex flex-wrap items-center gap-3">
                  <Icon name="sync_problem" size="s" style={{ color: 'var(--color-accent-ink)', flexShrink: 0 }} />
                  <p className="font-sans text-label text-ink-2 leading-relaxed flex-1 min-w-[200px]">
                    Tu entrenador ha cambiado {viendoHoy ? 'tu objetivo de hoy' : 'el objetivo de este día'}. Estás viendo el de antes.
                  </p>
                  <Button size="s" onClick={actualizarAlCupoNuevo}>Actualizar</Button>
                </div>
              )}

              <div className="space-y-4">
                {selectedDiet.meals.map((meal, mi) => {
                  const mealDone = meal.items.length > 0 && meal.items.every((_, idx) => itemStates[`${meal.id}_${idx}`]?.done);
                  return (
                    <div key={meal.id}
                      ref={mi === 0 ? firstMealRowTargetRef : undefined}
                      className={`bg-surface rounded-surface overflow-hidden border transition-all ${mealDone ? 'border-accent/40' : 'border-hairline'}`}
                    >
                      {/* Cabecera de la comida: «+» para añadir, el nombre con las
                          kcal comidas a la derecha y los gramos de cada macro. Sin
                          objetivo por comida (Dani, 26-10-2026): solo cuenta el
                          total del día. Recetas, guardar y quitar, en «···». */}
                      {(() => {
                        const r = resumenDelDia([meal], hechosDelDia);
                        const macrosComida = ([
                          ['HC', 'var(--color-macro-hc)', r.hc],
                          ['P', 'var(--color-macro-prot)', r.p],
                          ['G', 'var(--color-macro-grasa)', r.g],
                        ] as const).map(([etiqueta, color, comido]) => ({ etiqueta, color, comido, objetivo: 0 }))
                          .filter(m => m.comido > 0);
                        return (
                          <div className="flex items-center gap-3 px-3 py-3">
                            <button
                              type="button"
                              onClick={() => handleOpenAddPicker(meal.id)}
                              aria-label={`Añadir a ${mealLabel(meal.name, mi + 1)}`}
                              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-raised text-accent-ink transition-transform active:scale-90"
                            >
                              <Icon name="add" size="m" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={meal.name}
                                  onChange={e => renameMeal(meal.id, e.target.value)}
                                  placeholder={`Comida ${mi + 1}`}
                                  aria-label="Nombre de la comida"
                                  className="min-w-0 flex-1 bg-transparent border-none font-sans font-bold text-ink text-title-s focus:outline-none focus:ring-0 p-0"
                                />
                                {meal.libre && (
                                  <span className="flex-shrink-0 font-mono text-caption font-bold uppercase tracking-wider text-success border border-success/40 bg-success/10 rounded-chip px-2 py-0.5">
                                    Libre
                                  </span>
                                )}
                                <span className="flex-none font-mono text-caption text-ink-2 whitespace-nowrap">
                                  <b className="text-body-s text-ink">{numEs(r.kcal)}</b> kcal
                                </span>
                              </div>
                              {macrosComida.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1 -mr-10">
                                  {macrosComida.map(m => (
                                    <React.Fragment key={m.etiqueta}>
                                      <EtiquetaMacro
                                        m={m}
                                        fmt={c => `${numEs(c)} g`}
                                      />
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setMenuComidaId(meal.id)}
                              aria-label={`Opciones de ${mealLabel(meal.name, mi + 1)}`}
                              className="flex h-10 w-8 flex-none items-center justify-center text-ink-2 hover:text-ink"
                            >
                              <Icon name="more_vert" size="m" style={{ transform: 'rotate(90deg)' }} />
                            </button>
                          </div>
                        );
                      })()}

                      {(sugerenciasPorComida[meal.id]?.length ?? 0) > 0 && (
                        <div className="px-4 py-2 border-b border-hairline flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-caption uppercase tracking-wider text-ink-3">Encajan</span>
                          {sugerenciasPorComida[meal.id].map(r => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => handleApplyRecipe(r, meal.id)}
                              title={`Añadir «${r.name}» a ${meal.name}`}
                              className="max-w-[14rem] truncate rounded-chip border border-hairline px-2.5 py-1 font-sans text-caption text-ink-2 hover:text-accent-ink hover:border-accent-line transition-colors"
                            >
                              + {r.name}
                            </button>
                          ))}
                        </div>
                      )}

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
                            className="px-3 py-2 bg-info text-on-fill font-mono text-caption font-bold uppercase rounded-control disabled:opacity-40 transition-all"
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

                      {/* Item list */}
                      <div className="border-t border-hairline">
                        {meal.items.length === 0 ? (
                          <button
                            onClick={() => handleOpenAddPicker(meal.id)}
                            className="w-full px-4 py-3 text-left font-sans text-body-s text-ink-3 hover:text-accent-ink transition-colors"
                          >
                            Nada apuntado todavía. Toca + para añadir.
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
                                  onDelete={() => handleRemoveReceta(meal.id, fila.idxs)}
                                >
                                  <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-surface transition-colors duration-(--duration-state)">
                                    {circuloComido(meal.id, fila.idxs, nombreReceta)}

                                    {/* Toda la fila abre la receta: foto, ingredientes y
                                        pasos, igual que desde el Recetario. */}
                                    <button
                                      type="button"
                                      onClick={() => abrirReceta(meal.id, fila.recipeId, total, meal.items[fila.idxs[0]]?.escala)}
                                      className="flex-1 min-w-0 text-left rounded-control -m-1 p-1 transition-colors hover:bg-raised/60 active:bg-raised"
                                    >
                                      <span className="block font-sans text-body-s font-bold leading-snug text-ink">
                                        {nombreReceta}
                                      </span>
                                      <span className="block font-mono text-caption text-ink-2">
                                        {numEs(kcalDeLineasComida(meal, fila.idxs))} kcal · receta
                                      </span>
                                      {fila.origenMenu && (
                                        <span className="mt-0.5 flex items-center gap-1 font-sans text-caption text-ink-2">
                                          <Icon name="lock" size="s" />
                                          {viendoHoy ? 'De tu menú de hoy' : 'De tu menú de ese día'}
                                        </span>
                                      )}
                                    </button>

                                    {/* El stepper mueve el plato entero, no un ingrediente.
                                        Una comida que viene del menú NO lo lleva: la ración
                                        la decide el menú, y reescalarla aquí dejaría las dos
                                        pantallas diciendo cosas distintas del mismo plato.
                                        Se cambia desmarcándola en «Mi menú». */}
                                    {!fila.origenMenu && (
                                    <div className="flex items-center gap-1 bg-inset rounded-control border border-hairline flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => escalarRacionesDeReceta(meal, fila.idxs, -0.25)}
                                        aria-label={`Reducir ${nombreReceta}`}
                                        className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-ink font-bold text-body-s active:scale-90"
                                      >−</button>
                                      <span className="w-10 text-center font-mono text-caption text-ink">×{(Math.round((meal.items[fila.idxs[0]]?.escala ?? 1) * 100) / 100).toLocaleString('es-ES')}</span>
                                      <button
                                        type="button"
                                        onClick={() => escalarRacionesDeReceta(meal, fila.idxs, 0.25)}
                                        aria-label={`Aumentar ${nombreReceta}`}
                                        className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-ink font-bold text-body-s active:scale-90"
                                      >+</button>
                                    </div>
                                    )}
                                  </div>
                                </MealItemSwipeRow>
                              </React.Fragment>
                            );
                          }

                          if (fila.tipo === 'producto') {
                            const { item: base } = fila;
                            const rapido = base.origen?.id === 'rapido';
                            const n = base.nutrientes;
                            const detalle = n
                              ? `${rapido ? '' : `${base.gramos} g · `}${n.kcal} kcal · P ${n.p} · HC ${n.hc} · G ${n.g}`
                              : `${rapido || !base.gramos ? '' : `${base.gramos} g · `}sin datos`;
                            const canDeleteP = selectedDiet.selfManaged || fila.idxs[0] >= (origItemCounts[meal.id] ?? Infinity);
                            return (
                              <React.Fragment key={`${meal.id}_producto_${fila.lineaId}`}>
                                <MealItemSwipeRow
                                  onDelete={canDeleteP ? () => handleRemoveReceta(meal.id, fila.idxs) : undefined}
                                >
                                  <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-surface">
                                    {circuloComido(meal.id, fila.idxs, foodNameWithoutGrams(base.foodLabel))}
                                    {/* Tocar el producto abre su ficha con los gramos apuntados. */}
                                    <button
                                      type="button"
                                      onClick={() => { abrirFichaDeFila(meal, fila.idxs); }}
                                      className="flex-1 min-w-0 text-left rounded-control -m-1 p-1 transition-colors hover:bg-raised/60 active:bg-raised"
                                    >
                                      <span className="block font-sans text-body-s font-bold leading-snug text-ink">{foodNameWithoutGrams(base.foodLabel)}</span>
                                      <span className="block font-mono text-caption text-accent-ink">{detalle}</span>
                                    </button>
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
                                onDelete={canDelete ? () => handleRemoveItem(meal.id, idx) : undefined}
                              >
                                {/* Alimento: círculo de comido, gramos (en oro) + nombre y
                                    sus kcal. Tocar abre la ficha para cambiar los gramos.
                                    Lo que no se pesa (medidas caseras de «sin pesar») va
                                    por raciones con su contador. Un acompañamiento de
                                    «Mi menú» no se toca aquí: lo decide el menú. */}
                                {(() => {
                                  const gramos = pesoDeItem(item).gramos;
                                  const sePesa = gramos != null && gramos > 0;
                                  return (
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline bg-surface transition-colors duration-(--duration-state)">
                                  {circuloComido(meal.id, [idx], foodNameWithoutGrams(st.foodLabel))}
                                  <button
                                    type="button"
                                    onClick={item.origenMenu || !sePesa ? undefined : () => { abrirFichaDeFila(meal, [idx]); }}
                                    disabled={Boolean(item.origenMenu) || !sePesa}
                                    className={`flex-1 min-w-0 text-left rounded-control -m-1 p-1 transition-colors ${item.origenMenu || !sePesa ? 'cursor-default' : 'hover:bg-raised/60 active:bg-raised'}`}
                                  >
                                    {sePesa && (
                                      <span className="font-mono text-body font-bold text-accent-ink whitespace-nowrap">
                                        {etiquetaDePeso(item)}
                                      </span>
                                    )}
                                    {sePesa && ' '}
                                    <span className="font-sans text-body-s font-bold leading-snug text-ink">
                                      {foodNameWithoutGrams(st.foodLabel)}
                                    </span>
                                    {item.origenMenu && (
                                      <span className="mt-0.5 flex items-center gap-1 font-sans text-caption text-ink-2">
                                        <Icon name="lock" size="s" />
                                        {viendoHoy ? 'De tu menú de hoy' : 'De tu menú de ese día'}
                                      </span>
                                    )}
                                  </button>

                                  {!sePesa && !item.origenMenu && (
                                  <div className="flex items-center gap-1 bg-inset rounded-control border border-hairline flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateQuantity(meal.id, idx, -0.5)}
                                      aria-label="Media ración menos"
                                      className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-ink font-bold text-body-s active:scale-90"
                                    >−</button>
                                    <span className="min-w-[2.5rem] px-0.5 text-center font-mono text-caption text-ink whitespace-nowrap">
                                      {fmtQty(item.quantity)} rac.
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateQuantity(meal.id, idx, 0.5)}
                                      aria-label="Media ración más"
                                      className="w-7 h-7 flex items-center justify-center text-ink-2 hover:text-ink font-bold text-body-s active:scale-90"
                                    >+</button>
                                  </div>
                                  )}
                                  <span className="flex-none font-mono text-body font-bold text-ink">
                                    {numEs(kcalDeLineasComida(meal, [idx]))}
                                  </span>
                                </div>
                                  );
                                })()}
                              </MealItemSwipeRow>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={addMeal}
                  className="w-full py-3 rounded-control border border-dashed border-hairline text-ink-2 font-sans text-label font-bold uppercase tracking-wider hover:border-accent/40 hover:text-accent-ink transition-all"
                >
                  + Añadir comida
                </button>
              </div>

              {/* Autoguardado — sin botón "Guardar". Va al final de las comidas,
                  no flotando: fija se quedaba a media pantalla tapando comidas
                  al bajar y volver a subir (Dani, 26-10-2026). */}
              {(() => {
                const statusLabel = isDirty ? 'Guardando el día...' : 'Día guardado';
                return (
                  <div className="flex items-center justify-between gap-3 bg-surface border border-hairline rounded-surface p-3">
                    <span className="font-mono text-caption text-ink-2 uppercase tracking-wider pl-1">
                      {statusLabel}
                    </span>
                    <button
                      onClick={handleSaveAsMenu}
                      disabled={savingMenu}
                      title="Guardar el día entero para repetirlo más adelante"
                      className="flex-none px-3 py-2 bg-strong text-ink font-sans font-bold text-label uppercase rounded-control hover:bg-strong active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap"
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
      </>

      {/* Menús «···»: el del día y el de cada comida. */}
      {menuDiaAbierto && (
        <Sheet open onClose={() => setMenuDiaAbierto(false)} title="Opciones del día" size="s">
          <div className="space-y-1 pb-2">
            {(menusGuardados.length > 0 || dietasDelCoach.length > 0) && opcionMenu('bookmark', 'Menús guardados', () => { setMenuDiaAbierto(false); setMisDietasOpen(true); })}
            {opcionMenu('bookmark_add', 'Guardar el día como menú', () => { setMenuDiaAbierto(false); void handleSaveAsMenu(); })}
          </div>
        </Sheet>
      )}
      {(() => {
        const mi = selectedDiet?.meals.findIndex(m => m.id === menuComidaId) ?? -1;
        const meal = mi >= 0 ? selectedDiet!.meals[mi] : null;
        if (!meal) return null;
        const cerrar = () => setMenuComidaId(null);
        return (
          <Sheet open onClose={cerrar} title={mealLabel(meal.name, mi + 1)} size="s">
            <div className="space-y-1 pb-2">
              {opcionMenu('skillet', 'Usar receta o comida guardada', () => { cerrar(); handleOpenRecipePicker(meal.id); })}
              {opcionMenu('history', 'Copiar de ayer', () => { cerrar(); void copiarDeAyer(meal.id); })}
              {meal.items.length > 0 && opcionMenu('bookmark_add', 'Guardar como receta', () => { cerrar(); openSaveMealAsRecipe(meal); })}
              {selectedDiet!.meals.length > 1 && opcionMenu('delete', 'Quitar esta comida', () => { cerrar(); removeMeal(meal.id); })}
            </div>
          </Sheet>
        );
      })()}

      {/* Los menús que el atleta se ha guardado, para volver a ponerse uno en el
          día que esté viendo. Antes esta hoja gestionaba DIETAS —la programada
          de hoy, las del coach, las tuyas— y elegir una cambiaba de qué colgaba
          el día; ya no hay nada de eso. */}
      {misDietasOpen && (
        <Sheet
          open
          onClose={() => setMisDietasOpen(false)}
          title="Menús"
          size="l"
          footer={<Button variant="secondary" fullWidth onClick={handleStartBlankFromSheet}>Vaciar el día</Button>}
        >
          {/* Las dietas del coach. Faltaban: si te había puesto Día A entre
              semana y Día B el fin de semana, el Día B no aparecía por ningún
              lado y solo podías usar el que te hubiera tocado (caso de Pedro,
              07-09-2026). Solo salen las ACTIVAS: las que el coach dejó a
              medias o desactivó no son cosa del atleta. */}
          {dietasDelCoach.length > 0 && (
            <div className="mb-4">
              <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">De tu entrenador</p>
              <div className="space-y-1">
                {dietasDelCoach.map(dt => {
                  const chips = resumenDeMenu(dt.meals);
                  const esLaDeHoy = dt.id === dietaPautada?.id;
                  return (
                    <ListRow
                      key={dt.id}
                      title={dt.name}
                      subtitle={[esLaDeHoy ? 'La de este día' : null, chips || `Solo el objetivo: ${numEs(Math.round(objetivoDeDieta(dt).kcal))} kcal`]
                        .filter(Boolean).join(' · ')}
                      leading={
                        <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                          <Icon name="restaurant" size="s" className="text-accent-ink" />
                        </span>
                      }
                      onClick={() => { cargarMenuEnElDia(dt); setMisDietasOpen(false); }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {dietasDelCoach.length > 0 && menusGuardados.length > 0 && (
            <p className="font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">Tuyos</p>
          )}

          {menusGuardados.length === 0 ? (
            dietasDelCoach.length > 0 ? null : (
            <EmptyState
              icon="restaurant_menu"
              title="Todavía no has guardado ningún menú"
              description="Monta tu día y pulsa «Guardar como menú» para repetirlo cuando quieras."
            />
            )
          ) : (
            <div className="space-y-1">
              {menusGuardados.map(dt => {
                const chips = resumenDeMenu(dt.meals);
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
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- solo corta la propagación hacia la fila; los controles son los botones de dentro
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => abrirRenombrar(dt)}
                          title="Renombrar"
                          aria-label={`Renombrar ${dt.name}`}
                          className="text-ink-2 hover:text-accent-ink transition-colors p-2"
                        >
                          <Icon name="edit" size="s" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicateMenu(dt)}
                          disabled={duplicandoMenuId === dt.id}
                          title="Duplicar"
                          aria-label={`Duplicar ${dt.name}`}
                          className="text-ink-2 hover:text-accent-ink disabled:opacity-40 transition-colors p-2"
                        >
                          <Icon name="content_copy" size="s" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDietPendingDelete(dt)}
                          title="Eliminar"
                          aria-label={`Eliminar ${dt.name}`}
                          className="text-ink-2 hover:text-danger transition-colors p-2"
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
        Tu objetivo lo fija tu entrenador. Los cálculos de la app (calorías por macro,
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

              {/* Buscador y categorías solo para "Mis recetas": el recetario trae
                  los suyos dentro de la portada «Descubrir». */}
              {recipeSource === 'mias' && (
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
              )}
              {recipeSource === 'mias' && availableRecipeCats.length > 0 && (
                <div className="px-4 py-2 bg-surface border-b border-hairline flex gap-2 overflow-x-auto hide-scrollbar">
                  {[{ id: 'all', label: 'Todas' }, ...availableRecipeCats.map(c => ({ id: c, label: c }))].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setRecipeCatFilter(cat.id)}
                      className={`px-3 py-2 rounded-full font-sans text-caption font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 ${
                        recipeCatFilter === cat.id
                          ? 'bg-accent text-on-accent'
                          : 'bg-raised text-ink-2 border border-transparent hover:border-hairline'
                      }`}
                    >{cat.label}</button>
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
                ) : (
                  <RecetarioDescubrir
                    pool={poolSelectorRecetario}
                    estado={indiceRecetarioEstado}
                    onReintentar={cargarIndiceRecetario}
                    favoritas={favoritasSet}
                    onElegir={r => handleApplyRecipe(r)}
                    verbo="Usar"
                    cupo={ambitoCupo === 'comida' && targetMeal
                      ? { titulo: `Encajan en ${mealLabel(targetMeal.name, (selectedDiet?.meals.indexOf(targetMeal) ?? 0) + 1).toLowerCase()}`, cupo: cupoDisponible }
                      : { titulo: 'Caben en lo que te queda hoy', cupo: cupoDisponible, criterio: 'caber' }}
                  />
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
                <Icon name="progress_activity" size="l" className="text-accent-ink animate-spin" />
              </div>
            ) : recetaEscalada ? (
              <>
                {/* Las cantidades que se enseñan son las del PLATO, no las de la
                    receta de fábrica: si ocupa el doble de intercambios en la
                    comida, los gramos van doblados. Sin este aviso el atleta no
                    tiene forma de saber que está viendo una ración escalada. */}
                {recetaAbierta.factor !== 1 && (
                  <p className="font-mono text-caption text-accent-ink">
                    Cantidades para ×{fmtQty(round2(recetaAbierta.factor))} de la receta
                  </p>
                )}
                {fotoDeReceta(recetaEscalada) && (
                  <div className="w-full aspect-[16/9] rounded-surface overflow-hidden bg-raised">
                    <FotoDeReceta
                      src={fotoDeReceta(recetaEscalada)}
                      alt={recetaEscalada.name}
                      className="w-full h-full object-cover"
                      fallback={null}
                    />
                  </div>
                )}
                {(recetaEscalada.kcal != null || recetaEscalada.cookingTime != null) && (
                  <p className="font-mono text-caption text-ink-2">
                    {[recetaEscalada.kcal != null && `${recetaEscalada.kcal} kcal`,
                      recetaEscalada.cookingTime != null && `~${minutosDeReceta(recetaEscalada)} min`]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}
                {(recetaEscalada.ingredientsText?.length || recetaEscalada.ingredients?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Ingredientes</p>
                    <ul>
                      {(recetaEscalada.ingredientsText?.length
                        ? recetaEscalada.ingredientsText.map(i => ({ label: i.name, qty: Number.isFinite(i.quantity) ? `${i.quantity}g` : '' }))
                        : (recetaEscalada.ingredients ?? []).map(i => ({ label: i.foodLabel, qty: `×${fmtQty(i.quantity)}` }))
                      ).map((ing, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 py-1 border-b border-hairline last:border-0">
                          <span className="text-label font-sans flex-1 pr-2">{ing.label}</span>
                          <span className="font-mono text-caption text-ink-2 flex-shrink-0">{ing.qty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {recetaEscalada.stepsText?.length ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Preparación</p>
                    <ol className="space-y-2">
                      {recetaEscalada.stepsText.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-mono text-caption text-accent-ink flex-shrink-0">{s.position ?? i + 1}</span>
                          <span className="text-label font-sans text-ink-2 min-w-0">
                            {s.description}
                            {/* Lo que cuelga del paso ("…mezcla bien:" + la lista). */}
                            {(s.items ?? []).length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {(s.items ?? []).map(sub => (
                                  <li key={sub.position} className="flex gap-2">
                                    <span aria-hidden="true" className="text-ink-3">·</span>
                                    <span>{sub.description.trim()}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </span>
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
                  Parecidas en calorías a <span className="text-ink font-bold">{swapSourceRecipe.name}</span>
                  {' · '}
                  <span className="font-mono text-accent-ink">{Math.round(macrosDeReceta(swapSourceRecipe).kcal)} kcal</span>
                </div>
              )}
              {/* 16 px: por debajo, Safari en iOS hace zoom al enfocar y no
                  lo deshace. Ver MyMenuScreen. */}
              <input
                value={swapSearch}
                onChange={e => setSwapSearch(e.target.value)}
                placeholder="Buscar entre las alternativas…"
                className="w-full px-3 py-2 bg-raised border border-hairline rounded-control font-sans text-base text-ink placeholder:text-ink-2 focus:border-accent/40 outline-none"
              />
              {/* Familias de plato disponibles. Es la respuesta directa a "no me
                  apetece otro batido": un toque y la lista cambia de familia. */}
              {swapDishTypes.length > 1 && (
                <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
                  <button
                    onClick={() => setSwapDishFilter(null)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full font-sans text-caption font-bold border transition-colors ${
                      swapDishFilter === null
                        ? 'bg-accent/15 border-accent/40 text-accent-ink'
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
                          ? 'bg-accent/15 border-accent/40 text-accent-ink'
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
                    : 'Sin alternativas parecidas que respeten tus alergias y preferencias.'}
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
      {pickerItem && usarListaRapida && (
        <AnadirAlimentoCalorias
          titulo={reemplazo
            ? `Cambiar ${conMayuscula(foodNameWithoutGrams(selectedDiet?.meals.find(m => m.id === reemplazo.mealId)?.items[reemplazo.idxs[0]]?.foodLabel ?? 'alimento'))}`
            : `Añadir a ${comidasDelDia.find(c => c.id === pickerItem.mealId)?.nombre ?? 'la comida'}`}
          busqueda={searchTerm}
          onBusqueda={setSearchTerm}
          pestana={pestanaAnadir}
          onPestana={p => { setPestanaAnadir(p); }}
          secciones={seccionesAnadir.secciones}
          vacio={seccionesAnadir.vacio}
          pie={pestanaAnadir === 'comidas'
            ? { texto: 'Buscar en el recetario', icono: 'skillet', onClick: () => handleOpenRecipePicker(pickerItem.mealId) }
            : { texto: 'Crear alimento desde su etiqueta', icono: 'edit_note', onClick: () => { setCrearInicial(null); setCrearAlimentoAbierto(true); } }}
          onEscanear={() => setEscanerAbierto(true)}
          filtro={pestanaAnadir === 'generales' && enabledModes.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de alimentos">
              {ALL_DIET_MODES.filter(m => enabledModes.includes(m)).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectDietMode(m)}
                  aria-pressed={activeDietMode === m}
                  className={`rounded-full border px-3 py-1.5 font-sans text-body-s font-bold transition-colors ${activeDietMode === m ? 'border-accent bg-accent text-on-accent' : 'border-hairline text-ink-2 hover:text-ink'}`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          ) : undefined}
          nota={pestanaAnadir === 'todo' && productosOff.length > 0 ? ATRIBUCION_OFF : undefined}
          onClose={() => { setPickerItem(null); setReemplazo(null); }}
        />
      )}


      {ficha?.tipo === 'valores' && (
        <FichaAlimentoCalorias
          {...ficha}
          comidas={comidasDelDia}
          onConfirm={(g, m) => { const f = ficha; setFicha(null); f.alConfirmar(g, m); }}
          onClose={() => setFicha(null)}
        />
      )}
      {ficha?.tipo === 'off' && (
        <FichaProductoOff
          codigo={ficha.codigo}
          nombre={ficha.nombre}
          marca={ficha.marca}
          ultimos={ficha.ultimos}
          mealId={ficha.mealId}
          comidas={comidasDelDia}
          onIncompleto={p => { setFicha(null); setCrearInicial({ nombre: p.n, codigo: p.c }); setCrearAlimentoAbierto(true); }}
          onConfirm={(g, m) => { const codigo = ficha.codigo; setFicha(null); confirmarFichaOff(codigo, g, m); }}
          onClose={() => setFicha(null)}
        />
      )}

      {gramosDe && (
        <GramosSheet
          food={gramosDe}
          ultimos={usados.recientes.find(u => u.clave === gramosDe.id || u.clave === gramosDe.label)?.gramos}
          onConfirm={g => confirmarGramos(gramosDe, g)}
          onClose={() => setGramosDe(null)}
        />
      )}
      {escanerAbierto && (
        <ScannerSheet
          onClose={() => setEscanerAbierto(false)}
          onCodigo={codigo => {
            setEscanerAbierto(false);
            // Lo que el atleta creó desde una etiqueta va ANTES que Open Food Facts:
            // es su dato, y le sirve para corregir uno mal puesto.
            const propio = encontrarPorCodigo(alimentosPropios, codigo);
            if (propio) { showToast(`Es uno de tus alimentos: ${foodNameWithoutGrams(propio.label)}.`, 'info'); handleSelectFood(propio); return; }
            setCodigoEscaneado(codigo);
          }}
        />
      )}
      {codigoEscaneado && (
        <ProductoEscaneadoSheet
          codigo={codigoEscaneado}
          onConfirm={(prod, gramos) => { setCodigoEscaneado(null); confirmarProductoOff(prod, gramos); }}
          {...(pickerItem ? {
            fichaCalorias: (prod: OffProducto) => (
              <FichaAlimentoCalorias
                nombre={prod.n}
                marca={prod.b || undefined}
                porCien={{ kcal: prod.k, p: prod.p, hc: prod.h, g: prod.g }}
                extrasPorCien={{ f: prod.f, az: prod.az, sat: prod.sat, sal: prod.sal }}
                raciones={racionesDe({ ultimos: ultimosGramos(claveDeProducto(prod.c)), racion: prod.s })}
                comidas={comidasDelDia}
                mealId={pickerItem.mealId}
                onConfirm={(g, m) => {
                  setCodigoEscaneado(null);
                  queryClient.setQueryData(['offProducto', prod.c], prod);
                  confirmarFichaOff(prod.c, g, m);
                }}
                onClose={() => setCodigoEscaneado(null)}
              />
            ),
          } : {})}
          onBuscarPorNombre={() => setCodigoEscaneado(null)}
          onCrearDesdeEtiqueta={inicial => { setCodigoEscaneado(null); setCrearInicial(inicial); setCrearAlimentoAbierto(true); }}
          onClose={() => setCodigoEscaneado(null)}
        />
      )}
      {productoOffAbierto && (
        <ProductoOffSheet
          entrada={productoOffAbierto}
          gramosIniciales={ultimosGramos(claveDeProducto(productoOffAbierto.c))}
          onConfirm={confirmarProductoOff}
          onClose={() => setProductoOffAbierto(null)}
        />
      )}
      {alimentoCatalogoAbierto && (
        <ProductoOffSheet
          entrada={{ c: alimentoCatalogoAbierto.id, n: nombreDeAlimento(alimentoCatalogoAbierto), b: '', t: '' }}
          producto={comoProducto(alimentoCatalogoAbierto)}
          gramosIniciales={ultimosGramos(claveDeCatalogo(alimentoCatalogoAbierto.id))}
          nota={alimentoCatalogoAbierto.fuente ? `Valores por 100 g · ${alimentoCatalogoAbierto.fuente}` : 'Valores por 100 g del catálogo de En Forma.'}
          onConfirm={(_, gramos) => confirmarAlimentoCatalogo(alimentoCatalogoAbierto, gramos)}
          onClose={() => setAlimentoCatalogoAbierto(null)}
        />
      )}

      {/* Editar un alimento propio. Misma hoja que crearlo: se rellena con los
          macros guardados y el grupo y los gramos se recalculan al vuelo. */}
      {alimentoAEditar && (
        <CrearAlimentoSheet
          mode={alimentoAEditar.mode}
          destino="personal"
          editando={alimentoAEditar}
          onClose={() => setAlimentoAEditar(null)}
          /* Cierra la hoja y abre la confirmación de siempre. Borrar descarta
             lo que se estuviera editando igualmente, así que no se pierde
             nada por cerrarla. */
          onEliminar={() => { setAlimentoABorrar(alimentoAEditar); setAlimentoAEditar(null); }}
          onGuardar={async (data) => {
            const actualizado = await actualizarAlimentoPersonal(profile.email, alimentoAEditar.id, data);
            queryClient.setQueryData<MealItem[]>(
              ['alimentosPersonales', profile.email],
              prev => (prev ?? []).map(f => (f.id === actualizado.id ? actualizado : f)),
            );
            /* Lo ya colocado en las comidas NO se toca: ahí el alimento vive
               copiado con su nombre y sus gramos de entonces. Cambiar el banco
               y reescribir de paso los platos de semanas pasadas falsearía lo
               que el atleta comió de verdad. */
            showToast(`«${actualizado.label}» actualizado`, 'success');
          }}
        />
      )}


      {/* Borrar un alimento propio. Solo quita la entrada del banco personal:
          lo que ya esté colocado en un plan se queda donde está, porque ahí
          vive copiado como `DietItem` con su nombre y sus gramos dentro. */}
      {alimentoABorrar && (
        <Dialog
          open
          onClose={() => setAlimentoABorrar(null)}
          title="¿Borrar este alimento?"
          size="s"
          footer={(
            <>
              <Button onClick={() => setAlimentoABorrar(null)} variant="secondary">Cancelar</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const id = alimentoABorrar.id;
                  setAlimentoABorrar(null);
                  await borrarAlimentoPersonal(profile.email, id);
                  queryClient.setQueryData<MealItem[]>(
                    ['alimentosPersonales', profile.email],
                    prev => (prev ?? []).filter(f => f.id !== id),
                  );
                }}
              >
                Borrar
              </Button>
            </>
          )}
        >
          <p className="font-sans text-body-s text-ink-2">
            «{alimentoABorrar.label}» dejará de aparecer en tu buscador. Lo que ya tengas
            puesto en tus comidas no se toca.
          </p>
        </Dialog>
      )}

      {/* Crear alimento — la calculadora de intercambios. Se abre desde el
          buscador de alimentos y guarda en el banco PROPIO del atleta: lo ven
          él y su coach, y nunca llega al banco común. */}
      {crearAlimentoAbierto && (
        <CrearAlimentoSheet
          mode={activeDietMode}
          destino="personal"
          {...(crearInicial ? { inicial: crearInicial } : {})}
          onClose={() => { setCrearAlimentoAbierto(false); setCrearInicial(null); }}
          onGuardar={async (data) => {
            const creado = await crearAlimentoPersonal(profile.email, data);
            queryClient.setQueryData<MealItem[]>(
              ['alimentosPersonales', profile.email],
              prev => [...(prev ?? []), creado],
            );
            // Se coloca en su comida en el acto. Crear un alimento y que el
            // buscador te devuelva a la lista para tener que buscarlo otra vez
            // sería dar un paso de más justo cuando ya has hecho el trabajo.
            handleSelectFood(creado);
            // Sin el término de búsqueda que no lo encontraba.
            setSearchTerm('');
            showToast(`«${creado.label}» añadido a tus alimentos`, 'success');
          }}
        />
      )}



      {/* ¿Contra qué cupo cuadramos? — a petición de Dani. Se pregunta antes de
          enseñar recetas porque la respuesta cambia la lista entera. */}
      {preguntaAmbito && (() => {
        const meal = selectedDiet?.meals.find(m => m.id === preguntaAmbito);
        const idx = selectedDiet?.meals.findIndex(m => m.id === preguntaAmbito) ?? 0;
        const nombreComida = meal ? mealLabel(meal.name, idx + 1) : 'esta comida';
        // Sin reparto por comidas: «esta comida» es lo que queda del día entre
        // las comidas que faltan por hacer.
        const faltan = comidasPorHacer(preguntaAmbito);
        const kcalComida = Math.round(quedaDelDia.kcal / faltan);
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
                Solo verás recetas que te quepan en lo que elijas.
              </p>

              <button
                onClick={() => abrirRecetarioConAmbito(preguntaAmbito, 'comida')}
                className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all disabled:opacity-40 disabled:hover:border-hairline"
              >
                <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                  <Icon name="restaurant" size="s" className="text-accent-ink" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans font-bold text-body-s text-ink">Que cuadre en {nombreComida}</span>
                  <span className="block font-mono text-caption text-ink-2">
                    {faltan > 1
                      ? `Unas ${numEs(kcalComida)} kcal (lo que te queda entre ${faltan} comidas)`
                      : `Te quedan ${numEs(kcalComida)} kcal`}
                  </span>
                </span>
              </button>

              <button
                onClick={() => abrirRecetarioConAmbito(preguntaAmbito, 'dia')}
                className="w-full flex items-center gap-3 p-4 bg-surface hover:bg-raised rounded-control border border-hairline hover:border-accent/40 text-left transition-all"
              >
                <span className="w-9 h-9 rounded-control bg-accent-bg flex items-center justify-center flex-shrink-0">
                  <Icon name="today" size="s" className="text-accent-ink" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-sans font-bold text-body-s text-ink">Que cuadre en lo que me queda del día</span>
                  <span className="block font-mono text-caption text-ink-2">Te quedan {numEs(quedaDelDia.kcal)} kcal hoy</span>
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
          title={`¿A qué comida añadir "${chooseMealForRecipe.recipe.name}"?`}
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
