import { useReglasDeReceta, useListaDeMenu, useSeleccionDeRecetas, useIngestasAMedida, useLibertad } from '../hooks/useReglasDeReceta';
import { limitesDe, permisosDe } from '../utils/libertadDelAtleta';
import { claveDeIngesta, idsCerrados } from '../utils/ingestaPersonalizada';
import React, { useMemo, useState, useRef } from 'react';
import { minutosDeReceta } from '../utils/tiempoDeReceta';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, WeeklyMenu, RecipeFavorites, MenuCompletionLog,
  WeekDay, MenuDay, MenuMeal, Recipe, FoodCategory, MenuComplement, MealItem, DietMode, RecetaPendiente, DietItem,
  Macros,
} from '../types';
import { itemsDeComidaDelMenu } from '../utils/conversionNutricional';
import {
  getPublishedMenu, getOnboarding, getAthleteNutritionConfig,
  updateWeeklyMenu, getMenuCompletionLog, saveMenuCompletionLog,
  queryRecetasForGenerator, getRecipes, getRecipeById,
  getRecipeFavorites, saveRecipeFavorites, getFoodItems, seedFoodItemsIfEmpty, getCatalogoAlimentos,
  getDietCompletionLog, saveDietCompletionLog,
} from '../dbService';
import { findSwapAlternatives, recipeMatchesSlot, buildBatchPlan, totalConExtras, topeDeExtra, huecoParaExtra, GeneratorPrefs, SwapCandidate } from '../utils/menuEngine';
import { normalizeStr } from '../utils/foodPrefs';
import { athleteConditions } from '../utils/dietaryRestrictions';
import { dietTypeVigente } from '../utils/foodPrefs';
import { foodNameWithoutGrams, foodNameShort, itemWeightLabel } from '../utils/exchangeHelpers';
import { macrosDeLaComida, macrosDelPlato, macrosDeAcompanamiento } from '../utils/menuMacros';
import { alimentosParaExtras, alimentoDelExtra, cabeExtra, esExtraDelCatalogo, extraDeCatalogo, gramosPosibles, gramosVecinos, textoDeExtra } from '../utils/extrasDelCatalogo';
import { buscarEnCatalogo, nombreDeAlimento, type AlimentoCatalogo } from '../utils/catalogoAlimentos';
import { intercambiosDeMacros } from '../utils/macrosLegado';
import { buildShoppingList, ShoppingListItem } from '../utils/menuShoppingList';
import { DishType } from '../utils/dishTypes';
import { substitutesFor } from '../utils/ingredientSubstitutions';
import { Icon, EmptyState, ListRow, Badge, Sheet, Dialog, ScreenSkeleton, Button } from './ui';
import { fotoDeReceta } from '../utils/fotoDeReceta';
import { escalarRecetaEntera } from '../utils/escalarRecetaEntera';
import { recetaAjustada } from '../utils/ajusteDeReceta';
import { senalesDeCambios } from '../utils/gustosDelAtleta';
import { etiquetasHechoCon } from '../utils/hechoCon';
import HechoCon from './nutrition/HechoCon';
import { useToast } from '../hooks/useToast';
import { useDiaActual } from '../hooks/useDiaActual';
import { registrarComidaDelMenu, quitarComidaDelMenu, type DiaDelPlan } from '../utils/registroDesdeElMenu';
import { estructuraDeDia } from './nutrition/dietHelpers';
import FotoDeReceta from './FotoDeReceta';
import RacionDelMenu, { ReajusteDelDia } from './nutrition/RacionDelMenu';
import TarjetaDeComida from './nutrition/TarjetaDeComida';
import { TarjetaDeArranque } from './nutrition/TusGustos';
import type { ResultadoDeArranque } from '../utils/arranqueDeGustos';
import {
  anadirExtraDelAtleta, cambiarPlato, cambiosDeIngredientes, comidasFijas, conComidaElegida, conIngrediente,
  conRacion, ingredientesDeReceta, ingredientesVariables, mismoPlato, pautadoDe, racionDe, textoDeCambio, textoDeEstado,
  type IngredienteVariable, type Reajuste,
} from '../utils/reajusteDelAtleta';
import { alimentoDelCapricho, caprichosPorGrupo, buscarCaprichos, textoDeRacion } from '../utils/caprichos';

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_DAY_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEK_DAY_FULL: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

/* La fecha y el día de la semana salen de `useDiaActual`, no de constantes de
   módulo. Aquí estaban los dos fallos que ese hook ya arregló en «Mi plan»:
   `toISOString()` da la fecha en UTC (en España, entre medianoche y las 2:00
   se escribía con la de AYER) y una constante de módulo se calcula una sola
   vez, al cargar — y la app nativa no se recarga, se queda en segundo plano y
   vuelve al día siguiente escribiendo todavía en el día anterior. */

/** «P 32 · HC 60 · G 14 g» del plato. */
function fmtMacros(m: Macros): string {
  const parts: string[] = [];
  if (m.p > 0) parts.push(`P ${Math.round(m.p)}`);
  if (m.hc > 0) parts.push(`HC ${Math.round(m.hc)}`);
  if (m.g > 0) parts.push(`G ${Math.round(m.g)}`);
  return parts.length > 0 ? `${parts.join(' · ')} g` : '—';
}

/** Cuántas alternativas se pintan de golpe por bloque (el resto, bajo demanda). */
const SWAP_PAGE = 12;

// Qué le pasa al día si acepta una alternativa "aproximada". Se dice el macro y
// la dirección, no un número abstracto: "te deja corto de HC" es accionable,
// "desviación 1,4" no. Solo se nombra el macro que más se mueve.
interface Props {
  profile: UserProfile;
  /* Mandar una receta del menú a "Mi plan" (el hub la recoge y abre el
     selector de comida). Marcar una comida como hecha aquí NO la registra en
     el plan —son dos registros distintos, ver `toggleDone`—, y sin este puente
     el atleta que veía su sándwich en el menú no tenía forma de meterlo en el
     plan sin buscarlo a mano ni de que le contara en los macros del día. */
  onAddToPlan?: (pendiente: RecetaPendiente) => void;
  /** Solo para el banco de pruebas: guardar el arranque de gustos sin Firestore. */
  guardarArranque?: (r: ResultadoDeArranque) => Promise<void>;
  /** Solo para el banco de pruebas (sin sesión): sustituye la escritura del reajuste. */
  guardarMenu?: typeof updateWeeklyMenu;
}

export default function MyMenuScreen({ profile, onAddToPlan, guardarArranque, guardarMenu = updateWeeklyMenu }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
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
  const { fecha: hoyFecha, diaSemana: hoyWD } = useDiaActual();
  const [selectedDay, setSelectedDay] = useState<WeekDay>(hoyWD);
  const completionLogKey = ['menuCompletionLog', profile.email, hoyFecha] as const;
  const { data: completionLog, isPending: loadingCompletionLog } = useQuery({
    queryKey: completionLogKey,
    queryFn: () => getMenuCompletionLog(profile.email, hoyFecha),
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
  // Catálogo por 100 g: de aquí salen los extras en piezas exactas (28-10-2026).
  const { data: catalogoAlimentos = [] } = useQuery({ queryKey: ['catalogoAlimentos'], queryFn: getCatalogoAlimentos, staleTime: 60 * 60_000 });
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
  const peticionDetalleRef = useRef(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [subForIngredient, setSubForIngredient] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<{ mealId: string; slot: number } | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState<SwapCandidate[]>([]);
  const [swapQuery, setSwapQuery] = useState('');
  const [swapVisible, setSwapVisible] = useState(SWAP_PAGE);
  // Alternativa elegida que mueve otras comidas: se enseña antes de cambiar.
  const [swapPendiente, setSwapPendiente] = useState<SwapCandidate | null>(null);
  // Edición de extras: `idx` null = añadir uno nuevo a esa comida.
  const [extrasFor, setExtrasFor] = useState<{ mealId: string; idx: number | null } | null>(null);
  const [extraQuery, setExtraQuery] = useState('');
  // Pestaña del panel de extras y el extra que no cabe en la comida, a la
  // espera de que el atleta vea lo que mueve en el resto del día.
  const [extraPestana, setExtraPestana] = useState<'cuadrar' | 'caprichos'>('cuadrar');
  const [extraPendiente, setExtraPendiente] = useState<MenuComplement | null>(null);
  // Ración que se está probando en la ficha (aún sin guardar).
  /** El plato de la ficha como lo está dejando el atleta (ración o gramos de
   *  un ingrediente), antes de guardar. */
  const [platoDePrueba, setPlatoDePrueba] = useState<MenuMeal | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [anadiendoId, setAnadiendoId] = useState<string | null>(null);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[] | null>(null);

  const recetasOcultas = useReglasDeReceta(profile.email);
  const listaMenu = useListaDeMenu(profile.email);
  const { seleccion, paquetes, favoritasDelCoach } = useSeleccionDeRecetas(profile.email);
  const ingestasAMedida = useIngestasAMedida(profile.email);
  // Lo que el coach le deja mover en su menú (Guiado / Flexible / Libre).
  const libertad = useLibertad(profile.email);
  const permisos = useMemo(() => permisosDe(libertad), [libertad]);
  const limites = useMemo(() => limitesDe(libertad), [libertad]);
  const prefs: GeneratorPrefs = useMemo(() => ({
    allergies: onboarding?.allergies ?? [],
    conditions: athleteConditions(onboarding),
    disliked: onboarding?.dislikedFoods ?? [],
    liked: onboarding?.likedFoods ?? [],
    // Manda lo que el atleta haya corregido en Perfil > Preferencias; la ficha
    // de iniciación es solo el valor de partida (igual que `variety` y los
    // tipos de plato, justo debajo).
    dietType: dietTypeVigente(nutritionConfig?.dietType, onboarding?.dietType),
    cookingMaxTime: nutritionConfig?.cookingMaxTime ?? onboarding?.cookingMaxTime,
    quiereRapidas: nutritionConfig?.quiereRapidas ?? onboarding?.quiereRapidas,
    variety: nutritionConfig?.menuVariety ?? onboarding?.menuVariety ?? 3,
    favoriteRecipeIds: favorites.recipeIds,
    arranque: favorites.arranque,
    dislikedRecipeIds: favorites.dislikedIds ?? [],
    preferredDishTypes: (nutritionConfig?.preferredDishTypes ?? onboarding?.preferredDishTypes ?? []) as DishType[],
    excludedDishTypes: (nutritionConfig?.excludedDishTypes ?? onboarding?.excludedDishTypes ?? []) as DishType[],
    recetasOcultas,
    listaMenu,
    seleccion,
    paquetes,
    favoritasDelCoach,
    // Lo que ya ha cambiado en este menú pesa al proponerle alternativas.
    cambios: menu ? senalesDeCambios([menu]) : undefined,
  }), [onboarding, nutritionConfig, favorites, recetasOcultas, listaMenu, seleccion, paquetes, favoritasDelCoach]);

  const swapFiltradas = useMemo(() => {
    const q = normalizeStr(swapQuery.trim());
    if (!q) return swapCandidates;
    return swapCandidates.filter(c => normalizeStr(c.recipe.name).includes(q));
  }, [swapCandidates, swapQuery]);
  const swapExactas = useMemo(() => swapFiltradas.filter(c => c.fit === 'exacto'), [swapFiltradas]);
  // En «Guiado» solo se ofrecen los platos equivalentes.
  const swapAproximadas = useMemo(
    () => (permisos.platoConReajuste ? swapFiltradas.filter(c => c.fit === 'aproximado') : []),
    [swapFiltradas, permisos.platoConReajuste],
  );

  const day: MenuDay | undefined = menu?.days.find(d => d.day === selectedDay);
  const batchPlan = useMemo(() => (menu ? buildBatchPlan(menu.days) : []), [menu]);
  const detailMeal = detailMealId ? menu?.days.flatMap(d => d.meals).find(m => m.id === detailMealId) : undefined;
  /* La receta con las cantidades de la RACIÓN que toca comer, no las de la
     receta de fábrica. La cabecera de la comida ya decía «×2» y los gramos de
     abajo seguían siendo los de una ración (Dani, 10-09-2026). */
  const detailRecipeVista = useMemo(
    () => {
      if (!detailRecipe) return null;
      // Receta base ajustada a esta comida (N-06): sus gramos, no la escala.
      // Con lo que está probando: los gramos de la ficha se mueven con la barra
      // de ración y con los de cada ingrediente.
      const vista = platoDePrueba ?? detailMeal;
      if (vista?.ajuste) {
        // Mezcla del atleta sobre un plato que el generador solo escaló: lo
        // que no está vinculado (sal, especias) sigue yendo a escala.
        const base = vista.mezcla && !pautadoDe(vista).ajuste ? escalarRecetaEntera(detailRecipe, vista.scale) : detailRecipe;
        return recetaAjustada(base, vista.ajuste.gramos);
      }
      return escalarRecetaEntera(detailRecipe, vista?.scale ?? 1);
    },
    [detailRecipe, detailMeal, platoDePrueba],
  );
  /* Lo que el reajuste del día no puede tocar: lo ya comido (solo se sabe de
     hoy) y, en un menú de tanda, los táperes de comida y cena. */
  const fijasDelDia = useMemo(() => {
    if (!day) return new Set<string>();
    const hechas = selectedDay === hoyWD ? day.meals.filter(m => doneKeys.has(`${selectedDay}_${m.id}`)).map(m => m.id) : [];
    const tanda = menu?.batchCooking ? day.meals.filter(m => m.slot === 3 || m.slot === 5).map(m => m.id) : [];
    return comidasFijas(day, hechas, tanda);
  }, [day, selectedDay, hoyWD, doneKeys, menu?.batchCooking]);
  const detailSwaps = new Map((detailMeal?.ingredientSwaps ?? []).map(s => [s.from, s.to]));

  /* Lo que se puede mover dentro del plato de la ficha (Dani, 16-11-2026:
     «estos ingredientes también se deberían poder variar»): los gramos de cada
     ingrediente, si la receta está vinculada al catálogo, con el mismo tope que
     la ración. Y cómo queda el día con lo que está probando. */
  const detalleEnElDia = !!detailMeal && !!day?.meals.some(m => m.id === detailMeal.id);
  const detalleHecha = !!detailMeal && selectedDay === hoyWD && doneKeys.has(`${selectedDay}_${detailMeal.id}`);
  const ingredientesDelDetalle = useMemo(() => ingredientesDeReceta(detailRecipe), [detailRecipe]);
  const variablesDelDetalle = useMemo(
    () => new Map<number, IngredienteVariable>(
      detailMeal && detalleEnElDia && !detalleHecha && ingredientesDelDetalle
        ? ingredientesVariables(platoDePrueba ?? detailMeal, ingredientesDelDetalle, permisos.pasoDeRacion).map(i => [i.n, i])
        : [],
    ),
    [detailMeal, detalleEnElDia, detalleHecha, ingredientesDelDetalle, platoDePrueba, permisos.pasoDeRacion],
  );
  const reajusteDePrueba = useMemo(
    () => (platoDePrueba && day ? conComidaElegida(day, platoDePrueba, fijasDelDia, limites) : null),
    [platoDePrueba, day, fijasDelDia, limites],
  );

  function moverIngrediente(v: IngredienteVariable, d: 1 | -1) {
    if (!detailMeal || !ingredientesDelDetalle) return;
    const gramos = Math.min(v.max, Math.max(v.min, v.gramos + d * v.paso));
    if (gramos === v.gramos) return;
    const sig = conIngrediente(platoDePrueba ?? detailMeal, ingredientesDelDetalle, v.n, gramos);
    setPlatoDePrueba(mismoPlato(sig, detailMeal) ? null : sig);
  }

  function guardarPlatoDePrueba() {
    if (!detailMeal || !platoDePrueba || !reajusteDePrueba) return;
    const num = (n: number) => String(n).replace('.', ',');
    const de = racionDe(detailMeal);
    const a = racionDe(platoDePrueba);
    const partes: string[] = [];
    if (de !== a) partes.push(`×${num(de)} → ×${num(a)}`);
    // Los ingredientes, comparados a la MISMA ración: si no, saldrían todos.
    const movidos = ingredientesDelDetalle ? cambiosDeIngredientes(conRacion(detailMeal, a), platoDePrueba, ingredientesDelDetalle) : [];
    partes.push(...movidos.map(c => `${c.nombre.toLowerCase()} ${c.antes} → ${c.despues} g`));
    setPlatoDePrueba(null);
    void guardarReajuste(reajusteDePrueba, detailMeal.id, de !== a ? 'racion' : 'ingrediente', `${detailMeal.name}: ${partes.join(' · ')}`);
  }

  /* La receta de la comida a la que se le está añadiendo un extra: hace falta
     para que el capricho se descuente de los ingredientes de ESE plato. */
  const recetaDelExtraId = day?.meals.find(m => m.id === extrasFor?.mealId)?.recipeId || null;
  const { data: recetaDelExtra = null, isLoading: cargandoRecetaDelExtra } = useQuery({
    queryKey: ['receta', recetaDelExtraId],
    queryFn: () => getRecipeById(recetaDelExtraId!),
    enabled: !!recetaDelExtraId,
    staleTime: 5 * 60_000,
  });
  const ingredientesDelExtra = useMemo(() => ingredientesDeReceta(recetaDelExtra), [recetaDelExtra]);

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
      : { id: `${profile.email}_${hoyFecha}`, athleteId: profile.email, date: hoyFecha, menuId: menu.id, doneMealKeys: nextArr });
    await saveMenuCompletionLog({
      athleteId: profile.email, date: hoyFecha,
      menuId: menu.id,
      doneMealKeys: nextArr,
    }).catch(() => {});

    // Y al registro del día, que es lo que de verdad cuenta en los macros.
    // Solo del día de HOY: mirando el menú del jueves un martes, marcar una
    // comida no puede meterle la cena del jueves en el registro del martes.
    if (selectedDay === hoyWD) {
      const comida = day?.meals.find(m => m.id === mealId);
      if (comida) void sincronizarConElPlan(comida, key, next.has(key));
    }
  }

  /**
   * Lleva (o quita) una comida del menú al registro del día de «Mi plan».
   *
   * Las dos pantallas guardan en documentos distintos y son pestañas hermanas
   * —solo una está montada a la vez—, así que esto escribe el día directamente
   * y deja el resultado en la caché de React Query con la MISMA clave que usa
   * «Mi plan», para que al cambiar de pestaña lo encuentre ya hecho.
   *
   * Contar dos veces lo impide `origenMenu` (ver utils/registroDesdeElMenu):
   * marcar dos veces no suma dos veces, y desmarcar quita exactamente lo que
   * puso el menú, sin tocar lo que el atleta apuntó a mano.
   */
  async function sincronizarConElPlan(meal: MenuMeal, clave: string, marcando: boolean) {
    try {
      const log = await getDietCompletionLog(profile.email, hoyFecha);
      const dia: DiaDelPlan = {
        meals: log?.meals?.length
          ? log.meals
          : estructuraDeDia((onboarding?.meals ?? []).map(m => ({ name: m.name, slot: m.intakeType }))),
        doneItemIds: log?.doneItemIds ?? [],
      };
      const total = macrosDeLaComida(meal);
      /* Los ítems se construyen con la MISMA función que usa el botón «Añadir a
       * mi plan», para que marcar y añadir no puedan volver a separarse. La
       * receta hace falta solo para el nombre cuando el menú no lo trae; si no
       * carga (sin red), se sigue con `intercambios`, porque marcar una comida
       * no puede fallar por no tener la ficha. */
      let items: DietItem[] | undefined;
      try {
        const receta = meal.recipeId ? await getRecipeById(meal.recipeId) : null;
        if (receta) items = itemsDeComidaDelMenu(receta, meal);
      } catch { /* sin ficha: se registra con las kcal y gramos de la comida */ }

      const siguiente = marcando
        ? registrarComidaDelMenu(dia, {
            clave,
            nombre: meal.name,
            slot: meal.slot,
            macros: total,
            etiqueta: meal.recipeName,
            items,
          })
        : quitarComidaDelMenu(dia, clave);
      if (siguiente === dia) return;   // nada que cambiar

      const guardado = {
        athleteId: profile.email,
        date: hoyFecha,
        dietId: log?.dietId ?? '',
        doneItemIds: siguiente.doneItemIds,
        meals: siguiente.meals,
        ...(log?.budget ? { budget: log.budget } : {}),
      };
      queryClient.setQueryData(['dietCompletionLog', profile.email, hoyFecha], {
        ...guardado, id: `${profile.email}_${hoyFecha}`,
      });
      await saveDietCompletionLog(guardado);
      showToast(marcando ? 'Añadida a tu plan del día.' : 'Quitada de tu plan del día.', 'success');
    } catch {
      // Lo del menú ya está marcado; lo que ha fallado es el registro del día.
      showToast('Marcada, pero no se pudo sumar a tu plan. Inténtalo otra vez.');
    }
  }

  /* Guardia de doble clic con ref, no con estado.
   *
   * `anadiendoId` es estado de React: dos toques seguidos dentro del mismo
   * ciclo leen los dos `null` —la closure todavía no se ha re-creado— y los dos
   * pasan, metiendo la comida dos veces en el plan. Es la «receta duplicada»
   * de la auditoría (§8.5). Un ref se actualiza en el acto, así que el segundo
   * toque ya lo ve ocupado. El estado se conserva porque es lo que pinta el
   * spinner del botón. */
  const anadiendoRef = useRef(false);

  async function anadirAlPlan(meal: MenuMeal) {
    if (!meal.recipeId || !onAddToPlan || anadiendoRef.current) return;
    anadiendoRef.current = true;
    setAnadiendoId(meal.id);
    try {
      const receta = await getRecipeById(meal.recipeId);
      if (!receta) { showToast('No se pudo cargar la receta.'); return; }
      /* Con los ítems ya resueltos: la escala servida y los extras de ESTA
       * comida. Antes se pasaba la receta cruda y el plan se quedaba con el
       * plato base — una comida a ×1,5 con pan entraba como una ración pelada.
       * Es el «20 intercambios salen 26» de la auditoría (§8.4). */
      onAddToPlan({ recipe: receta, items: itemsDeComidaDelMenu(receta, meal) });
    } catch {
      // Sin esto, con la red a medias el botón no hacía nada y dejaba una
      // promesa rechazada suelta: al atleta le parece que la app se ha comido
      // el toque.
      showToast('No se pudo cargar la receta.');
    } finally {
      anadiendoRef.current = false;
      setAnadiendoId(null);
    }
  }

  async function openDetail(meal: MenuMeal) {
    if (!meal.recipeId) return;
    // Testigo de "esta es la petición que vale". `detailMealId` se escribía
    // ANTES del await y `detailRecipe` DESPUÉS, así que abrir una comida y
    // pasar deprisa a otra podía emparejar la receta de la primera con el id
    // de la segunda: la ficha enseñaba una receta y los cambios de ingrediente
    // se escribían en la otra comida.
    const peticion = ++peticionDetalleRef.current;
    setDetailOpen(true);
    setDetailMealId(meal.id);
    setPlatoDePrueba(null);
    setSubForIngredient(null);
    setDetailLoading(true);
    setDetailRecipe(null);
    const r = await queryClient.fetchQuery({
      queryKey: ['receta', meal.recipeId],
      queryFn: () => getRecipeById(meal.recipeId),
      staleTime: 5 * 60_000,
    }).catch(() => null);
    if (peticion !== peticionDetalleRef.current) return;
    setDetailRecipe(r);
    setDetailLoading(false);
  }

  function closeDetail() {
    peticionDetalleRef.current++;
    setDetailLoading(false);
    setDetailOpen(false);
    setDetailRecipe(null);
    setDetailMealId(null);
    setPlatoDePrueba(null);
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
    setSwapPendiente(null);
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
        queryClient.fetchQuery({ queryKey: ['recetasDeFranja', meal.slot], queryFn: () => queryRecetasForGenerator(meal.slot, Infinity), staleTime: 5 * 60_000 }),
        queryClient.fetchQuery({ queryKey: ['recipes', profile.userId], queryFn: () => getRecipes({ ownerId: profile.userId }), staleTime: 5 * 60_000 }),
      ]).catch(() => [[], []] as [Recipe[], Recipe[]]);
      const pool = [...recetas, ...builder.filter(r => recipeMatchesSlot(r, meal.slot))];
      // `foodList` y el modo van hasta el final: con ellos, cada alternativa se
      // evalúa con las raciones extra que le tocarían a ELLA, no con el plato
      // pelado (ver `findSwapAlternatives`).
      // Si el coach cerró las recetas de esta comida, solo se ofrecen esas.
      const cerradas = idsCerrados(ingestasAMedida?.[claveDeIngesta(meal, day.meals.findIndex(m => m.id === meal.id))]?.recetas, paquetes);
      setSwapCandidates(findSwapAlternatives(day, meal.id, pool, prefs, Infinity, dietMode, foodList, cerradas ? new Set(cerradas) : undefined));
    }
    setSwapLoading(false);
  }

  function abrirExtras(meal: MenuMeal, idx: number | null) {
    setExtrasFor({ mealId: meal.id, idx });
    setExtraQuery('');
    setExtraPestana('cuadrar');
    setExtraPendiente(null);
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
        kcal: Math.round(totalConExtras(macrosDelPlato(m), siguiente, m.racionesExtra).kcal),
      }),
    });
    queryClient.setQueryData<WeeklyMenu | null>(menuKey, prev => prev ? { ...prev, days: nextDays } : prev);
    setShoppingItems(null); // la lista de la compra cacheada ya no vale
    await updateWeeklyMenu(menu.id, { days: nextDays }).catch(() => {});
  }

  /** Escribe el día tal como lo deja un reajuste (ración elegida o extra que
   *  no cabía) y lo apunta en el historial que ve el coach. */
  async function guardarReajuste(r: Reajuste, mealId: string, tipo: 'racion' | 'extra' | 'ingrediente', texto: string, capricho = false) {
    if (!menu) return;
    const nextDays = menu.days.map(d => d.day === selectedDay ? r.dia : d);
    const reajustes = [...(menu.reajustes ?? []), { at: new Date().toISOString(), day: selectedDay, mealId, tipo, texto, desvioKcal: r.desvioKcal, ...(capricho ? { capricho: true } : {}) }];
    queryClient.setQueryData<WeeklyMenu | null>(menuKey, prev => prev ? { ...prev, days: nextDays, reajustes } : prev);
    setShoppingItems(null);
    // Si Firestore lo rechaza (permisos), no se calla: el reajuste mueve el día
    // entero y un «Guardado» que no se guardó deja al atleta comiendo sobre un
    // día que no existe. Sin red es distinto: `updateWeeklyMenu` lo guarda en el
    // dispositivo y no lanza, como el resto de la app.
    try {
      await guardarMenu(menu.id, { days: nextDays, reajustes });
      showToast(r.estado === 'cuadra'
        ? (r.enSuComida
          ? (r.cambios.length > 0 ? 'Guardado. He ajustado esa comida y el resto del día.' : 'Guardado. He ajustado esa comida.')
          : r.cambios.length > 0 ? 'Guardado. He ajustado el resto del día.' : 'Guardado.')
        : `Guardado. ${r.estado === 'pasado' ? 'Hoy te pasas' : 'Hoy te quedas corto'} ${Math.abs(r.desvioKcal)} kcal.`, 'success');
    } catch {
      // Solo se deshace si en pantalla sigue ESTE cambio (no uno guardado después).
      queryClient.setQueryData<WeeklyMenu | null>(menuKey, prev => prev && prev.days === nextDays ? { ...prev, days: menu.days, reajustes: menu.reajustes } : prev);
      showToast('No se ha podido guardar el cambio. Inténtalo de nuevo.');
    }
  }

  function extrasDe(mealId: string): MenuComplement[] {
    return day?.meals.find(m => m.id === mealId)?.complements ?? [];
  }

  /** La comida con el plato de la alternativa. Los ACOMPAÑAMIENTOS se conservan
   *  (una pieza de fruta sigue valiendo con otro plato), pero las RACIONES EXTRA
   *  se caen: "+45g de arroz" solo tiene sentido mientras el plato sea el arroz
   *  con pollo. Por eso la alternativa se busca para cubrir el plato MÁS sus
   *  raciones extra (ver `findSwapAlternatives`). */
  function comidaConAlternativa(m: MenuMeal, candidate: SwapCandidate): MenuMeal {
    return {
      ...m,
      recipeId: candidate.recipe.id, recipeName: candidate.recipe.name,
      recipeImage: fotoDeReceta(candidate.recipe),
      scale: candidate.scale, macros: candidate.macros,
      // Binarios viejos: siguen leyendo el plato en intercambios.
      exch: (({ HC, PROT, GRASA }) => ({ HC, PROT, GRASA }))(intercambiosDeMacros(candidate.macros)),
      // El ajuste por ingredientes es de la receta ANTERIOR: se cambia por el
      // de la nueva o se quita.
      ajuste: candidate.ajuste,
      racionesExtra: candidate.raciones.length > 0 ? candidate.raciones : undefined,
      kcal: Math.round(totalConExtras(candidate.macros, m.complements, candidate.raciones).kcal),
    };
  }

  /** Cómo queda el día con esa alternativa: si el plato nuevo lo descuadra, el
   *  resto de comidas se recoloca (utils/reajusteDelAtleta). */
  function reajusteDeCambio(candidate: SwapCandidate): Reajuste | null {
    if (!day || !swapFor) return null;
    const meal = day.meals.find(m => m.id === swapFor.mealId);
    if (!meal) return null;
    // «Guiado»: el plato equivalente entra tal cual y las demás comidas no se tocan.
    const fijas = permisos.platoConReajuste ? fijasDelDia : new Set(day.meals.map(m => m.id));
    return cambiarPlato(day, meal.id, comidaConAlternativa(meal, candidate), fijas, limites);
  }

  /** Si el cambio no mueve nada más, se hace sin preguntar; si mueve otras
   *  comidas o deja el día descuadrado, se enseña antes (Dani, 16-11-2026:
   *  «debe avisar también»). */
  function elegirCambio(candidate: SwapCandidate) {
    const r = reajusteDeCambio(candidate);
    if (!r) return;
    if (permisos.platoConReajuste && (r.cambios.length > 0 || r.estado !== 'cuadra')) { setSwapPendiente(candidate); return; }
    void confirmSwap(candidate, r);
  }

  async function confirmSwap(candidate: SwapCandidate, r: Reajuste) {
    if (!menu || !day || !swapFor) return;
    const meal = day.meals.find(m => m.id === swapFor.mealId);
    if (!meal) return;
    const nextDays = menu.days.map(d => d.day === selectedDay ? r.dia : d);
    const swapEntry = {
      at: new Date().toISOString(), day: selectedDay, mealId: meal.id,
      fromRecipeId: meal.recipeId, fromRecipeName: meal.recipeName,
      toRecipeId: candidate.recipe.id, toRecipeName: candidate.recipe.name, toScale: candidate.scale,
    };
    const nextMenu: WeeklyMenu = { ...menu, days: nextDays, swapHistory: [...menu.swapHistory, swapEntry] };
    queryClient.setQueryData(menuKey, nextMenu);
    setSwapFor(null);
    setSwapPendiente(null);
    setShoppingItems(null); // cached list is now stale
    showToast(r.cambios.length > 0
      ? 'Cambiada. He ajustado el resto del día.'
      : r.estado === 'cuadra' ? 'Cambiada. El resto del día no cambia.'
        : `Cambiada. ${r.estado === 'pasado' ? 'Hoy te pasas' : 'Hoy te quedas corto'} ${Math.abs(r.desvioKcal)} kcal.`, 'success');
    await updateWeeklyMenu(menu.id, { days: nextDays, swapHistory: nextMenu.swapHistory }).catch(() => {});
  }

  if (loading) {
    return <ScreenSkeleton />;
  }

  if (!menu) {
    return (
      <div className="space-y-4">
        {/* Antes del primer menú es cuando más sirve saber qué le gusta. */}
        <TarjetaDeArranque email={profile.email} enMiMenu guardar={guardarArranque} />
        <div className="bg-surface border border-hairline rounded-surface">
          <EmptyState
            icon="restaurant_menu"
            title="Todavía no tienes un menú semanal"
            description="Tu entrenador aún no ha publicado un menú basado en recetas. Mientras tanto, sigue usando el Diario."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pantalla space-y-6">
      <TarjetaDeArranque email={profile.email} enMiMenu guardar={guardarArranque} />
      {/* Week strip */}
      <div className="grid grid-cols-7 gap-2">
        {WEEK_DAYS.map(d => {
          const active = d === selectedDay;
          const isToday = d === hoyWD;
          const md = menu.days.find(x => x.day === d);
          const hasMeals = (md?.meals.length ?? 0) > 0;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex flex-col items-center py-2 rounded-control border transition-[color,background-color,border-color,opacity,transform,box-shadow] ${active ? 'bg-accent border-accent text-on-accent' : 'bg-surface border-hairline text-ink-2 hover:border-strong'}`}
            >
              <span className="font-mono text-caption font-bold uppercase">{WEEK_DAY_SHORT[d]}</span>
              {isToday && <span className={`w-1 h-1 rounded-full ${active ? 'bg-veil' : 'bg-accent'}`} />}
              {!hasMeals && <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>remove</span>}
            </button>
          );
        })}
      </div>

      {/* Batch cooking — cook-once plan for the whole week */}
      {menu.batchCooking && batchPlan.length > 0 && (
        <div className="bg-accent/5 border border-accent/25 rounded-surface p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="inventory_2" size="m" className="text-accent-ink" />
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
                trailing={<span className="font-mono text-caption text-accent-ink flex-shrink-0">≈{e.servings} {e.servings === 1 ? 'ración' : 'raciones'}</span>}
              />
            ))}
          </div>
        </div>
      )}

      {/* Shopping list — available for any menu */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
        <button onClick={openShoppingList} className="w-full flex items-center justify-between px-4 py-3 hover:bg-field transition-colors">
          <span className="flex items-center gap-2 font-sans font-bold text-body-s text-ink">
            <Icon name="shopping_cart" size="m" className="text-accent-ink" />
            Lista de la compra de la semana
          </span>
          <Icon name={shoppingOpen ? 'expand_less' : 'expand_more'} size="m" className="text-ink-2" />
        </button>
        {shoppingOpen && (
          <div className="px-4 pb-4">
            {shoppingLoading ? (
              <div className="flex justify-center py-4"><Icon name="progress_activity" size="l" className="text-accent-ink animate-spin" /></div>
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
          <EmptyState icon="event_busy" title="Sin menú para este día" description="Usa el Diario si quieres montarte algo igualmente." />
        </div>
      ) : (
        <div className="space-y-3">
          {day.meals.map(meal => {
            const done = doneKeys.has(`${selectedDay}_${meal.id}`);
            return (
            <React.Fragment key={meal.id}>
              <TarjetaDeComida
                meal={meal}
                done={done}
                esHoy={selectedDay === hoyWD}
                favorita={!!meal.recipeId && isFav(meal.recipeId)}
                noMeGusta={!!meal.recipeId && isDisliked(meal.recipeId)}
                alPlan={onAddToPlan && selectedDay !== hoyWD ? { anadiendo: anadiendoId === meal.id, onAnadir: () => anadirAlPlan(meal) } : null}
                onAbrir={() => openDetail(meal)}
                onHecha={() => toggleDone(meal.id)}
                onExtra={() => abrirExtras(meal, null)}
                onCambiar={() => openSwap(meal)}
                onFavorita={() => toggleFavorite(meal.recipeId)}
                onNoMeGusta={() => toggleDislike(meal.recipeId, meal)}
              />
              {/* Los extras (fruta, pan, yogur) van como si fueran comidas más,
                  cada uno en su fila y con otro color, para que el atleta no se
                  los salte (Dani, 27-10-2026: «plátano y frutas deshidratadas y
                  luego la cena»). Los pone el generador para cerrar lo que el
                  plato no llega a cubrir, pero son EDITABLES: quien decide si
                  es pan, fruta o un yogur es el atleta. */}
              {meal.complements.map((c, ci) => (
                <button
                  key={`${meal.id}_extra_${ci}`}
                  onClick={() => abrirExtras(meal, ci)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-surface border border-accent/30 bg-accent/10 text-left hover:border-accent/60 transition-colors"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center">
                    <Icon name="nutrition" size="m" className="text-accent-ink" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-sans text-caption text-accent-ink uppercase tracking-wider">Extra · {meal.name}</span>
                    <span className="block font-sans font-bold text-body-s text-ink truncate">
                      {esExtraDelCatalogo(c) ? textoDeExtra(c) : `${itemWeightLabel(c.foodLabel, c.quantity)} ${foodNameShort(c.foodLabel)}`}
                    </span>
                  </span>
                  <span className="font-mono text-caption text-ink-2 flex-shrink-0">
                    {Math.round(macrosDeAcompanamiento(c).kcal)} kcal
                  </span>
                  <Icon name="edit" size="s" className="text-ink-3 flex-shrink-0" />
                </button>
              ))}
            </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Tipos de comida que prefieres / variedad / batch cooking / verduras se
          movieron a Perfil > Preferencias — no tenía sentido tenerlos aquí,
          en la pantalla de "ya está hecho", cuando no cambian el menú
          publicado hasta la próxima generación del coach. */}
      {/* Lo que el menú ha tenido en cuenta de él, nombrado (tanda 9). */}
      <HechoCon etiquetas={etiquetasHechoCon({ onboarding, config: nutritionConfig, favoritos: favorites, menus: menu ? [menu] : [] })} />

      <div className="bg-surface border border-hairline rounded-surface p-4 flex items-center justify-between gap-3">
        <p className="font-sans text-caption text-ink-2">
          Tipos de comida, variedad y batch cooking se editan ahora en tu perfil.
        </p>
        <button
          type="button"
          onClick={() => navigate('/profile?tab=preferencias')}
          className="flex-shrink-0 flex items-center gap-1 text-caption font-mono text-accent-ink hover:text-ink transition-colors"
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
            {swapPendiente && day ? (() => {
              const r = reajusteDeCambio(swapPendiente);
              if (!r) return null;
              return (
                <div className="space-y-3">
                  <div className="p-3 bg-raised border border-hairline rounded-control">
                    <p className="font-sans text-body-s text-ink truncate">{swapPendiente.recipe.name}</p>
                    <p className="font-mono text-caption text-ink-2">{Math.round(swapPendiente.macros.kcal)} kcal · {fmtMacros(swapPendiente.macros)}</p>
                  </div>
                  <p className="font-sans text-caption text-ink-2 px-1">
                    {r.cambios.length > 0 ? 'Este plato no es igual que el que tenías. El resto del día se recoloca:' : 'Este plato no es igual que el que tenías y hoy ya no hay dónde compensarlo:'}
                  </p>
                  <ReajusteDelDia dia={day} reajuste={r} mealId={swapFor.mealId} fijas={fijasDelDia} />
                  <div className="flex items-center gap-2">
                    <Button size="s" variant="primary" onClick={() => void confirmSwap(swapPendiente, r)}>Cambiar</Button>
                    <Button size="s" variant="ghost" onClick={() => setSwapPendiente(null)}>Volver</Button>
                  </div>
                </div>
              );
            })() : swapLoading ? (
              <p className="font-sans text-label text-ink-3 text-center py-6">Buscando alternativas que mantengan tus puntos…</p>
            ) : swapCandidates.length === 0 ? (
              <p className="font-sans text-label text-ink-3 text-center py-6">No hay alternativas disponibles ahora mismo para este hueco.</p>
            ) : (
              <>
                {/* La lista ya no son 5 sino todo lo que encaja (cientos en las
                    franjas grandes), así que hace falta poder buscar dentro. */}
                {/* 16 px: por debajo de eso Safari en iOS hace zoom al
                    enfocar el campo y NO lo deshace al salir — el atleta se
                    queda con la pantalla ampliada y la arregla a mano. */}
                <input
                  type="search"
                  value={swapQuery}
                  onChange={e => setSwapQuery(e.target.value)}
                  placeholder="Buscar entre las alternativas…"
                  className="w-full px-3 py-2 bg-bg border border-control-line rounded-control font-sans text-body text-ink placeholder:text-ink-3 focus:border-accent/40 outline-none"
                />
                <p className="font-mono text-caption text-ink-3">
                  {swapExactas.length} cuadran con tus puntos
                  {swapAproximadas.length > 0 && ` · ${swapAproximadas.length} se acercan`}
                </p>

                {[
                  { titulo: 'Cuadran con tus puntos', lista: swapExactas },
                  { titulo: 'Se acercan', lista: swapAproximadas },
                ].map(({ titulo, lista }) => lista.length === 0 ? null : (
                  <div key={titulo} className="space-y-2">
                    <p className="font-sans text-caption text-ink-2 uppercase tracking-wider pt-2">{titulo}</p>
                    {lista.slice(0, swapVisible).map(c => {
                      // La etiqueta sale del reajuste REAL, no de `fit`: un plato
                      // que cuadra con los puntos puede mover igualmente el día.
                      const r = reajusteDeCambio(c);
                      const mantiene = !r || (r.cambios.length === 0 && r.estado === 'cuadra');
                      return (
                      <button
                        key={c.recipe.id}
                        onClick={() => elegirCambio(c)}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left bg-bg border border-hairline hover:border-accent/40 rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow]"
                      >
                        <div className="w-10 h-10 rounded-surface overflow-hidden flex-shrink-0 bg-raised">
                          <FotoDeReceta src={fotoDeReceta(c.recipe)} alt="" className="w-full h-full object-cover" fallback={null} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-sans text-body-s text-ink truncate">{c.recipe.name}</p>
                          <p className="font-mono text-caption text-ink-2">
                            {Math.round(c.macros.kcal)} kcal · {fmtMacros(c.macros)}
                            {mantiene ? ' · mantiene tu día' : permisos.platoConReajuste ? ' · ajusta el resto del día' : ''}
                          </p>
                        </div>
                      </button>
                      );
                    })}
                  </div>
                ))}

                {/* Cada nivel se corta por separado a `swapVisible`, así que el
                    botón tiene que mirar cada uno: comparando la suma contra
                    `swapVisible * 2` se escondía "ver más" habiendo 30 exactas y
                    ninguna aproximada. */}
                {(swapExactas.length > swapVisible || swapAproximadas.length > swapVisible) && (
                  <button
                    onClick={() => setSwapVisible(v => v + SWAP_PAGE)}
                    className="w-full py-3 font-sans text-body-s text-accent-ink hover:text-accent-ink/80 transition-colors"
                  >
                    Ver más alternativas
                  </button>
                )}
              </>
            )}
          </div>
        </Sheet>
      )}

      {/* Elegir extras — del catálogo por 100 g (28-10-2026): fruta, lácteo,
          pan y frutos secos en piezas o gramos exactos; lo que le gusta, primero.
          Un extra viejo del banco se sigue pudiendo subir, bajar o quitar. */}
      {extrasFor && (() => {
        const extras = extrasDe(extrasFor.mealId);
        const actual = extrasFor.idx != null ? extras[extrasFor.idx] : null;
        const q = extraQuery.trim();
        const comidaDelExtra = day?.meals.find(m => m.id === extrasFor?.mealId);
        /* Cuánto cabe todavía en esta comida. El recorte de verdad lo hace la
         * capa de escritura (`updateWeeklyMenu`), que es la que no se puede
         * saltar; esto es para que el atleta VEA el tope en vez de escribir un
         * número que luego le desaparece sin explicación. */
        const hueco = comidaDelExtra ? huecoParaExtra(comidaDelExtra, extrasFor?.idx ?? undefined) : null;
        const cabe = (c: MenuComplement) => !hueco || cabeExtra(hueco, c);

        const esDelCatalogo = !!actual && esExtraDelCatalogo(actual);
        const alimentoActual = actual ? alimentoDelExtra(actual) : null;
        const siguienteCantidad = (delta: 1 | -1): MenuComplement | null => {
          if (!actual || !alimentoActual || !actual.gramos) return null;
          const g = gramosVecinos(alimentoActual, actual.gramos, delta);
          // Sigue siendo suyo: si no, el reajuste del día lo trataría como un extra de cuadrar y podría quitárselo.
          return g == null ? null : { ...extraDeCatalogo(alimentoActual, g), ...(actual.delAtleta ? { delAtleta: true } : {}) };
        };
        const masCatalogo = siguienteCantidad(1);
        const menosCatalogo = siguienteCantidad(-1);
        const topeBanco = comidaDelExtra && actual && !esDelCatalogo
          ? topeDeExtra(comidaDelExtra, actual.category, extrasFor?.idx ?? undefined)
          : Infinity;
        const cabeMas = esDelCatalogo ? !!masCatalogo && cabe(masCatalogo) : actual ? actual.quantity + 0.25 <= topeBanco : true;

        /* Sin buscar: lo que puede ser extra (fruta, lácteo, pan, frutos secos),
         * con lo que le gusta delante. Buscando: el catálogo entero. Un
         * alimento que no cabe ni en su cantidad mínima no se ofrece. */
        /* Caprichos que elige él: según su nivel, ninguno (los pone el coach),
         * unos pocos por semana o sin tope. Cuentan los ya metidos en este menú. */
        const caprichosUsados = (menu?.reajustes ?? []).filter(e => e.capricho).length;
        const caprichosQuedan = Math.max(0, permisos.caprichosPorSemana - caprichosUsados);
        const hayCaprichos = permisos.caprichosPorSemana > 0;
        const enCaprichos = !actual && hayCaprichos && extraPestana === 'caprichos';
        const candidatos = enCaprichos
          ? (q ? buscarCaprichos(q, catalogoAlimentos, 40) : [])
          : q
            ? buscarEnCatalogo(catalogoAlimentos, q, 40)
            : alimentosParaExtras(catalogoAlimentos, { liked: prefs.liked, disliked: prefs.disliked, allergies: prefs.allergies, conditions: prefs.conditions, dietType: prefs.dietType }).map(c => c.a);
        const cabeAlgo = (a: AlimentoCatalogo) => cabe(extraDeCatalogo(a, gramosPosibles(a)[0]));
        /* Cambiando un extra que ya está, solo lo que cabe en su comida. Al
         * añadir uno nuevo se ofrece todo: lo que no cabe entra igual y lo
         * compensa el resto del día (utils/reajusteDelAtleta). */
        const lista = actual || !hayCaprichos ? candidatos.filter(cabeAlgo) : candidatos;
        /* Caprichos sin buscar: primero los que apuntó él en su perfil y
         * después la lista del coach por grupos. La lista no lleva alérgenos:
         * con alergias o intolerancias solo salen los suyos. */
        const conRestricciones = prefs.allergies.length > 0 || (prefs.conditions?.length ?? 0) > 0;
        const noLeGusta = (a: AlimentoCatalogo) => prefs.disliked.some(d => !!normalizeStr(d) && normalizeStr(a.nombre).includes(normalizeStr(d)));
        const propios = (onboarding?.caprichos ?? []).map(alimentoDelCapricho).filter((a): a is AlimentoCatalogo => !!a);
        const grupos: { titulo: string | null; items: AlimentoCatalogo[] }[] = enCaprichos && !q
          ? [
            { titulo: 'Los tuyos', items: propios },
            ...(conRestricciones ? [] : caprichosPorGrupo().map(gr => ({ titulo: gr.titulo, items: gr.caprichos.filter(c => !noLeGusta(c)) as AlimentoCatalogo[] }))),
          ].filter(gr => gr.items.length > 0)
          : [{ titulo: null, items: lista.slice(0, 60) }];
        const hayAlgo = grupos.some(gr => gr.items.length > 0);

        function cambiarCantidad(delta: 1 | -1) {
          if (extrasFor?.idx == null || !actual) return;
          if (esDelCatalogo) {
            const nuevo = delta > 0 ? masCatalogo : menosCatalogo;
            const siguiente = nuevo
              ? extras.map((c, i) => i === extrasFor.idx ? nuevo : c)
              : extras.filter((_, i) => i !== extrasFor.idx);
            guardarExtras(extrasFor.mealId, siguiente);
            if (!nuevo) setExtrasFor(null);
            return;
          }
          const cantidad = Math.round((actual.quantity + delta * 0.25) * 4) / 4;
          const siguiente = cantidad < 0.25
            ? extras.filter((_, i) => i !== extrasFor.idx)
            : extras.map((c, i) => i === extrasFor.idx ? { ...c, quantity: cantidad } : c);
          guardarExtras(extrasFor.mealId, siguiente);
          if (cantidad < 0.25) setExtrasFor(null);
        }

        function elegirAlimento(a: AlimentoCatalogo) {
          if (!extrasFor) return;
          // La mayor cantidad que cabe, empezando por una pieza; si ni media cabe, la mínima.
          const posibles = gramosPosibles(a);
          const preferida = a.unidad ? a.unidad.gramos : posibles[0];
          const quepan = posibles.filter(g => g <= preferida && cabe(extraDeCatalogo(a, g)));
          // No cabe (o es un capricho, que se come entero): antes de añadirlo
          // se le enseña lo que mueve en el resto del día.
          const enteroCabe = cabe(extraDeCatalogo(a, preferida));
          if (enCaprichos) {
            if (caprichosQuedan <= 0 || !day) return;
            const capricho = extraDeCatalogo(a, preferida);
            // Cabe en su comida: entra sin preguntar, pero cuenta para su tope.
            if (enteroCabe) {
              void guardarReajuste(anadirExtraDelAtleta(day, extrasFor.mealId, capricho, fijasDelDia, limites, ingredientesDelExtra), extrasFor.mealId, 'extra', textoDeExtra(capricho), true);
              setExtrasFor(null);
              return;
            }
            setExtraPendiente(capricho);
            return;
          }
          if (extrasFor.idx == null && quepan.length === 0) {
            setExtraPendiente(extraDeCatalogo(a, preferida));
            return;
          }
          const nuevo = { ...extraDeCatalogo(a, quepan.length > 0 ? quepan[quepan.length - 1] : posibles[0]), ...(extrasFor.idx == null || extras[extrasFor.idx]?.delAtleta ? { delAtleta: true } : {}) };
          const siguiente = extrasFor.idx != null
            ? extras.map((c, i) => i === extrasFor.idx ? nuevo : c)
            : [...extras, nuevo];
          guardarExtras(extrasFor.mealId, siguiente);
          setExtrasFor(null);
        }

        const textoActual = actual ? (esDelCatalogo ? textoDeExtra(actual) : `${itemWeightLabel(actual.foodLabel, actual.quantity)} ${foodNameWithoutGrams(actual.foodLabel)}`) : '';

        // Hasta tener la receta no se calcula: con ella el capricho sale de los
        // ingredientes del plato, y lo que se enseña es lo que se guarda.
        const reajustePendiente = extraPendiente && comidaDelExtra && day && !cargandoRecetaDelExtra
          ? anadirExtraDelAtleta(day, comidaDelExtra.id, extraPendiente, fijasDelDia, limites, ingredientesDelExtra)
          : null;
        const cede = reajustePendiente?.enSuComida;
        const num = (n: number) => String(n).replace('.', ',');
        const pendienteVista = extraPendiente && reajustePendiente && comidaDelExtra ? (
          <div className="space-y-3 pt-2">
            <div className="p-3 bg-raised border border-hairline rounded-control">
              <p className="font-sans text-body-s text-ink truncate">{textoDeExtra(extraPendiente)}</p>
              <p className="font-mono text-caption text-ink-2">{Math.round(macrosDeAcompanamiento(extraPendiente).kcal)} kcal · en {comidaDelExtra.name.toLowerCase()}</p>
            </div>
            {cede ? (
              <div className="px-1 space-y-1">
                <p className="font-sans text-caption text-ink-2">
                  Entra entero. Para hacerle sitio, tu {comidaDelExtra.name.toLowerCase()} baja {cede.kcalAntes - cede.kcalDespues} kcal:
                </p>
                <ul className="space-y-1">
                  {cede.ingredientes.map(i => (
                    <li key={i.nombre} className="flex items-baseline justify-between gap-2 font-sans text-label text-ink">
                      <span className="truncate">{i.nombre}</span>
                      <span className="font-mono text-caption shrink-0">
                        <span className="text-ink-3 line-through mr-2">{i.antes} g</span>
                        <span className="text-accent-ink font-semibold">{i.despues} g</span>
                      </span>
                    </li>
                  ))}
                  {cede.ingredientes.length === 0 && (
                    <li className="flex items-baseline justify-between gap-2 font-sans text-label text-ink">
                      <span className="truncate">{comidaDelExtra.recipeName}</span>
                      <span className="font-mono text-caption shrink-0">
                        <span className="text-ink-3 line-through mr-2">×{num(cede.racionAntes)}</span>
                        <span className="text-accent-ink font-semibold">×{num(cede.racionDespues)}</span>
                      </span>
                    </li>
                  )}
                </ul>
                {reajustePendiente.cambios.length > 0 && (
                  <p className="font-sans text-caption text-ink-2 pt-1">Lo que ese plato no puede ceder sale del resto del día.</p>
                )}
              </div>
            ) : (
              <p className="font-sans text-caption text-ink-2 px-1">
                No cabe en esta comida tal como está. Entra entero y el resto del día se recoloca:
              </p>
            )}
            <ReajusteDelDia dia={day!} reajuste={reajustePendiente} mealId={comidaDelExtra.id} fijas={fijasDelDia} />
            <div className="flex items-center gap-2">
              <Button
                size="s"
                variant="primary"
                onClick={() => {
                  void guardarReajuste(reajustePendiente, comidaDelExtra.id, 'extra', `${textoDeExtra(extraPendiente)} en ${comidaDelExtra.name.toLowerCase()}${cede ? ` (el plato baja ${cede.kcalAntes - cede.kcalDespues} kcal)` : ''}`, extraPestana === 'caprichos');
                  setExtraPendiente(null);
                  setExtrasFor(null);
                }}
              >Añadir</Button>
              <Button size="s" variant="ghost" onClick={() => setExtraPendiente(null)}>Volver</Button>
            </div>
          </div>
        ) : null;

        return (
          <Sheet
            open
            onClose={() => setExtrasFor(null)}
            title={actual ? 'Cambiar este extra' : 'Añadir un extra'}
            size="m"
          >
            {pendienteVista ?? (
            <div className="space-y-3 pt-2">
              {actual && (
                <div className="flex items-center justify-between gap-3 p-3 bg-raised border border-hairline rounded-control">
                  <div className="min-w-0">
                    <p className="font-sans text-body-s text-ink truncate">{textoActual}</p>
                    <p className="font-mono text-caption text-ink-2">{Math.round(macrosDeAcompanamiento(actual).kcal)} kcal</p>
                  </div>
                  {/* Mismo patrón que el `Stepper` de MesocycleManager: el
                      carácter, no un <Icon>. Con el icono sobre `bg-bg` y sin
                      color explícito los dos botones salían casi invisibles
                      (comprobado en navegador a 375px). */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => cambiarCantidad(-1)}
                      className="w-11 h-11 rounded-control bg-raised text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center"
                      title={esDelCatalogo ? (actual.piezas ? 'Media pieza menos' : '25 g menos') : 'Menos cantidad'}
                    >−</button>
                    <span className="font-mono text-body-s text-ink min-w-10 text-center">
                      {esDelCatalogo ? (actual.piezas ? `${actual.piezas}` : `${actual.gramos} g`) : actual.quantity}
                    </span>
                    <button
                      onClick={() => cambiarCantidad(1)}
                      disabled={!cabeMas}
                      className="w-11 h-11 rounded-control bg-raised text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center disabled:opacity-40 disabled:hover:text-ink-2"
                      title={cabeMas ? (esDelCatalogo ? (actual.piezas ? 'Media pieza más' : '25 g más') : 'Más cantidad') : 'Esta comida ya llega a su objetivo'}
                    >+</button>
                  </div>
                </div>
              )}

              {actual && !cabeMas && (
                <p className="font-sans text-caption text-ink-2 px-1">
                  Esta comida ya llega a lo que te toca. Los extras están para
                  completar lo que falta, no para sumar de más.
                </p>
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

              {!actual && hayCaprichos && (
                <div className="grid grid-cols-2 gap-1 p-1 bg-raised rounded-control">
                  {([['cuadrar', 'Para completar'], ['caprichos', 'Caprichos']] as const).map(([id, texto]) => (
                    <button
                      key={id}
                      onClick={() => { setExtraPestana(id); setExtraQuery(''); }}
                      className={`py-2 rounded-lg font-sans text-label font-bold transition-colors ${extraPestana === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
                    >{texto}</button>
                  ))}
                </div>
              )}

              <div>
                <p className="font-mono text-caption text-ink-3 mb-2">
                  {actual ? 'Cámbialo por otro alimento' : enCaprichos ? (Number.isFinite(caprichosQuedan) ? (caprichosQuedan > 0 ? `Te ${caprichosQuedan === 1 ? 'queda' : 'quedan'} ${caprichosQuedan} de ${permisos.caprichosPorSemana} esta semana · entra entero y tu comida se ajusta` : `Ya has usado tus ${permisos.caprichosPorSemana} caprichos de esta semana`) : 'Entra entero; tu comida se ajusta sola') : 'Fruta, lácteos, pan y frutos secos; lo que te gusta, primero'}
                </p>
                <input
                  type="search"
                  value={extraQuery}
                  onChange={e => setExtraQuery(e.target.value)}
                  placeholder={enCaprichos ? 'Buscar un capricho (helado, chocolate…)' : 'Buscar en el catálogo (plátano, yogur, pan…)'}
                  className="w-full px-3 py-2 bg-bg border border-control-line rounded-control font-sans text-body text-ink placeholder:text-ink-3 focus:border-accent/40 outline-none"
                />
              </div>

              <div className="space-y-1">
                {catalogoAlimentos.length === 0 ? (
                  <p className="font-sans text-label text-ink-3 text-center py-6">El catálogo no ha cargado. Inténtalo otra vez con conexión.</p>
                ) : !hayAlgo ? (
                  <p className="font-sans text-label text-ink-3 text-center py-6">
                    {q ? 'Nada con ese nombre.' : enCaprichos ? 'Aún no has apuntado caprichos. Búscalo arriba o apúntalos en Perfil › Preferencias.' : 'Ningún extra cabe ya en esta comida.'}
                  </p>
                ) : grupos.map(gr => (
                  <React.Fragment key={gr.titulo ?? 'lista'}>
                    {gr.titulo && <p className="font-mono text-caption text-ink-3 uppercase pt-2">{gr.titulo}</p>}
                    {gr.items.map(a => {
                      const muestra = extraDeCatalogo(a, a.unidad ? a.unidad.gramos : gramosPosibles(a)[0]);
                      const ajusta = !actual && (enCaprichos ? !cabe(muestra) : !cabeAlgo(a));
                      return (
                        <button
                          key={a.id}
                          onClick={() => elegirAlimento(a)}
                          disabled={enCaprichos && caprichosQuedan <= 0}
                          className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left bg-bg border border-hairline hover:border-accent/40 rounded-control transition-[color,background-color,border-color,opacity,transform,box-shadow] disabled:opacity-50 disabled:hover:border-hairline"
                        >
                          <span className="min-w-0">
                            <span className="block font-sans text-body-s text-ink truncate">{nombreDeAlimento(a)}</span>
                            <span className="block font-mono text-caption text-ink-3">{enCaprichos ? textoDeRacion(a) : `${textoDeExtra(muestra)} · ${muestra.macros!.kcal} kcal`}</span>
                          </span>
                          {enCaprichos
                            ? null
                            : ajusta
                            ? <Badge tone="neutral">Ajusta el día</Badge>
                            : prefs.liked.some(l => normalizeStr(a.nombre).includes(normalizeStr(l))) && <Badge tone="accent">Te gusta</Badge>}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
                {enCaprichos && !q && conRestricciones && (
                  <p className="font-sans text-caption text-ink-3 px-1 pt-2">Con tus alergias o intolerancias aquí solo salen los que has apuntado tú. Para otros, búscalo o pídeselo a tu entrenador.</p>
                )}
              </div>
            </div>
            )}
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
                <Icon name="progress_activity" size="l" className="text-accent-ink animate-spin" />
              </div>
            ) : detailRecipe ? (
              <>
                {fotoDeReceta(detailRecipe) && (
                  <div className="w-full aspect-[16/9] rounded-surface overflow-hidden bg-raised">
                    <FotoDeReceta src={fotoDeReceta(detailRecipe)} alt={detailRecipe.name} className="w-full h-full object-cover" fallback={null} />
                  </div>
                )}
                {detailMeal && day && detalleEnElDia ? (
                  <RacionDelMenu
                    dia={day}
                    meal={detailMeal}
                    prueba={platoDePrueba}
                    reajuste={reajusteDePrueba}
                    fijas={fijasDelDia}
                    hecha={detalleHecha}
                    pasoMaximo={permisos.pasoDeRacion}
                    onProbar={setPlatoDePrueba}
                    onGuardar={guardarPlatoDePrueba}
                  />
                ) : (detailMeal?.scale ?? 1) !== 1 && (
                  <p className="font-mono text-caption text-accent-ink">
                    Cantidades para ×{detailMeal!.scale} de la receta
                  </p>
                )}
                {/* El ajuste por ingredientes (`detailMeal.ajuste`) ya va metido
                    en las cantidades de abajo. No se le cuenta al atleta qué se
                    ha tocado ni por qué (Dani, 27-10-2026: «quítalos, no hace
                    falta que se lo digas»): para él es la receta, sin más. */}
                {detailRecipeVista?.kcal != null && (
                  <p className="font-mono text-caption text-ink-2">{detailRecipeVista.kcal} kcal{detailRecipe.cookingTime != null ? ` · ~${minutosDeReceta(detailRecipe)} min` : ''}</p>
                )}
                {(detailRecipeVista?.ingredientsText?.length || detailRecipeVista?.ingredients?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Ingredientes</p>
                    <ul className="">
                      {(detailRecipeVista.ingredientsText?.length
                        ? detailRecipeVista.ingredientsText.map((i, n) => ({ label: i.name, qty: Number.isFinite(i.quantity) ? `${i.quantity}g` : '', variable: variablesDelDetalle.get(n) }))
                        : (detailRecipeVista.ingredients ?? []).map(i => ({ label: i.foodLabel, qty: `×${i.quantity}`, variable: undefined as IngredienteVariable | undefined }))
                      ).map((ing, idx) => {
                        const v = ing.variable;
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
                                    <span className="text-accent-ink">→ {swappedTo}</span>
                                  </>
                                ) : (
                                  <span className="text-ink">{ing.label}</span>
                                )}
                              </span>
                              {v ? (
                                <span className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => moverIngrediente(v, -1)} disabled={v.gramos <= v.min} title={`${v.paso} g menos`}
                                    className="w-9 h-9 rounded-control bg-surface border border-hairline text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center disabled:opacity-40"
                                  >−</button>
                                  <span className={`font-mono text-caption min-w-12 text-center ${v.gramos !== v.pautado ? 'text-accent-ink font-semibold' : 'text-ink-2'}`}>{v.gramos}g</span>
                                  <button
                                    onClick={() => moverIngrediente(v, 1)} disabled={v.gramos >= v.max} title={`${v.paso} g más`}
                                    className="w-9 h-9 rounded-control bg-surface border border-hairline text-ink-2 hover:text-ink text-body-s font-bold flex items-center justify-center disabled:opacity-40"
                                  >+</button>
                                </span>
                              ) : (
                                <span className="font-mono text-caption text-ink-2 shrink-0">{ing.qty}</span>
                              )}
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
                                    className="px-2 rounded-control bg-raised border border-hairline text-ink font-mono text-caption hover:border-accent/50 hover:text-accent-ink"
                                  >{s}</button>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {detailMealId && (
                      <p className="font-sans text-caption text-ink-3 mt-2">
                        {variablesDelDetalle.size > 0 ? 'Sube o baja los gramos de cada ingrediente: el resto del día se ajusta. ' : ''}
                        Cambia un ingrediente por otro parecido si no lo tienes o no te gusta.
                      </p>
                    )}
                    {/* La barra de guardar también aquí abajo: los ingredientes
                        quedan lejos de la caja de la ración. */}
                    {platoDePrueba && reajusteDePrueba && (
                      <div className="mt-3 p-3 bg-surface border border-hairline rounded-control">
                        <p className={`flex items-center gap-1 font-mono text-caption ${reajusteDePrueba.estado === 'cuadra' ? 'text-success' : 'text-accent-ink'}`}>
                          <Icon name={reajusteDePrueba.estado === 'cuadra' ? 'check_circle' : 'info'} size="s" />
                          {textoDeEstado(reajusteDePrueba)}
                        </p>
                        {reajusteDePrueba.cambios.map(c => (
                          <p key={c.mealId} className="font-sans text-caption text-ink-2 mt-1">{textoDeCambio(c)}</p>
                        ))}
                        <div className="flex items-center gap-2 mt-3">
                          <Button size="s" variant="primary" onClick={guardarPlatoDePrueba}>Guardar</Button>
                          <Button size="s" variant="ghost" onClick={() => setPlatoDePrueba(null)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {(detailRecipe.stepsText?.length || detailRecipe.steps?.length) ? (
                  <div>
                    <p className="font-mono text-caption text-ink-3 uppercase mb-2">Preparación</p>
                    <ol className="space-y-2 list-decimal list-inside">
                      {(detailRecipe.stepsText?.length
                        ? detailRecipe.stepsText.map(s => ({ texto: s.description, items: s.items ?? [] }))
                        : (detailRecipe.steps ?? []).map(t => ({ texto: t, items: [] as { position: number; description: string }[] }))
                      ).map(({ texto, items }, idx) => (
                        <li key={idx} className="text-label text-ink-2 font-sans leading-relaxed">
                          {texto}
                          {/* Lo que cuelga del paso ("…mezcla bien:" + la lista). */}
                          {items.length > 0 && (
                            <ul className="mt-1 ml-4 space-y-0.5">
                              {items.map(sub => (
                                <li key={sub.position} className="flex gap-2">
                                  <span aria-hidden="true" className="text-ink-3">·</span>
                                  <span>{sub.description.trim()}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
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
