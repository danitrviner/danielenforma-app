import type { Recipe, BudgetVec, DietType, FoodCategory } from '../types';
import { ingredientMatch, violatesDietType } from './foodPrefs';
import { dishType, DishType } from './dishTypes';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';
import { snapExchanges, totalExchanges } from './exchangeRounding';

// Generic L1 distance between a target and an actual macro/exchange vector.
// Shared by menuEngine's recipe ranking (HC/PROT/GRASA exchange fit) and the
// "Cambiar comida" recipe swap — same math, two vector shapes, hence the
// generic Record<string, number> signature.
export function fitScore(target: Record<string, number>, actual: Record<string, number>): number {
  return Object.keys(target).reduce((sum, key) => sum + Math.abs((target[key] ?? 0) - (actual[key] ?? 0)), 0);
}

const EMPTY: BudgetVec = { HC: 0, PROT: 0, GRASA: 0 };

/**
 * Intercambios de una receta, venga de donde venga.
 *
 * Tres orígenes distintos en la app y ninguno estaba unificado:
 *  1. Recetario importado → campo `exchanges` ya calculado.
 *  2. Recetas del constructor (coach/atleta) → lista `ingredients` con categoría
 *     y cantidad, incluyendo las mixtas (MIX_HC = ½PROT+½HC).
 *  3. Recetas antiguas sin ninguna de las dos → se derivan de los gramos.
 */
export function recipeExchanges(recipe: Recipe): BudgetVec {
  if (recipe.exchanges) {
    return { HC: recipe.exchanges.HC ?? 0, PROT: recipe.exchanges.PROT ?? 0, GRASA: recipe.exchanges.GRASA ?? 0 };
  }

  const ingredients = recipe.ingredients ?? [];
  if (ingredients.length > 0) {
    const v = { ...EMPTY };
    for (const ing of ingredients) {
      const qty = ing.quantity ?? 0;
      const cat: FoodCategory = ing.category;
      if (cat === 'MIX_HC')          { v.HC    += qty * 0.5; v.PROT += qty * 0.5; }
      else if (cat === 'MIX_GRASA')  { v.GRASA += qty * 0.5; v.PROT += qty * 0.5; }
      else if (cat === 'HC' || cat === 'PROT' || cat === 'GRASA') { v[cat] += qty; }
    }
    return snapExchanges(v);
  }

  if (recipe.macros) {
    const quarter = (n: number) => Math.round(n / 0.25) * 0.25;
    return snapExchanges({
      HC:    quarter((recipe.macros.carb ?? 0) / GRAMS_PER_EXCHANGE.HC),
      PROT:  quarter((recipe.macros.prot ?? 0) / GRAMS_PER_EXCHANGE.PROT),
      GRASA: quarter((recipe.macros.fat  ?? 0) / GRAMS_PER_EXCHANGE.GRASA),
    });
  }

  return EMPTY;
}

/** Preferencias y restricciones del atleta que condicionan qué se le puede ofrecer. */
export interface AlternativePrefs {
  /** Filtro DURO. Una receta con un ingrediente que coincida nunca se ofrece. */
  allergies?: string[];
  /** Filtro duro: recetas que el atleta marcó "no me gusta". */
  dislikedRecipeIds?: string[];
  /** Filtro duro: tipos de plato que el atleta excluyó de su menú. */
  excludedDishTypes?: DishType[];
  /** Filtro duro: vegano/vegetariano. */
  dietType?: DietType;
  /** Filtro duro: minutos máximos de cocina. */
  cookingMaxTime?: number;
  /** Señal blanda: penaliza (no excluye) alimentos que no le gustan. */
  dislikedFoods?: string[];
  /** Señal blanda: prima alimentos que sí le gustan. */
  likedFoods?: string[];
  /** Señal blanda: prima sus recetas favoritas. */
  favoriteRecipeIds?: string[];
  /** Señal blanda: prima los tipos de plato que prefiere. */
  preferredDishTypes?: DishType[];
}

export interface AlternativeOptions {
  prefs?: AlternativePrefs;
  /**
   * Desviación máxima admitida en el TOTAL de intercambios. Por defecto 0,5
   * (≈50 kcal): el doble del margen del redondeo, para que dos recetas que se
   * redondearon en direcciones opuestas sigan considerándose equivalentes.
   */
  maxTotalDrift?: number;
  /** Momento del día (intakeType 1-5). Si se pasa, solo recetas aptas para ese momento. */
  intakeType?: number;
  /** Cuántas devolver. Por defecto 30. */
  limit?: number;
  /** Repartir el resultado entre tipos de plato distintos. Por defecto sí. */
  diversify?: boolean;
  /** Texto de búsqueda libre sobre el nombre. */
  search?: string;
  /** Solo recetas aptas para tupper. */
  onlyTupper?: boolean;
}

export interface RecipeAlternative {
  recipe: Recipe;
  dishType: DishType;
  exchanges: BudgetVec;
  /** Diferencia absoluta en el total de intercambios respecto a la receta origen. */
  totalDrift: number;
  /** Menor es mejor. */
  score: number;
}

function matchesIntake(recipe: Recipe, intakeType?: number): boolean {
  if (intakeType == null) return true;
  if (recipe.intakeTypes && recipe.intakeTypes.length > 0) return recipe.intakeTypes.includes(intakeType);
  if (recipe.categories?.includes('Desayuno')) return intakeType === 1;
  if (recipe.categories?.includes('Cena')) return intakeType === 5;
  return true;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Busca recetas que puedan sustituir a `source` sin romper la dieta del atleta.
 *
 * Sustituye a la antigua `findSimilarRecipes`, que emparejaba por ±10% de kcal y
 * ordenaba por *reparto porcentual* de macros. Eso tenía tres problemas graves:
 *
 *  1. No miraba alergias ni preferencias: podía ofrecer un plato con un alérgeno.
 *  2. Ordenar por reparto porcentual hace que a un batido solo se parezcan otros
 *     batidos (mismo perfil hiper-carbohidratado), así que la lista salía toda
 *     del mismo tipo — la queja de "solo me ofrece batidos".
 *  3. El % de macros no significa nada en el sistema de intercambios del coach.
 *
 * Ahora empareja por el TOTAL de intercambios, que es lo que de verdad tiene que
 * cuadrar (1 intercambio ≈ 100 kcal en los tres macros), y reparte el resultado
 * entre tipos de plato para que el atleta vea opciones genuinamente distintas.
 */
export function findRecipeAlternatives(
  source: Recipe,
  pool: Recipe[],
  options: AlternativeOptions = {},
): RecipeAlternative[] {
  const {
    prefs = {},
    maxTotalDrift = 0.5,
    intakeType,
    limit = 30,
    diversify = true,
    search,
    onlyTupper,
  } = options;

  const sourceExch = recipeExchanges(source);
  const sourceTotal = totalExchanges(sourceExch);
  if (sourceTotal <= 0) return [];

  const disliked = new Set(prefs.dislikedRecipeIds ?? []);
  const favorites = new Set(prefs.favoriteRecipeIds ?? []);
  const excludedDish = new Set(prefs.excludedDishTypes ?? []);
  const preferredDish = new Set(prefs.preferredDishTypes ?? []);
  const allergies = prefs.allergies ?? [];
  const nSearch = search ? norm(search) : null;

  const scored: RecipeAlternative[] = [];

  for (const r of pool) {
    if (r.id === source.id) continue;

    // ── Filtros duros ────────────────────────────────────────────────────────
    // Las alergias van primero y no las relaja ninguna opción: ofrecer un
    // alérgeno es el único fallo de este buscador que puede hacer daño de verdad.
    if (allergies.some(f => ingredientMatch(r, f))) continue;
    if (disliked.has(r.id)) continue;
    if (violatesDietType(r, prefs.dietType)) continue;
    if (prefs.cookingMaxTime != null && r.cookingTime != null && r.cookingTime > prefs.cookingMaxTime) continue;
    if (!matchesIntake(r, intakeType)) continue;
    if (onlyTupper && !r.tupper) continue;
    if (nSearch && !norm(r.name).includes(nSearch)) continue;

    const dt = dishType(r);
    if (excludedDish.has(dt)) continue;

    const exch = recipeExchanges(r);
    const total = totalExchanges(exch);
    if (total <= 0) continue;

    const totalDrift = Math.abs(total - sourceTotal);
    if (totalDrift > maxTotalDrift + 1e-9) continue;

    // ── Puntuación ───────────────────────────────────────────────────────────
    // El total pesa 4× el reparto: dar las mismas calorías es el objetivo, que
    // además coincida el desglose HC/PROT/GRASA es un extra deseable.
    let score = totalDrift * 4 + fitScore(sourceExch as unknown as Record<string, number>, exch as unknown as Record<string, number>);
    if (favorites.has(r.id)) score -= 3;
    if (preferredDish.has(dt)) score -= 1.5;
    if ((prefs.likedFoods ?? []).some(f => ingredientMatch(r, f))) score -= 0.5;
    if ((prefs.dislikedFoods ?? []).some(f => ingredientMatch(r, f))) score += 2;

    scored.push({ recipe: r, dishType: dt, exchanges: exch, totalDrift, score });
  }

  scored.sort((a, b) => a.score - b.score || a.recipe.name.localeCompare(b.recipe.name));
  return diversify ? roundRobinByDishType(scored, limit) : scored.slice(0, limit);
}

/**
 * Reparte el resultado entre tipos de plato en ronda: el mejor batido, la mejor
 * tostada, la mejor ensalada, y vuelta a empezar.
 *
 * `findSwapAlternatives` de menuEngine hace algo parecido pero solo con los
 * primeros: coge uno de cada tipo y luego rellena por puntuación, así que a
 * partir del sexto vuelve a ser monotemático. Con 30 resultados eso se nota, y
 * es justo la parte de la lista donde el atleta busca cuando no le apetece nada
 * de lo primero. La ronda mantiene la variedad hasta el final.
 */
function roundRobinByDishType(sorted: RecipeAlternative[], limit: number): RecipeAlternative[] {
  const groups = new Map<DishType, RecipeAlternative[]>();
  for (const c of sorted) {
    const g = groups.get(c.dishType);
    if (g) g.push(c); else groups.set(c.dishType, [c]);
  }
  // Orden de los grupos por su mejor candidato, para que la primera opción de la
  // lista siga siendo la mejor de todas.
  const queues = [...groups.values()].sort((a, b) => a[0].score - b[0].score);

  const out: RecipeAlternative[] = [];
  let anyLeft = true;
  for (let round = 0; anyLeft && out.length < limit; round++) {
    anyLeft = false;
    for (const q of queues) {
      if (round >= q.length) continue;
      anyLeft = true;
      out.push(q[round]);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Cuántas alternativas hay por tipo de plato — para las pestañas del selector. */
export function groupByDishType(alts: RecipeAlternative[]): { type: DishType; count: number }[] {
  const counts = new Map<DishType, number>();
  for (const a of alts) counts.set(a.dishType, (counts.get(a.dishType) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * ¿Cabe esta receta en lo que te queda?
 *
 * Se usa al abrir el recetario DESDE una comida del plan: el atleta que lleva
 * el desayuno y la comida registrados no quiere ver las 8.850 recetas, quiere
 * ver las que le entran en lo que le sobra. Antes el recetario no miraba el
 * cupo para nada —solo categoría, alergias y preferencias—, así que la mitad de
 * lo que ofrecía no cabía.
 *
 * El margen existe porque cuadrar al gramo no pasa nunca: una receta que se
 * pasa un cuarto de intercambio sigue siendo una respuesta razonable, y ser
 * estricto dejaba la lista casi vacía.
 */
export function cabeEnElCupo(recipe: Recipe, cupo: BudgetVec, margen = 0.5): boolean {
  const e = recipeExchanges(recipe);
  return (['HC', 'PROT', 'GRASA'] as const).every(c => e[c] <= (cupo[c] ?? 0) + margen);
}

/**
 * Las recetas que caben, de la que mejor aprovecha el cupo a la que menos.
 * Ordenar por sobra (y no por "lo más pequeño primero") evita que arriba salgan
 * siempre las recetas de medio intercambio, que caben en todo y no resuelven la
 * comida de nadie.
 */
export function ordenarPorCupo(recipes: Recipe[], cupo: BudgetVec, margen = 0.5): Recipe[] {
  const sobra = (r: Recipe) => {
    const e = recipeExchanges(r);
    return (['HC', 'PROT', 'GRASA'] as const).reduce((s, c) => s + Math.abs((cupo[c] ?? 0) - e[c]), 0);
  };
  return recipes.filter(r => cabeEnElCupo(r, cupo, margen)).sort((a, b) => sobra(a) - sobra(b));
}
