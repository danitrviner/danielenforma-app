import { type ListaDeMenu } from './accesoARecetas';
import { aplicarSeleccion, type PaqueteDeRecetas, type SeleccionDeRecetas } from './seleccionDeRecetas';
import { recetasOcultas, type AmbitoDeRegla, type ReglaDeReceta } from './reglasDeReceta';
import {
  Recipe, MealItem, Diet, WeekDay, DietType, DietMode, FoodCategory, Macros, NutritionProgram,
  MenuDay, MenuMeal, MenuComplement, MenuRacionExtra, HungerProfile, AjusteDeReceta,
} from '../types';
import { round2 } from './exchangeHelpers';
import { ingredientesEscalables } from './escalarIngrediente';
import { superaElTiempo } from './tiempoDeReceta';
import { slotPercents } from './slotWeights';
import { ingredientMatch, violatesDietType } from './foodPrefs';
import { violatesHealthConditions } from './dietaryRestrictions';
import { ajustarReceta, sePuedeAjustar } from './ajusteDeReceta';
import { simpleComplementsFor, encajaEnCategoria } from './menuComplements';
import { dishType, DishType } from './dishTypes';
import { fotoDeReceta } from './fotoDeReceta';
import { kcalDeGramos, MACROS_CERO, redondearMacros, restarMacros, sinNegativos, sumarMacros, escalarMacros } from './macros';
import { intercambiosDeMacros, macrosDeIntercambios, objetivoDeDieta } from './macrosLegado';
import {
  macrosDeLaComida, macrosDelPlato, macrosDeRaciones, macrosDeRacionesExtra, macrosDeAcompanamientos,
  objetivoDeLaComida, objetivoDelDiaDeMenu, macrosDelDiaDeMenu,
} from './menuMacros';
import { ajustesDeLaSemana, aplicarAjustes, semanaDelPrograma } from './semanasNutricion';
import { hoyIsoLocal } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Generador de menús semanales por recetas, en kcal y gramos (10-2026)

   Reescrito sobre el de intercambios (Dani, 26-10-2026). Lo que hace es lo
   mismo —elegir un plato por comida, escalarlo, completar con más ración de la
   propia receta o con un acompañamiento, y cuadrar el DÍA—, pero:

     · Mide en gramos de proteína, hidratos y grasa y en kcal. El objetivo del
       día es el de la dieta en kcal (`objetivoDeDieta`), con los ajustes de la
       semana ya aplicados.
     · Usa los gramos EXACTOS de cada receta. El motor anterior usaba los
       intercambios del índice, redondeados a enteros: una receta de 352 kcal
       contaba como 300, y escalada ×4 el error pasaba de 200 kcal por comida.
     · Las kcal de cada comida son las de la receta, no las de sus intercambios.
     · Cuenta los intercambios mixtos del cupo de las dietas viejas (antes el
       objetivo los perdía y esos días salían cortos).
     · La tolerancia del día mira también cada macro, no solo el total: un día
       con 300 kcal de grasa de más y 300 de hidratos de menos ya no pasa por
       «cuadrado».
     · «Desactualizado» compara contra las dietas con los ajustes de la semana
       del menú (antes saltaba en falso en cualquier semana con ajustes).

   Cómo se mide el error: en kcal de cada macro (P y HC a 4 kcal/g, grasa a 9),
   con más peso en la macro de la que menos pide la comida —es la que hay que
   cuidar—. Las preferencias (favoritas, variedad…) se expresan en esas mismas
   kcal, así que se comparan con el error nutricional en la misma escala.

   Acompañamientos y raciones extra van en RACIONES del banco (utils/menuMacros).
   ═══════════════════════════════════════════════════════════════════════════ */

// Raciones a las que se puede servir una receta. El recetario está construido
// en torno a platos de 400 kcal y una comida de un atleta de 2.600 kcal ronda
// las 1.000: hasta ×4 llega el 91 % de las recetas (Dani, 2026-09-05: "si la
// comida es de 600 kcal, buscamos recetas de 600 o que se puedan multiplicar").
export const MENU_SCALES = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4,
] as const;
const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const KCAL_G = { p: 4, hc: 4, g: 9 } as const;
type Macro = keyof typeof KCAL_G;
const MACROS: Macro[] = ['hc', 'p', 'g'];

// ── Encaje ──
/** Las preferencias solo ordenan dentro de esta banda de error sobre el mejor
 *  encaje: 50 kcal o el 15 % de la comida, lo que sea mayor. */
const BANDA_MINIMA_KCAL = 50;
const BANDA_PCT = 0.15;
/** Lo que no encaja queda siempre al final, por mucha preferencia que tenga. */
const FUERA_DE_BANDA = 1e6;
/** Peso por macro: suelo de lo que pide y techo del peso (ver `pesosPorMacro`). */
const MACRO_MINIMO_KCAL = 50;
const PESO_MAXIMO = 4;
/** Por debajo de esto, excluir los "no me gusta" dejaría la franja sin recetas. */
const MIN_RECETAS_PARA_EXCLUIR = 5;

// ── Preferencias, en kcal de error equivalentes ──
const BONO_FAVORITA = 300;
const BONO_TIPO_PREFERIDO = 150;
const CASTIGO_NO_GUSTA = 200;
const BONO_GUSTA = 50;
const BONO_TUPPER = 50;
const BONO_RAPIDAS = 150;
const CASTIGO_BATCH_SIN_TUPPER = 400;
const CASTIGO_REPETIDA = 500;
const CASTIGO_TIPO_REPETIDO = 200;

// ── Comodín (raciones extra y acompañamientos) ──
/** Tope de acompañamientos de UNA comida. Un plato admite un acompañamiento y
 *  un postre; más ya es una lista de la compra (Dani, 2026-09-05). */
const MAX_ACOMPANAMIENTOS_POR_COMIDA = 2;
/** Y cuántas kcal pueden sumar entre todos: el comodín ayuda a cuadrar, no es
 *  media comida colgando del plato. */
const MAX_KCAL_ACOMPANAMIENTOS = 300;
/** Lo lejos que puede quedarse una receta del objetivo de su franja (a su
 *  ración máxima) y aun así valer: justo lo que el comodín puede cerrar. */
const MARGEN_COMODIN_KCAL = MAX_KCAL_ACOMPANAMIENTOS;
/** Tope de ingredientes distintos de la receta a los que subir la ración. */
const MAX_RACIONES_EXTRA_POR_COMIDA = 2;
/** Mínimos en raciones del banco: por debajo salían consejos que nadie sigue
 *  ("+3 g de aceite", "un cuarto de plátano"). */
const MIN_RACION_EXTRA = 0.5;
const MIN_COMPLEMENTO = 0.5;
/** Tope de raciones de UN mismo acompañamiento. */
const MAX_RACIONES_POR_COMPLEMENTO = 2;
const MAX_COMPLEMENTOS_POR_MACRO = 3;
/** Las raciones del banco van de 0,25 en 0,25. */
const PASO_RACION = 0.25;

// ── Tolerancias del día ──
/** Un día se da por cuadrado si el total no se sale más de esto… */
const TOLERANCIA_DIA_KCAL = 100;
/** …y ninguna macro más de esto (o del 20 % de lo que pide esa macro). */
const TOLERANCIA_MACRO_KCAL = 100;
const TOLERANCIA_MACRO_PCT = 0.2;
/** Con la semana ya pasada más de esto, el día sale sin acompañamientos. */
const MARGEN_SEMANA_KCAL = 50;

export interface MealSlotSpec {
  slot: number;   // intakeType 1-5
  name: string;
  pct: number;    // % of the day's budget for this slot
  needsTupper?: boolean;
}

export interface GeneratorPrefs {
  allergies: string[];
  /** Filtro DURO por condición de salud (celiaquía, intolerancias, embarazo…).
   *  Códigos del recetario, ver `utils/dietaryRestrictions.ts`. Una receta que
   *  no lleva el dato tampoco sale: ver `violatesHealthConditions`. */
  conditions?: number[];
  disliked: string[];
  liked: string[];
  dietType?: DietType;
  cookingMaxTime?: number;
  /** Adelanta las Rápidas aunque tenga tiempo de sobra. */
  quiereRapidas?: boolean;
  variety: number; // 1 (monotone) - 5 (max variety)
  favoriteRecipeIds?: string[];  // strong bonus — surface these much more
  dislikedRecipeIds?: string[];  // hard-excluded ("no me gusta")
  preferredDishTypes?: DishType[]; // strong bonus for these dish types
  excludedDishTypes?: DishType[];  // hard-excluded dish types
  /** Recetas que el COACH esconde a este atleta, en todos o en algunos días. */
  recetasOcultas?: ReglaDeReceta[];
  /** Lista de recetas con las que el coach quiere trabajar con este atleta
   *  (utils/accesoARecetas.ts). Ausente = todas. Solo afecta al menú y a los cambios. */
  listaMenu?: ListaDeMenu;
  /** Qué recetas usa el generador con cada dieta (seleccionDeRecetas.ts). Gana a
   *  `listaMenu` en las dietas que tienen filtro. */
  seleccion?: SeleccionDeRecetas;
  /** Paquetes del coach a los que puede apuntar `seleccion`. */
  paquetes?: PaqueteDeRecetas[];
}

// ─── Meal slots from anamnesis ──────────────────────────────────────────────

const SLOT_NAME: Record<number, string> = {
  1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena',
};

/** Franjas de ingesta (1-5) que usa cada número de comidas. La sexta comida
 *  —la recena— repite la franja 5: solo hay cinco tipos de ingesta y son las
 *  recetas de cena las que le sirven. `slotWeights` reparte el peso de la franja
 *  entre las dos para que la noche no se lleve el doble. */
const SLOTS_POR_CONTEO: Record<ConteoComidas, number[]> = {
  3: [1, 3, 5],
  4: [1, 2, 3, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 5],
};

/** Nombre de cada comida cuando se repite la franja (la 2ª de la 5 es recena). */
const NOMBRES_POR_CONTEO: Partial<Record<ConteoComidas, string[]>> = {
  6: ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena', 'Recena'],
};

export type ConteoComidas = 3 | 4 | 5 | 6;
export const CONTEOS_COMIDAS: ConteoComidas[] = [3, 4, 5, 6];

function slotsPorConteo(count: ConteoComidas, hungerProfile?: HungerProfile): MealSlotSpec[] {
  const nums = SLOTS_POR_CONTEO[count];
  const pcts = slotPercents(nums, hungerProfile);
  const nombres = NOMBRES_POR_CONTEO[count];
  return nums.map((slot, i) => ({ slot, name: nombres?.[i] ?? SLOT_NAME[slot], pct: pcts[i] }));
}

/** Reparto de referencia sin perfil de hambre. Se conserva como export porque
 *  `mealDistribution.resolveSlots` lo usa para deducir la franja de una dieta
 *  vieja que no trae `slot`; ahí solo importan los números de franja. */
export const FALLBACK_SLOTS: Record<ConteoComidas, MealSlotSpec[]> = {
  3: slotsPorConteo(3),
  4: slotsPorConteo(4),
  5: slotsPorConteo(5),
  6: slotsPorConteo(6),
};

// Prefers the athlete's own anamnesis meals (name + needsTupper preserved);
// falls back to a generic preset when onboarding is missing or incomplete.
//
// El reparto sale de `utils/slotWeights.ts`, el MISMO que usa la dieta de
// intercambios del entrenador, y hace caso al perfil de hambre del atleta. Antes
// eran porcentajes fijos escritos aquí a mano (20/10/40/30) que no coincidían
// con los de la dieta (20/10/38/10/27) y que ignoraban por completo la pregunta
// de "¿cuándo tienes más hambre?": el atleta decía que cenaba fuerte, lo veía
// aplicado en su dieta, y el menú de recetas le seguía plantando un desayunazo.
//
// `hungerProfile` se lee del PERFIL del atleta (AthleteNutritionConfig, o su
// ficha de iniciación como valor de partida), nunca de la dieta que el
// entrenador tenga abierta: retocar a mano los intercambios de una dieta no debe
// reescribir el menú, y cambiar el menú se hace desde la ficha o desde
// Perfil > Preferencias (Dani, 2026-09-05).
export function slotsFromOnboarding(
  ob: { mealCount?: number; meals?: { intakeType: number; name: string; needsTupper: boolean }[] } | null,
  hungerProfile?: HungerProfile,
  /** Lo que el atleta haya cambiado en Perfil > Preferencias
   *  (`AthleteNutritionConfig.mealCount`). Manda sobre la ficha de alta, igual
   *  que `dietType` y `cookingMaxTime`, que ya se leían así en las prefs.
   *
   *  Sin este parámetro, el panel guardaba el cambio y el generador seguía
   *  leyendo solo la ficha: el atleta pedía cinco comidas, veía su elección
   *  guardada, y el menú le llegaba con cuatro. Es un parámetro explícito y no
   *  una lectura interna para que quien llame tenga que decidir a propósito qué
   *  manda. */
  mealCountOverride?: number,
): MealSlotSpec[] {
  const pedidas = mealCountOverride ?? ob?.mealCount;
  const count: ConteoComidas = CONTEOS_COMIDAS.includes(pedidas as ConteoComidas)
    ? (pedidas as ConteoComidas) : 4;
  if (ob?.meals && ob.meals.length === count) {
    const pcts = slotPercents(ob.meals.map(m => m.intakeType), hungerProfile);
    return ob.meals.map((m, i) => ({
      slot: m.intakeType, name: m.name, pct: pcts[i], needsTupper: m.needsTupper,
    }));
  }
  return slotsPorConteo(count, hungerProfile);
}

// Recipes from the imported recetario carry a reliable intakeTypes tag; builder recipes (coach/athlete)
// don't — RecipeBuilderScreen only offers free-form category tags. So a builder
// recipe is eligible for any slot unless explicitly tagged "Desayuno"/"Cena".
// Shared by the coach's generator/editor and the athlete's swap picker so both
// build recipe pools the same way.
export function recipeMatchesSlot(recipe: Recipe, slot: number): boolean {
  if (recipe.intakeTypes && recipe.intakeTypes.length > 0) return recipe.intakeTypes.includes(slot);
  if (recipe.categories?.includes('Desayuno')) return slot === 1;
  if (recipe.categories?.includes('Cena')) return slot === 5;
  return true;
}


export interface MenuCandidate {
  recipe: Recipe;
  scale: number;
  /** Receta base ajustada por ingredientes (N-06); `scale` es entonces 1. */
  ajuste?: AjusteDeReceta;
  /** kcal y gramos del plato a esa escala. */
  macros: Macros;
  score: number; // lower is better
}

// ─── Vectores ────────────────────────────────────────────────────────────────

const VACIO: Macros = { ...MACROS_CERO };

/** kcal que aporta cada macro (no el total de la etiqueta). */
function kcalDeMacro(m: Macros, macro: Macro): number {
  return m[macro] * KCAL_G[macro];
}

/** El objetivo de un vector de gramos: las kcal salen de los gramos. */
function conKcal(m: { p: number; hc: number; g: number }): Macros {
  return { kcal: kcalDeGramos(m), p: m.p, hc: m.hc, g: m.g };
}

/** Reparte unos gramos por pesos con suma EXACTA, al gramo (mayor resto). */
function repartirGramos(total: number, pesos: number[]): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  const unidades = Math.round(total);
  const suma = pesos.reduce((s, w) => s + w, 0);
  if (unidades <= 0) return pesos.map(() => 0);
  const exactos = suma > 0 ? pesos.map(w => (unidades * w) / suma) : pesos.map(() => unidades / n);
  const out = exactos.map(Math.floor);
  let resto = unidades - out.reduce((s, v) => s + v, 0);
  const orden = exactos.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; resto > 0; k++, resto--) out[orden[k % n].i] += 1;
  return out;
}

// Reparte el objetivo del día entre las franjas por su peso (`sl.pct`), macro a
// macro y con suma exacta al gramo.
export function slotTargets(objetivoDia: Macros, slots: MealSlotSpec[]): Macros[] {
  const pesos = slots.map(sl => sl.pct);
  const p = repartirGramos(objetivoDia.p, pesos);
  const hc = repartirGramos(objetivoDia.hc, pesos);
  const g = repartirGramos(objetivoDia.g, pesos);
  return slots.map((_, i) => conKcal({ p: p[i], hc: hc[i], g: g[i] }));
}

// ─── Receta → kcal y gramos ──────────────────────────────────────────────────

const basePorReceta = new WeakMap<Recipe, Map<DietMode, Macros | null>>();

/**
 * kcal y gramos de una ración de la receta. Por orden de confianza: los gramos
 * del recetario (`macros`, exactos), los ingredientes del constructor en el
 * modo de dieta del atleta (por sus raciones del banco) y, en recetas viejas,
 * sus intercambios. Null si no hay de dónde sacarlo.
 */
export function macrosBaseDeReceta(recipe: Recipe, mode: DietMode = 'OMNIVORO'): Macros | null {
  let porModo = basePorReceta.get(recipe);
  if (!porModo) { porModo = new Map(); basePorReceta.set(recipe, porModo); }
  if (porModo.has(mode)) return porModo.get(mode)!;
  let m: Macros | null = null;
  const mac = recipe.macros;
  if (mac && (mac.prot || mac.carb || mac.fat)) {
    const g = { p: mac.prot ?? 0, hc: mac.carb ?? 0, g: mac.fat ?? 0 };
    m = { kcal: recipe.kcal && recipe.kcal > 0 ? recipe.kcal : kcalDeGramos(g), ...g };
  } else if ((recipe.ingredients ?? []).length > 0) {
    const relevantes = recipe.ingredients.filter(i => i.mode === mode);
    const usar = relevantes.length > 0 ? relevantes : recipe.ingredients;
    const v: Partial<Record<FoodCategory, number>> = {};
    for (const ing of usar) v[ing.category] = (v[ing.category] ?? 0) + (ing.quantity ?? 0);
    m = macrosDeIntercambios(v);
  } else if (recipe.exchanges) {
    m = macrosDeIntercambios(recipe.exchanges);
  }
  if (m && m.kcal <= 0) m = null;
  porModo.set(mode, m);
  return m;
}

/** Lo que suma una comida: el plato, la ración extra de sus ingredientes y los
 *  acompañamientos. Exportado porque la pantalla del atleta lo recalcula cada
 *  vez que se toca algo. */
export function totalConExtras(
  plato: Macros,
  complements: MenuComplement[],
  raciones?: MenuRacionExtra[],
): Macros {
  return sumarMacros(plato, macrosDeAcompanamientos(complements), macrosDeRacionesExtra(raciones));
}

// ─── Escala y encaje ─────────────────────────────────────────────────────────

/** Peso de cada macro en el error: la media de lo que pide la comida entre lo
 *  que pide esa macro. Cuanto menos pide una macro, más caro desviarse en ella
 *  (pasarse 40 g de grasa en una dieta de 70 es mucho peor que 40 g de
 *  hidratos en una de 300). El suelo evita dividir por casi cero. */
function pesosPorMacro(objetivo: Macros): Record<Macro, number> {
  const kc = MACROS.map(m => kcalDeMacro(objetivo, m));
  const media = kc.reduce((s, v) => s + v, 0) / 3;
  if (media <= 0) return { p: 1, hc: 1, g: 1 };
  const peso = (v: number) => Math.min(PESO_MAXIMO, media / Math.max(v, MACRO_MINIMO_KCAL));
  return { hc: peso(kc[0]), p: peso(kc[1]), g: peso(kc[2]) };
}

/** Error ponderado, en kcal, entre lo puesto y el objetivo. */
function errorPonderado(objetivo: Macros, puesto: Macros, pesos = pesosPorMacro(objetivo)): number {
  return round2(MACROS.reduce((s, m) => s + pesos[m] * Math.abs(kcalDeMacro(objetivo, m) - kcalDeMacro(puesto, m)), 0));
}

/**
 * La mejor escala de MENU_SCALES para acercar la receta al objetivo. Null si ni
 * a su ración máxima se acerca lo bastante (le faltan más kcal de las que puede
 * cerrar el comodín) o si a media ración ya se pasa: lo que sobra no lo quita
 * nadie. Las recetas base vinculadas (N-06) se ajustan ingrediente a
 * ingrediente en vez de escalarse.
 */
export function bestScaleFit(
  recipe: Recipe, target: Macros, mode: DietMode = 'OMNIVORO',
): { scale: number; macros: Macros; score: number; ajuste?: AjusteDeReceta } | null {
  if (target.kcal <= 0) return null;
  const vinculados = recipe.vinculo?.ingredientes;
  if (sePuedeAjustar(vinculados)) {
    const r = ajustarReceta(vinculados, { p: target.p, hc: target.hc, g: target.g }, (recipe.ingredientsText ?? []).map(i => i.name));
    if (!r.encaja) return null;
    const macros: Macros = { kcal: r.total.kcal, p: r.total.p, hc: r.total.hc, g: r.total.g };
    return { scale: 1, macros, score: errorPonderado(target, macros), ajuste: { gramos: r.gramos, cambios: r.cambios } };
  }
  const base = macrosBaseDeReceta(recipe, mode);
  if (!base) return null;
  const ideal = target.kcal / base.kcal;
  if (ideal < MENU_SCALES[0]) return null;
  const maxima = MENU_SCALES[MENU_SCALES.length - 1];
  if (ideal > maxima && base.kcal * maxima < target.kcal - MARGEN_COMODIN_KCAL) return null;

  const pesos = pesosPorMacro(target);
  let mejor: { scale: number; macros: Macros; score: number } | null = null;
  for (const scale of MENU_SCALES) {
    const macros = redondearMacros(escalarMacros(base, scale));
    const score = errorPonderado(target, macros, pesos);
    if (!mejor || score < mejor.score) mejor = { scale, macros, score };
  }
  return mejor;
}

export interface RankOptions {
  /** Días a los que sirve la elección: una receta escondida en cualquiera de ellos no sale. */
  dias?: WeekDay[];
  /** Para qué se elige: por defecto el menú generado; los cambios de comida pasan `cambios`. */
  ambito?: AmbitoDeRegla;
  /** Dieta del día: decide qué filtros de `prefs.seleccion` mandan. */
  dietId?: string | null;
  needsTupper?: boolean;
  /** Se está eligiendo para cocinar una vez y comer durante la semana. Distinto
   *  de `needsTupper`, que solo dice que ESA comida se la lleva de casa: aquí
   *  TODO se cocina por adelantado, así que un plato que solo esté bueno recién
   *  hecho es mala elección aunque encaje de kcal. */
  batch?: boolean;
  mode?: DietMode;
  // Dish types already placed (per day and/or week) with how many times — used to
  // penalize serving the same *kind* of meal repeatedly (the "always a batido" fix).
  usedDishTypes?: ReadonlyMap<DishType, number>;
}

// Filtros duros (nunca salen): alergias, condiciones de salud, tipo de dieta,
// tiempo de cocina, recetas «no me gusta», tipos de plato excluidos y los
// ALIMENTOS «no me gusta» (con reserva si dejaran la franja sin recetas).
// Señales blandas (solo ordenan, dentro de la banda de buen encaje):
// favoritas, tipos de plato preferidos, alimentos que le gustan, tupper,
// repetición de receta y de tipo de plato.
export function rankCandidates(
  pool: Recipe[],
  target: Macros,
  prefs: GeneratorPrefs,
  usedIds: ReadonlySet<string>,
  opts: RankOptions = {},
): MenuCandidate[] {
  const mode = opts.mode ?? 'OMNIVORO';
  const disliked = new Set(prefs.dislikedRecipeIds ?? []);
  const favorites = new Set(prefs.favoriteRecipeIds ?? []);
  const excludedDish = new Set(prefs.excludedDishTypes ?? []);
  const preferredDish = new Set(prefs.preferredDishTypes ?? []);

  const ocultasPorElCoach = recetasOcultas(prefs.recetasOcultas, opts.ambito ?? 'menu', opts.dias);
  const { pool: delaLista, conTiempo } = aplicarSeleccion(pool, prefs, { dietId: opts.dietId, dias: opts.dias, ambito: opts.ambito });
  const permitidas = delaLista.filter(r =>
    !disliked.has(r.id) &&
    !ocultasPorElCoach.has(r.id) &&
    !excludedDish.has(dishType(r)) &&
    !prefs.allergies.some(f => ingredientMatch(r, f)) &&
    !violatesHealthConditions(r, prefs.conditions) &&
    !violatesDietType(r, prefs.dietType) &&
    !superaElTiempo(r, conTiempo ? undefined : prefs.cookingMaxTime),
  );
  // Los alimentos «no me gusta» se EXCLUYEN; solo si dejaran la franja casi
  // vacía se vuelven a admitir, al final de la lista.
  const sinNoDeseados = permitidas.filter(r => !prefs.disliked.some(f => ingredientMatch(r, f)));
  const safe = sinNoDeseados.length >= MIN_RECETAS_PARA_EXCLUIR ? sinNoDeseados : permitidas;

  // Primero el encaje puro de cada receta, sin preferencias: una receta que ni
  // a su ración máxima llega queda eliminada (no se estira el comodín).
  type ConEncaje = { recipe: Recipe; fit: NonNullable<ReturnType<typeof bestScaleFit>> };
  const conEncaje: ConEncaje[] = safe
    .map(recipe => ({ recipe, fit: bestScaleFit(recipe, target, mode) }))
    .filter((c): c is ConEncaje => c.fit != null);
  if (conEncaje.length === 0) return [];

  // La banda se mide desde la mejor receta AÚN NO USADA: si se midiera desde
  // una ya servida (p. ej. una receta base que se ajusta y clava el objetivo),
  // todo lo demás quedaría fuera de banda y la repetida ganaría siempre pese a
  // su castigo.
  const frescas = conEncaje.filter(c => !usedIds.has(c.recipe.id));
  const mejorEncaje = Math.min(...(frescas.length > 0 ? frescas : conEncaje).map(c => c.fit.score));
  const limite = mejorEncaje + Math.max(BANDA_MINIMA_KCAL, target.kcal * BANDA_PCT);

  const scored: MenuCandidate[] = [];
  for (const { recipe, fit } of conEncaje) {
    let score = fit.score;
    const dt = dishType(recipe);
    if (favorites.has(recipe.id)) score -= BONO_FAVORITA;
    if (preferredDish.has(dt)) score -= BONO_TIPO_PREFERIDO;
    if (prefs.disliked.some(f => ingredientMatch(recipe, f))) score += CASTIGO_NO_GUSTA;
    if (prefs.liked.some(f => ingredientMatch(recipe, f))) score -= BONO_GUSTA;
    if (opts.needsTupper && recipe.tupper) score -= BONO_TUPPER;
    if (prefs.quiereRapidas && !conTiempo && recipe.basica) score -= BONO_RAPIDAS;
    if (opts.batch && !recipe.tupper) score += CASTIGO_BATCH_SIN_TUPPER;
    if (usedIds.has(recipe.id)) score += CASTIGO_REPETIDA;
    const dishReuse = opts.usedDishTypes?.get(dt) ?? 0;
    if (dishReuse > 0) score += CASTIGO_TIPO_REPETIDO * dishReuse;
    if (fit.score > limite) score += FUERA_DE_BANDA;
    scored.push({ recipe, scale: fit.scale, macros: fit.macros, score, ...(fit.ajuste ? { ajuste: fit.ajuste } : {}) });
  }
  return scored.sort((a, b) => a.score - b.score);
}

// ─── Raciones y acompañamientos ──────────────────────────────────────────────

/** A qué macro se imputa un alimento de esa categoría (los mixtos, a la suya). */
function macroDe(category: FoodCategory): Macro {
  if (category === 'HC' || category === 'MIX_HC') return 'hc';
  if (category === 'GRASA' || category === 'MIX_GRASA') return 'g';
  return 'p';
}

/** ¿Un alimento de `origen` aporta a la macro `destino`? */
function aportaA(origen: FoodCategory, destino: Macro): boolean {
  return macrosDeRaciones(origen, 1)[destino] > 0;
}

/** Cuántas raciones de esa categoría caben en el hueco, contando TODO lo que
 *  aporta (un mixto arrastra proteína). A la baja, en pasos de 0,25: pasarse es
 *  peor que quedarse corto, lo que sobra no lo quita nadie. */
function cabenRaciones(category: FoodCategory, hueco: Macros): number {
  const una = macrosDeRaciones(category, 1);
  let tope = Infinity;
  for (const m of MACROS) if (una[m] > 0) tope = Math.min(tope, hueco[m] / una[m]);
  if (!Number.isFinite(tope)) return 0;
  return Math.max(0, Math.floor(tope / PASO_RACION + 1e-9) * PASO_RACION);
}

// Cierra lo que falta (nunca recorta un exceso) con alimentos sencillos del
// banco, en raciones de 0,25. Se llena un alimento hasta 2 raciones antes de
// pasar a otro, y el orden es fijo (mismo menú, mismos extras).
export function fillComplements(
  gap: Macros, foods: MealItem[], mode: DietMode, conditions?: readonly number[],
): MenuComplement[] {
  const simple = simpleComplementsFor(foods, conditions).filter(f => f.mode === mode);
  const result: MenuComplement[] = [];
  let hueco = sinNegativos(gap);
  const CAT_DE: Record<Macro, 'HC' | 'PROT' | 'GRASA'> = { hc: 'HC', p: 'PROT', g: 'GRASA' };
  for (const m of MACROS) {
    const candidates = simple.filter(f => encajaEnCategoria(f, CAT_DE[m]));
    if (candidates.length === 0) continue;
    const usados = new Set<string>();
    for (let n = 0; n < MAX_COMPLEMENTOS_POR_MACRO; n++) {
      const frescos = candidates.filter(f => !usados.has(f.label));
      const food = frescos.length > 0 ? frescos[0] : candidates[n % candidates.length];
      // Lo que cabe de ese alimento SIN pasarse en ninguna macro…
      const caben = cabenRaciones(food.category, hueco);
      // …acotado a lo que de verdad falta de la macro que se está cerrando.
      const faltan = Math.floor((hueco[m] / macrosDeRaciones(food.category, 1)[m]) / PASO_RACION + 1e-9) * PASO_RACION;
      const qty = Math.min(MAX_RACIONES_POR_COMPLEMENTO, caben, faltan);
      if (qty < MIN_COMPLEMENTO) break;
      usados.add(food.label);
      result.push({ foodLabel: food.label, category: food.category, quantity: round2(qty) });
      hueco = sinNegativos(restarMacros(hueco, macrosDeRaciones(food.category, qty)));
    }
  }
  return result;
}

/** ¿El día sale sin acompañamientos porque la semana ya va sobrada? Lo que
 *  manda es el balance de la SEMANA (Dani, 07-09-2026). */
export function sinExtrasPorLaSemana(balanceSemanaKcal: number): boolean {
  return balanceSemanaKcal > MARGEN_SEMANA_KCAL;
}

/** Lo que un día lleva de más (+) o de menos (−) respecto a su objetivo, en kcal. */
export function desviacionDelDia(dia: MenuDay): number {
  return Math.round(macrosDelDiaDeMenu(dia).kcal - objetivoDelDiaDeMenu(dia).kcal);
}

function recetasDe(pools: Record<number, Recipe[]>): Map<string, Recipe> {
  const m = new Map<string, Recipe>();
  for (const lista of Object.values(pools)) for (const r of lista) m.set(r.id, r);
  return m;
}

/* Antes que colgarle un alimento suelto al plato, se mira si la receta ya lleva
   algo de esa macro que se pueda servir en más cantidad: al arroz con pollo al
   que le faltan hidratos se le echa más arroz, no dos tostadas. Los mixtos
   (legumbre, tofu) entran mientras su arrastre de proteína quepa. */
function subirRaciones(
  receta: Recipe | null,
  hueco: Macros,
  foods: MealItem[],
  mode: DietMode,
): { raciones: MenuRacionExtra[]; restante: Macros } {
  let restante = sinNegativos(hueco);
  const raciones: MenuRacionExtra[] = [];
  if (!receta) return { raciones, restante };
  const candidatos = ingredientesEscalables(receta.ingredientsText, foods, mode);
  if (candidatos.length === 0) return { raciones, restante };

  for (const m of MACROS) {
    if (raciones.length >= MAX_RACIONES_EXTRA_POR_COMIDA) break;
    const ing = candidatos.find(c => !raciones.some(r => r.ingrediente === c.nombreEnReceta) && aportaA(c.category, m) && macroDe(c.category) === m)
      ?? candidatos.find(c => !raciones.some(r => r.ingrediente === c.nombreEnReceta) && aportaA(c.category, m));
    if (!ing) continue;
    const cantidad = cabenRaciones(ing.category, restante);
    if (cantidad < MIN_RACION_EXTRA) continue;
    raciones.push({
      ingrediente: ing.nombreEnReceta,
      nombre: ing.nombre,
      category: ing.category,
      quantity: cantidad,
      gramos: Math.round(ing.gramosPorIntercambio * cantidad),
    });
    restante = sinNegativos(restarMacros(restante, macrosDeRaciones(ing.category, cantidad)));
  }
  return { raciones, restante };
}

/** El comodín, acotado: como mucho dos piezas y 300 kcal entre todas. Lo que
 *  no quepa NO se tapa: ese plato no era el adecuado para esa comida. */
function acotarAcompanamientos(propuestos: MenuComplement[]): MenuComplement[] {
  const out: MenuComplement[] = [];
  let kcal = 0;
  for (const c of propuestos) {
    if (out.length >= MAX_ACOMPANAMIENTOS_POR_COMIDA) break;
    const porRacion = macrosDeRaciones(c.category, 1).kcal;
    const cabe = Math.floor(Math.min(c.quantity, (MAX_KCAL_ACOMPANAMIENTOS - kcal) / porRacion) / PASO_RACION + 1e-9) * PASO_RACION;
    if (cabe < PASO_RACION) break;
    out.push(cabe === c.quantity ? c : { ...c, quantity: round2(cabe) });
    kcal += porRacion * cabe;
  }
  return out;
}

/** Lo que le falta a UNA comida para llegar a su objetivo (nunca negativo). */
function huecoDeComida(meal: MenuMeal, objetivo: Macros): Macros {
  return sinNegativos(restarMacros(objetivo, macrosDeLaComida(meal)));
}

/** kcal de la comida: las de la receta y las de sus extras. */
function kcalDeLaComida(meal: MenuMeal): number {
  return Math.round(macrosDeLaComida(meal).kcal);
}

/** Los campos en intercambios que siguen leyendo los binarios viejos. */
function intercambiosDe(m: Macros) {
  const v = intercambiosDeMacros(m);
  return { HC: v.HC, PROT: v.PROT, GRASA: v.GRASA };
}

// ─── Día ─────────────────────────────────────────────────────────────────────

function emptyMeal(id: string, slot: MealSlotSpec): MenuMeal {
  return {
    id, slot: slot.slot, name: slot.name, recipeId: '', recipeName: 'Sin receta disponible', scale: 1,
    exch: { HC: 0, PROT: 0, GRASA: 0 }, macros: { ...VACIO }, kcal: 0, complements: [],
  };
}

function buildMeal(id: string, slot: MealSlotSpec, recipe: Recipe, scale: number, macros: Macros, ajuste?: AjusteDeReceta): MenuMeal {
  const meal: MenuMeal = {
    id, slot: slot.slot, name: slot.name,
    recipeId: recipe.id, recipeName: recipe.name,
    recipeImage: fotoDeReceta(recipe),
    scale, macros, exch: intercambiosDe(macros), kcal: 0, complements: [],
    ...(ajuste ? { ajuste } : {}),
  };
  meal.kcal = kcalDeLaComida(meal);
  return meal;
}

function diaVacio(day: WeekDay): MenuDay {
  return { day, dietId: null, target: { HC: 0, PROT: 0, GRASA: 0 }, objetivo: { ...VACIO }, meals: [] };
}

// Cierre común de la generación: reparte lo que le falta al DÍA entre las
// comidas que se han quedado cortas (en proporción a lo cortas que estén),
// primero como más ración de la propia receta y luego como acompañamiento.
function finalizeDay(
  day: WeekDay, diet: Diet, target: Macros, targets: Macros[],
  meals: MenuMeal[], foods: MealItem[], mode: DietMode,
  recetasPorId?: Map<string, Recipe>,
  conditions?: readonly number[],
  balanceSemanaKcal = 0,
): MenuDay {
  const puesto = sumarMacros(...meals.map(macrosDeLaComida));
  const restanteDelDia = sinNegativos(restarMacros(target, puesto));
  const huecos = meals.map((meal, i) => (targets[i] ? huecoDeComida(meal, targets[i]) : { ...VACIO }));
  const reparto: { p: number; hc: number; g: number }[] = meals.map(() => ({ p: 0, hc: 0, g: 0 }));
  for (const m of MACROS) {
    const pesos = huecos.map(h => h[m]);
    if (pesos.reduce((s, v) => s + v, 0) <= 0) continue;
    repartirGramos(restanteDelDia[m], pesos).forEach((v, i) => { reparto[i][m] = v; });
  }

  meals.forEach((meal, i) => {
    // Lo que esta comida debería sumar: su plato más lo que el día le asigna.
    // Se guarda porque es el tope de los extras (`topeDeExtra`).
    const objetivoComida = redondearMacros(sumarMacros(macrosDeLaComida(meal), conKcal(reparto[i])));
    meal.objetivoMacros = objetivoComida;
    meal.objetivo = intercambiosDe(objetivoComida);
    const receta = recetasPorId?.get(meal.recipeId) ?? null;
    const { raciones, restante } = subirRaciones(receta, conKcal(reparto[i]), foods, mode);
    if (raciones.length > 0) meal.racionesExtra = raciones;
    if (!sinExtrasPorLaSemana(balanceSemanaKcal)) {
      meal.complements.push(...acotarAcompanamientos(fillComplements(restante, foods, mode, conditions)));
    }
  });
  for (const meal of meals) meal.kcal = kcalDeLaComida(meal);
  return { day, dietId: diet.id, dietName: diet.name, target: intercambiosDe(target), objetivo: redondearMacros(target), meals };
}

export interface ReajustarDiaArgs {
  dia: MenuDay;
  diet: Diet;
  slots: MealSlotSpec[];
  foods: MealItem[];
  mode?: DietMode;
  recetasPorId?: Map<string, Recipe>;
  conditions?: readonly number[];
}

/**
 * Vuelve a cuadrar un día cuyos platos han cambiado (el coach pulsó «otra
 * receta»): no vuelve a elegir recetas, solo rehace raciones extra y
 * acompañamientos contra el objetivo del día, con el mismo cierre que la
 * generación. Sin balance de semana: es un día suelto tocado a mano.
 */
export function reajustarDia(args: ReajustarDiaArgs): MenuDay {
  const { dia, diet, slots, foods, recetasPorId, conditions } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const target = objetivoDeDieta(diet);
  const targets = slotTargets(target, slots);
  const meals: MenuMeal[] = dia.meals.map(m => ({
    ...m,
    macros: macrosDelPlato(m),
    racionesExtra: undefined,
    complements: [],
  }));
  return finalizeDay(dia.day, diet, target, targets, meals, foods, mode, recetasPorId, conditions);
}

export interface GenerateDayArgs {
  day: WeekDay;
  diet: Diet | null; // null = día libre, sin comidas
  slots: MealSlotSpec[];
  pools: Record<number, Recipe[]>; // recetas candidatas por franja (intakeType)
  foods: MealItem[];
  prefs: GeneratorPrefs;
  usedIds: Set<string>; // se muta: variedad de recetas entre días
  usedDishTypes?: Map<DishType, number>; // se muta: variedad de tipos de plato
  mode?: DietMode;
  /** kcal de más (+) o de menos (−) de los días ya generados de la semana. */
  balanceSemana?: number;
}

function bumpDishType(map: Map<DishType, number>, dt: DishType): void {
  map.set(dt, (map.get(dt) ?? 0) + 1);
}

export function generateDay(args: GenerateDayArgs): MenuDay {
  const { day, diet, slots, pools, foods, prefs, usedIds } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const dishTypes = args.usedDishTypes ?? new Map<DishType, number>();
  if (!diet) return diaVacio(day);

  const target = objetivoDeDieta(diet);
  const targets = slotTargets(target, slots);

  // Franja a franja, recalculando lo que QUEDA del día: el pico que deja una
  // comida (la escala va de 0,25 en 0,25) lo absorbe la siguiente en vez de
  // sumarse. Nunca por debajo de cero.
  let restante: Macros = { ...target };
  const meals: MenuMeal[] = slots.map((slot, i) => {
    const disponible = sinNegativos(restante);
    const objetivoFranja = slotTargets(conKcal(disponible), slots.slice(i))[0] ?? targets[i];
    const ranked = rankCandidates(pools[slot.slot] ?? [], objetivoFranja, prefs, usedIds, {
      needsTupper: slot.needsTupper, mode, usedDishTypes: dishTypes, dias: [day], dietId: diet.id,
    });
    const pick = ranked[0];
    const id = `${day}_m${i + 1}`;
    if (!pick) return emptyMeal(id, slot);
    usedIds.add(pick.recipe.id);
    bumpDishType(dishTypes, dishType(pick.recipe));
    restante = restarMacros(restante, pick.macros);
    return buildMeal(id, slot, pick.recipe, pick.scale, pick.macros, pick.ajuste);
  });

  return finalizeDay(day, diet, target, targets, meals, foods, mode, recetasDe(pools), prefs.conditions, args.balanceSemana ?? 0);
}

// ─── Semana ──────────────────────────────────────────────────────────────────

export interface GenerateWeekArgs {
  schedule: Partial<Record<WeekDay, string | null>>;
  diets: Diet[];
  slots: MealSlotSpec[];
  pools: Record<number, Recipe[]>;
  foods: MealItem[];
  prefs: GeneratorPrefs;
  mode?: DietMode;
  batch?: boolean; // batch cooking: una receta por franja para toda la semana
}

function media(vs: Macros[]): Macros {
  if (vs.length === 0) return { ...VACIO };
  return escalarMacros(sumarMacros(...vs), 1 / vs.length);
}

// Batch cooking: UNA receta por franja para toda la semana (elegida contra la
// media de los objetivos de esa franja), re-escalada cada día. Si un día no
// llega con ella, ese día lleva otra para esa franja.
function generateWeekBatch(args: GenerateWeekArgs): MenuDay[] {
  const { schedule, diets, slots, pools, foods, prefs } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const dietsById = new Map(diets.map(d => [d.id, d]));
  const scheduledDiets = WEEK_DAYS
    .map(day => (schedule[day] ? dietsById.get(schedule[day]!) ?? null : null))
    .filter((d): d is Diet => d != null);
  const diasDeLaTanda = WEEK_DAYS.filter(d => !!schedule[d]);
  const idsDeLaTanda = new Set(scheduledDiets.map(d => d.id));
  const dietaDeLaTanda = idsDeLaTanda.size === 1 ? [...idsDeLaTanda][0] : null;

  const usedAcrossSlots = new Set<string>();
  const slotRecipe: (Recipe | null)[] = slots.map((slot, i) => {
    const repTarget = media(scheduledDiets.map(d => slotTargets(objetivoDeDieta(d), slots)[i]));
    const ranked = rankCandidates(pools[slot.slot] ?? [], repTarget, prefs, usedAcrossSlots, { needsTupper: slot.needsTupper, batch: true, mode, dias: diasDeLaTanda, dietId: dietaDeLaTanda });
    const pick = ranked[0]?.recipe ?? null;
    if (pick) usedAcrossSlots.add(pick.id);
    return pick;
  });

  let balanceSemana = 0;
  return WEEK_DAYS.map(day => {
    const dietId = schedule[day] ?? null;
    const diet = dietId ? dietsById.get(dietId) ?? null : null;
    if (!diet) return diaVacio(day);
    const target = objetivoDeDieta(diet);
    const targets = slotTargets(target, slots);
    const meals: MenuMeal[] = slots.map((slot, i) => {
      const id = `${day}_m${i + 1}`;
      const fixed = slotRecipe[i];
      if (fixed) {
        const fit = bestScaleFit(fixed, targets[i], mode);
        if (fit) return buildMeal(id, slot, fixed, fit.scale, fit.macros, fit.ajuste);
      }
      const ranked = rankCandidates(pools[slot.slot] ?? [], targets[i], prefs, new Set(), { needsTupper: slot.needsTupper, batch: true, mode, dias: [day], dietId: diet.id });
      const pick = ranked[0];
      return pick ? buildMeal(id, slot, pick.recipe, pick.scale, pick.macros, pick.ajuste) : emptyMeal(id, slot);
    });
    const generado = finalizeDay(day, diet, target, targets, meals, foods, mode, recetasDe(pools), prefs.conditions, balanceSemana);
    balanceSemana += desviacionDelDia(generado);
    return generado;
  });
}

// Variedad (prefs.variety):
//  1-2  monótono  — un día por dieta, clonado a todos los días con esa dieta.
//  3    equilibrado — sin repetir receta dentro de la misma dieta.
//  4-5  máxima    — sin repetir receta en toda la semana.
// args.batch manda sobre la variedad (ver generateWeekBatch).
export function generateWeek(args: GenerateWeekArgs): MenuDay[] {
  if (args.batch) return generateWeekBatch(args);
  const { schedule, diets, slots, pools, foods, prefs } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const dietsById = new Map(diets.map(d => [d.id, d]));
  const globalUsed = new Set<string>();
  const perDietUsed = new Map<string, Set<string>>();
  const perDietTemplate = new Map<string, MenuDay>();
  const globalDishTypes = new Map<DishType, number>();
  const perDietDishTypes = new Map<string, Map<DishType, number>>();

  // El balance de la semana decide si un día lleva acompañamientos.
  let balanceSemana = 0;
  const conBalance = (dia: MenuDay): MenuDay => { balanceSemana += desviacionDelDia(dia); return dia; };

  return WEEK_DAYS.map(day => {
    const dietId = schedule[day] ?? null;
    const diet = dietId ? dietsById.get(dietId) ?? null : null;
    if (!diet) return diaVacio(day);
    if (prefs.variety <= 2) {
      const template = perDietTemplate.get(diet.id);
      if (template) {
        return conBalance({ ...template, day, meals: template.meals.map((m, i) => ({ ...m, id: `${day}_m${i + 1}` })) });
      }
      const generated = conBalance(generateDay({ day, diet, slots, pools, foods, prefs, usedIds: new Set(), mode, balanceSemana }));
      perDietTemplate.set(diet.id, generated);
      return generated;
    }
    if (prefs.variety === 3) {
      const usedIds = perDietUsed.get(diet.id) ?? new Set<string>();
      perDietUsed.set(diet.id, usedIds);
      const usedDishTypes = perDietDishTypes.get(diet.id) ?? new Map<DishType, number>();
      perDietDishTypes.set(diet.id, usedDishTypes);
      return conBalance(generateDay({ day, diet, slots, pools, foods, prefs, usedIds, usedDishTypes, mode, balanceSemana }));
    }
    return conBalance(generateDay({ day, diet, slots, pools, foods, prefs, usedIds: globalUsed, usedDishTypes: globalDishTypes, mode, balanceSemana }));
  });
}

// ─── Tolerancia ──────────────────────────────────────────────────────────────

/** kcal de más (+) o de menos (−) del día. */
export function dayGlobalDeviation(day: MenuDay): number {
  return desviacionDelDia(day);
}

/** ¿El día está cuadrado? El total a ±100 kcal y cada macro a ±100 kcal (o
 *  ±20 % de lo que pide esa macro, lo que sea mayor). */
export function isDayWithinTolerance(day: MenuDay): boolean {
  if (day.meals.length === 0) return true;
  const objetivo = objetivoDelDiaDeMenu(day);
  const puesto = macrosDelDiaDeMenu(day);
  if (Math.abs(puesto.kcal - objetivo.kcal) > TOLERANCIA_DIA_KCAL) return false;
  return MACROS.every(m => Math.abs(kcalDeMacro(puesto, m) - kcalDeMacro(objetivo, m))
    <= Math.max(TOLERANCIA_MACRO_KCAL, kcalDeMacro(objetivo, m) * TOLERANCIA_MACRO_PCT));
}

// ─── Cambiar un plato (atleta) ───────────────────────────────────────────────

export type SwapFit = 'exacto' | 'aproximado';

export interface SwapCandidate extends MenuCandidate {
  fit: SwapFit;
  /** Raciones extra que le tocan a ESTA receta si se acepta el cambio. */
  raciones: MenuRacionExtra[];
  /** Cómo quedaría el día (puesto − objetivo), en kcal y gramos. */
  drift: Macros;
  /** Lo mismo en kcal totales. */
  driftTotal: number;
}

// Hasta dónde puede moverse el DÍA al aceptar un cambio: el total y cada macro.
const SWAP_TOTAL_EXACTO_KCAL = 100;
const SWAP_TOTAL_APROX_KCAL = 200;
const SWAP_MACRO_MIN_EXACTO_KCAL = 100;
const SWAP_MACRO_MIN_APROX_KCAL = 150;
const SWAP_MACRO_PCT_EXACTO = 0.15;
const SWAP_MACRO_PCT_APROX = 0.25;

/**
 * Alternativas para el PLATO de una comida que, aceptadas, no dejan el día peor
 * de lo que ya estaba (por signo, en el total y en cada macro). Los
 * acompañamientos se quedan; las raciones extra van con el plato, así que la
 * receta nueva recibe las suyas. Todas las que encajan, en dos niveles
 * ('exacto' / 'aproximado') y repartidas por tipo de plato en ronda.
 */
export function findSwapAlternatives(
  day: MenuDay,
  mealId: string,
  pool: Recipe[],
  prefs: GeneratorPrefs,
  count = Infinity,
  mode: DietMode = 'OMNIVORO',
  foods: MealItem[] = [],
): SwapCandidate[] {
  const meal = day.meals.find(m => m.id === mealId);
  if (!meal) return [];
  const objetivoDia = objetivoDelDiaDeMenu(day);
  const plato = macrosDelPlato(meal);
  const acompanamientos = macrosDeAcompanamientos(meal.complements);
  const objetivoDeLaComidaAhora = macrosDeLaComida(meal);
  const otras = sumarMacros(acompanamientos, ...day.meals.filter(m => m.id !== mealId).map(macrosDeLaComida));
  // Una comida sin plato apunta a lo que le falta al día, no a cero.
  const platoVacio = !meal.recipeId || plato.kcal < 25;
  const objetivoPlato = platoVacio ? conKcal(sinNegativos(restarMacros(objetivoDia, otras))) : plato;
  const usedIds = new Set(day.meals.filter(m => m.id !== mealId).map(m => m.recipeId));

  // Cómo está el día AHORA: un cambio no puede dejarlo peor de lo que ya estaba.
  const actual = macrosDelDiaDeMenu(day);
  const desvio = restarMacros(actual, objetivoDia);
  const tol = (min: number, pct: number) => Object.fromEntries(MACROS.map(m => [m, Math.max(min, kcalDeMacro(objetivoDia, m) * pct)])) as Record<Macro, number>;
  const tolExacto = tol(SWAP_MACRO_MIN_EXACTO_KCAL, SWAP_MACRO_PCT_EXACTO);
  const tolAprox = tol(SWAP_MACRO_MIN_APROX_KCAL, SWAP_MACRO_PCT_APROX);
  const exceso = (valor: number, yaHabia: number): number =>
    valor >= 0 ? Math.max(0, valor - Math.max(0, yaHabia)) : Math.max(0, -valor - Math.max(0, -yaHabia));

  const graded: SwapCandidate[] = [];
  for (const c of rankCandidates(pool, objetivoPlato, prefs, usedIds, { mode, dias: [day.day], ambito: 'cambios', dietId: day.dietId })) {
    const hueco = sinNegativos(restarMacros(objetivoDeLaComidaAhora, sumarMacros(c.macros, acompanamientos)));
    const { raciones } = subirRaciones(c.recipe, hueco, foods, mode);
    const aporta = sumarMacros(c.macros, macrosDeRacionesExtra(raciones));
    const drift = redondearMacros(restarMacros(sumarMacros(otras, aporta), objetivoDia));
    const driftTotal = Math.round(drift.kcal);
    const dentro = (topeTotal: number, topeMacro: Record<Macro, number>) =>
      exceso(driftTotal, desvio.kcal) <= topeTotal
      && MACROS.every(m => exceso(kcalDeMacro(drift, m), kcalDeMacro(desvio, m)) <= topeMacro[m]);
    if (dentro(SWAP_TOTAL_EXACTO_KCAL, tolExacto)) graded.push({ ...c, fit: 'exacto', drift, driftTotal, raciones });
    else if (dentro(SWAP_TOTAL_APROX_KCAL, tolAprox)) graded.push({ ...c, fit: 'aproximado', drift, driftTotal, raciones });
  }

  const porRondas = (cands: SwapCandidate[]): SwapCandidate[] => {
    const groups = new Map<DishType, SwapCandidate[]>();
    for (const c of cands) {
      const dt = dishType(c.recipe);
      const g = groups.get(dt);
      if (g) g.push(c); else groups.set(dt, [c]);
    }
    const queues = [...groups.values()].sort((a, b) => a[0].score - b[0].score);
    const out: SwapCandidate[] = [];
    let anyLeft = true;
    for (let round = 0; anyLeft; round++) {
      anyLeft = false;
      for (const q of queues) {
        if (round >= q.length) continue;
        anyLeft = true;
        out.push(q[round]);
      }
    }
    return out;
  };
  const ordenadas = [
    ...porRondas(graded.filter(c => c.fit === 'exacto')),
    ...porRondas(graded.filter(c => c.fit === 'aproximado')),
  ];
  return count === Infinity ? ordenadas : ordenadas.slice(0, count);
}

// ─── Batch-cooking plan ──────────────────────────────────────────────────────

export interface BatchRecipeEntry {
  recipeId: string;
  recipeName: string;
  recipeImage?: string;
  totalScale: number;   // sum of scales across the week (≈ servings to cook)
  servings: number;     // totalScale rounded to a whole number of portions
  occurrences: { day: WeekDay; mealName: string; scale: number }[];
}

// Consolidated "cook once for the week" view: groups every meal of the week by
// recipe and sums how much of each you need to prep. Works on any menu (even
// non-batch), but it's most useful — and shortest — for batch-generated ones.
export function buildBatchPlan(days: MenuDay[]): BatchRecipeEntry[] {
  const byRecipe = new Map<string, BatchRecipeEntry>();
  for (const day of days) {
    for (const meal of day.meals) {
      if (!meal.recipeId) continue;
      const entry = byRecipe.get(meal.recipeId) ?? {
        recipeId: meal.recipeId, recipeName: meal.recipeName, recipeImage: meal.recipeImage,
        totalScale: 0, servings: 0, occurrences: [],
      };
      entry.totalScale = round2(entry.totalScale + meal.scale);
      entry.occurrences.push({ day: day.day, mealName: meal.name, scale: meal.scale });
      byRecipe.set(meal.recipeId, entry);
    }
  }
  const list = Array.from(byRecipe.values());
  // Hacia arriba, no al más cercano: esto es cuánto hay que COCINAR el domingo.
  // Redondeando a la baja, una semana que suma 2,25 raciones decía «cocina 2» y
  // el atleta se quedaba sin comida el último día — que es justo el día en que
  // se abandona el menú. Pasarse sobran las sobras; quedarse corto rompe el plan.
  for (const e of list) e.servings = Math.max(1, Math.ceil(e.totalScale));
  return list.sort((a, b) => b.totalScale - a.totalScale);
}

// ─── Menú desactualizado ─────────────────────────────────────────────────────

/**
 * ¿Ha cambiado algo desde que se generó? El calendario (otra dieta ese día) o
 * el objetivo de la dieta. Se compara contra la dieta CON los ajustes de la
 * semana del menú (`program` + `menu.semanaPrograma`): el menú se generó así, y
 * comparar con la dieta pelada lo marcaba «desactualizado» en cualquier semana
 * con ajustes aunque no hubiera cambiado nada.
 */
export function isMenuStale(
  menu: { days: MenuDay[]; semanaPrograma?: number },
  schedule: Partial<Record<WeekDay, string | null>>,
  diets: Diet[],
  program?: NutritionProgram | null,
): boolean {
  const dietsById = new Map(diets.map(d => [d.id, d]));
  const semana = menu.semanaPrograma ?? (program ? semanaDelPrograma(program, hoyIsoLocal()) : undefined);
  const mantenimiento = program && semana != null ? (program.semanasMantenimiento ?? []).includes(semana) : false;
  const ajustes = program && semana != null ? ajustesDeLaSemana(program, semana) : [];
  for (const day of menu.days) {
    const currentDietId = schedule[day.day] ?? null;
    if (currentDietId !== day.dietId) return true;
    if (!currentDietId) continue;
    const diet = dietsById.get(currentDietId);
    if (!diet) return true;
    const ahora = objetivoDeDieta(ajustes.length > 0 || mantenimiento ? aplicarAjustes(diet, ajustes, { mantenimiento }) : diet);
    const entonces = objetivoDelDiaDeMenu(day);
    if (MACROS.some(m => Math.abs(ahora[m] - entonces[m]) > 1)) return true;
  }
  return false;
}

// ─── Tope de extras ──────────────────────────────────────────────────────────

/* El extra RELLENA lo que falta, no añade por encima (Dani, auditoría §6). El
 * tope sale del objetivo de la comida guardado al generar; en menús anteriores
 * a 09-2026 no hay y NO se recorta (clampar sobre una suposición se comería
 * extras legítimos). */

/** Cuántas raciones de `category` caben todavía como extra en esta comida.
 *  `Infinity` si la comida no trae objetivo guardado. `excluirComplemento` es el
 *  índice del extra que se está midiendo (que no cuente contra sí mismo). */
export function topeDeExtra(
  meal: MenuMeal,
  category: FoodCategory,
  excluirComplemento?: number,
): number {
  const objetivo = objetivoDeLaComida(meal);
  if (!objetivo) return Infinity;
  const sinEse: MenuMeal = excluirComplemento == null ? meal : {
    ...meal,
    complements: meal.complements.filter((_, i) => i !== excluirComplemento),
  };
  return cabenRaciones(category, huecoDeComida(sinEse, objetivo));
}

/**
 * Recorta los extras de una comida a lo que de verdad cabe. Pura e idempotente:
 * una comida que ya cabe se devuelve TAL CUAL (misma referencia). Se aplica al
 * escribir el menú (`updateWeeklyMenu`), el único paso por el que pasan todas
 * las ediciones del atleta y del coach.
 */
export function acotarExtrasDeComida(meal: MenuMeal): { meal: MenuMeal; recortado: boolean } {
  const objetivo = objetivoDeLaComida(meal);
  if (!objetivo) return { meal, recortado: false };
  let recortado = false;
  let acumulado: MenuMeal = { ...meal, complements: [], racionesExtra: [] };

  const raciones: MenuRacionExtra[] = [];
  for (const r of meal.racionesExtra ?? []) {
    const cabe = Math.min(r.quantity, cabenRaciones(r.category, huecoDeComida(acumulado, objetivo)));
    if (cabe < PASO_RACION) { recortado = true; continue; }
    const ajustada = cabe === r.quantity ? r
      : { ...r, quantity: round2(cabe), gramos: Math.round((r.gramos / r.quantity) * cabe) };
    if (ajustada !== r) recortado = true;
    raciones.push(ajustada);
    acumulado = { ...acumulado, racionesExtra: raciones };
  }
  const complementos: MenuComplement[] = [];
  for (const c of meal.complements) {
    const cabe = Math.min(c.quantity, cabenRaciones(c.category, huecoDeComida(acumulado, objetivo)));
    if (cabe < PASO_RACION) { recortado = true; continue; }
    const ajustado = cabe === c.quantity ? c : { ...c, quantity: round2(cabe) };
    if (ajustado !== c) recortado = true;
    complementos.push(ajustado);
    acumulado = { ...acumulado, complements: complementos };
  }
  if (!recortado) return { meal, recortado: false };
  const recortada: MenuMeal = {
    ...meal,
    complements: complementos,
    ...(meal.racionesExtra ? { racionesExtra: raciones } : {}),
  };
  return { meal: { ...recortada, kcal: kcalDeLaComida(recortada) }, recortado: true };
}
