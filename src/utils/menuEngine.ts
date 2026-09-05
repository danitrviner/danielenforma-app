import {
  Recipe, MealItem, Diet, WeekDay, DietType, DietMode, FoodCategory,
  BudgetVec, MenuDay, MenuMeal, MenuComplement,
} from '../types';
import { addToPlaced, round2 } from './exchangeHelpers';
import { quotaSplit } from './quotaSplit';
import { ingredientMatch, normalizeStr, violatesDietType } from './foodPrefs';
import { fitScore } from './recipeMatch';
import { exchangeToKcal } from './nutritionConstants';
import { simpleComplementsFor } from './menuComplements';
import { dishType, DishType } from './dishTypes';
import { fotoDeReceta } from './fotoDeReceta';

// Pure, framework-free generator for recipe-first weekly menus. Reads its
// daily point budget from the client's already-configured exchange-type diets
// (Diet.budget + AthleteDietConfig.weeklySchedule) — see WeeklyMenuEditor.tsx
// for how the pieces are wired together with Firestore reads.

export const MENU_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Cuánto peor que el mejor encaje puede ser una receta y seguir compitiendo por
// preferencias (favoritos, variedad, tipo de plato). Ver `rankCandidates`.
const BANDA_MINIMA = 0.5;   // intercambios
const BANDA_PCT    = 0.15;  // …o el 15 % del objetivo de la franja, lo que sea mayor
const FUERA_DE_BANDA = 100; // constante para que lo que no encaja quede siempre al final
/** Tope de complementos encadenados por categoría (ver `fillComplements`). */
const MAX_COMPLEMENTOS_POR_CATEGORIA = 3;
/** Tope de raciones de UN mismo complemento — más que esto deja de ser realista. */
const MAX_RACIONES_POR_COMPLEMENTO = 4;
/** Suelo y techo del peso por macro (ver `pesosPorCategoria`). */
const PRESUPUESTO_MINIMO = 0.5;
const PESO_MAXIMO = 4;
/** Por debajo de esto, excluir los "no me gusta" dejaría la franja sin recetas. */
const MIN_RECETAS_PARA_EXCLUIR = 5;

export interface MealSlotSpec {
  slot: number;   // intakeType 1-5
  name: string;
  pct: number;    // % of the day's budget for this slot
  needsTupper?: boolean;
}

export interface GeneratorPrefs {
  allergies: string[];
  disliked: string[];
  liked: string[];
  dietType?: DietType;
  cookingMaxTime?: number;
  variety: number; // 1 (monotone) - 5 (max variety)
  favoriteRecipeIds?: string[];  // strong bonus — surface these much more
  dislikedRecipeIds?: string[];  // hard-excluded ("no me gusta")
  preferredDishTypes?: DishType[]; // strong bonus for these dish types
  excludedDishTypes?: DishType[];  // hard-excluded dish types
}

export interface MenuCandidate {
  recipe: Recipe;
  scale: number;
  exch: BudgetVec;
  score: number; // lower is better
}

// ─── Meal slots from anamnesis ──────────────────────────────────────────────

const PRESET_PCTS: Record<3 | 4 | 5, number[]> = {
  3: [25, 45, 30],
  4: [20, 10, 40, 30],
  5: [20, 10, 35, 10, 25],
};

export const FALLBACK_SLOTS: Record<3 | 4 | 5, MealSlotSpec[]> = {
  3: [
    { slot: 1, name: 'Desayuno', pct: 25 },
    { slot: 3, name: 'Comida', pct: 45 },
    { slot: 5, name: 'Cena', pct: 30 },
  ],
  4: [
    { slot: 1, name: 'Desayuno', pct: 20 },
    { slot: 2, name: 'Media mañana', pct: 10 },
    { slot: 3, name: 'Comida', pct: 40 },
    { slot: 5, name: 'Cena', pct: 30 },
  ],
  5: [
    { slot: 1, name: 'Desayuno', pct: 20 },
    { slot: 2, name: 'Media mañana', pct: 10 },
    { slot: 3, name: 'Comida', pct: 35 },
    { slot: 4, name: 'Merienda', pct: 10 },
    { slot: 5, name: 'Cena', pct: 25 },
  ],
};

// Prefers the athlete's own anamnesis meals (name + needsTupper preserved);
// falls back to a generic preset when onboarding is missing or incomplete.
export function slotsFromOnboarding(
  ob: { mealCount?: number; meals?: { intakeType: number; name: string; needsTupper: boolean }[] } | null,
): MealSlotSpec[] {
  const count: 3 | 4 | 5 = ob?.mealCount === 3 || ob?.mealCount === 5 ? ob.mealCount : 4;
  if (ob?.meals && ob.meals.length === count) {
    const pcts = PRESET_PCTS[count];
    return ob.meals.map((m, i) => ({
      slot: m.intakeType, name: m.name, pct: pcts[i] ?? Math.round(100 / count), needsTupper: m.needsTupper,
    }));
  }
  return FALLBACK_SLOTS[count];
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

// Antes redondeaba cada franja a 0,25 de forma independiente (roundQuarter),
// lo que podía desviar la suma de las franjas hasta n·0,125 respecto al
// presupuesto real del día. quotaSplit reparte por peso (aquí, sl.pct) con
// suma EXACTA — misma regla que usa el reparto de "Mi plan"/coach.
export function slotTargets(dayBudget: BudgetVec, slots: MealSlotSpec[]): BudgetVec[] {
  const weights = slots.map(sl => sl.pct);
  const hc = quotaSplit(dayBudget.HC, weights);
  const prot = quotaSplit(dayBudget.PROT, weights);
  const grasa = quotaSplit(dayBudget.GRASA, weights);
  return slots.map((_, i) => ({ HC: hc[i], PROT: prot[i], GRASA: grasa[i] }));
}

// ─── Recipe → exchanges ──────────────────────────────────────────────────────

// Recipes from the imported recetario carry a precomputed aggregate; coach/athlete builder recipes
// carry structured, per-mode ingredients instead (see exchangeHelpers.ts).
export function recipeExchanges(recipe: Recipe, mode: DietMode = 'OMNIVORO'): BudgetVec | null {
  if (recipe.exchanges) {
    return { HC: recipe.exchanges.HC ?? 0, PROT: recipe.exchanges.PROT ?? 0, GRASA: recipe.exchanges.GRASA ?? 0 };
  }
  const ingredients = recipe.ingredients ?? [];
  if (ingredients.length === 0) return null;
  const relevant = ingredients.filter(i => i.mode === mode);
  const use = relevant.length > 0 ? relevant : ingredients; // fall back to whatever mode the recipe has
  const p: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const ing of use) addToPlaced(p, ing.category, ing.quantity);
  return { HC: p.HC, PROT: p.PROT, GRASA: p.GRASA };
}

function complementExchanges(c: MenuComplement): BudgetVec {
  const p: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  addToPlaced(p, c.category, c.quantity);
  return { HC: p.HC, PROT: p.PROT, GRASA: p.GRASA };
}

function sumVec(a: BudgetVec, b: BudgetVec): BudgetVec {
  return { HC: a.HC + b.HC, PROT: a.PROT + b.PROT, GRASA: a.GRASA + b.GRASA };
}

function mealTotalExch(meal: MenuMeal): BudgetVec {
  return meal.complements.reduce((acc, c) => sumVec(acc, complementExchanges(c)), meal.exch);
}

// ─── Scaling & ranking ───────────────────────────────────────────────────────

// Best-fit scale within MENU_SCALES (0.5x-2x). Returns null when even the
// widest scale in range can't reasonably approach the target — i.e. the
// recipe's natural portion is more than 2x too big or too small — so it gets
// discarded from candidacy entirely rather than served as a bad match.
export function bestScaleFit(
  recipe: Recipe, target: BudgetVec, mode: DietMode = 'OMNIVORO',
  opts: { permitirFueraDeRango?: boolean } = {},
): { scale: number; exch: BudgetVec; score: number } | null {
  const base = recipeExchanges(recipe, mode);
  if (!base) return null;
  const baseTotal = base.HC + base.PROT + base.GRASA;
  const targetTotal = target.HC + target.PROT + target.GRASA;
  if (baseTotal <= 0 || targetTotal <= 0) return null;

  const idealScale = targetTotal / baseTotal;
  // `permitirFueraDeRango` es el último recurso de `rankCandidates`: cuando
  // NINGUNA receta de la franja llega al objetivo (una comida de 20
  // intercambios y un recetario de platos de 5), rechazarlas todas dejaba la
  // comida literalmente vacía y el día entero descuadrado en silencio. Servir
  // el plato a su escala máxima y cerrar el resto con complementos es lo que
  // haría el coach a mano.
  if (!opts.permitirFueraDeRango
    && (idealScale < MENU_SCALES[0] || idealScale > MENU_SCALES[MENU_SCALES.length - 1])) return null;
  // Un plato que ya es demasiado grande a media ración no se puede recortar más:
  // ese sí se descarta siempre, aunque no haya alternativa.
  if (idealScale < MENU_SCALES[0]) return null;

  // Distancia L1 PONDERADA por categoría. `fitScore` mide en intercambios
  // absolutos y trata igual los tres macros; con una dieta de definición
  // (20 HC / 14 PROT / 9 GRASA) eso significa que pasarse 4 de grasa —casi la
  // mitad del presupuesto del día— puntúa igual que pasarse 4 de HC, que es un
  // 20 %. El resultado era días que clavaban HC y proteína y se iban a 13/9 de
  // grasa (Dani, 24-08). El peso sube en la categoría con menos presupuesto,
  // que es justo la que hay que cuidar.
  const pesos = pesosPorCategoria(target);
  let best: { scale: number; exch: BudgetVec; score: number } | null = null;
  for (const scale of MENU_SCALES) {
    const exch: BudgetVec = { HC: round2(base.HC * scale), PROT: round2(base.PROT * scale), GRASA: round2(base.GRASA * scale) };
    const score = round2(
      pesos.HC * Math.abs(target.HC - exch.HC)
      + pesos.PROT * Math.abs(target.PROT - exch.PROT)
      + pesos.GRASA * Math.abs(target.GRASA - exch.GRASA),
    );
    if (!best || score < best.score) best = { scale, exch, score };
  }
  return best;
}

// Peso de cada macro en la distancia: la media del objetivo dividida entre lo
// que pide esa categoría. Con los tres macros iguales da 1 y se comporta como
// la L1 de siempre; cuanto más pequeño es el presupuesto de una categoría, más
// caro sale desviarse en ella. El suelo evita dividir por ~0 en una categoría
// que la dieta no usa.
function pesosPorCategoria(target: BudgetVec): BudgetVec {
  const media = (target.HC + target.PROT + target.GRASA) / 3;
  if (media <= 0) return { HC: 1, PROT: 1, GRASA: 1 };
  const peso = (v: number) => Math.min(PESO_MAXIMO, media / Math.max(v, PRESUPUESTO_MINIMO));
  return { HC: peso(target.HC), PROT: peso(target.PROT), GRASA: peso(target.GRASA) };
}


export interface RankOptions {
  needsTupper?: boolean;
  /** Se está eligiendo para cocinar una vez y comer durante la semana. Distinto
   *  de `needsTupper`, que solo dice que ESA comida se la lleva de casa: aquí
   *  TODO se cocina por adelantado, así que un plato que solo esté bueno recién
   *  hecho es mala elección aunque encaje de intercambios. */
  batch?: boolean;
  mode?: DietMode;
  // Dish types already placed (per day and/or week) with how many times — used to
  // penalize serving the same *kind* of meal repeatedly (the "always a batido" fix).
  usedDishTypes?: ReadonlyMap<DishType, number>;
}

// Filtros duros (nunca salen): alergias, incompatibilidad con el tipo de dieta,
// tiempo de cocina por encima del máximo, recetas marcadas "no me gusta", tipos
// de plato excluidos y —desde 24-08— los ALIMENTOS marcados "no me gusta" en
// Preferencias alimentarias, con reserva si dejaran la franja sin recetas.
// Señales blandas (solo ordenan): favoritos y tipos de plato preferidos, alimentos
// que le gustan, tupper, repetición de receta (`usedIds`) y de tipo de plato.
// Las señales blandas NUNCA adelantan a una receta que encaja mejor: solo
// ordenan dentro de la banda de tolerancia (ver `BANDA_MINIMA`/`BANDA_PCT`).
export function rankCandidates(
  pool: Recipe[],
  target: BudgetVec,
  prefs: GeneratorPrefs,
  usedIds: ReadonlySet<string>,
  opts: RankOptions = {},
): MenuCandidate[] {
  const mode = opts.mode ?? 'OMNIVORO';
  const disliked = new Set(prefs.dislikedRecipeIds ?? []);
  const favorites = new Set(prefs.favoriteRecipeIds ?? []);
  const excludedDish = new Set(prefs.excludedDishTypes ?? []);
  const preferredDish = new Set(prefs.preferredDishTypes ?? []);

  const permitidas = pool.filter(r =>
    !disliked.has(r.id) &&
    !excludedDish.has(dishType(r)) &&
    !prefs.allergies.some(f => ingredientMatch(r, f)) &&
    !violatesDietType(r, prefs.dietType) &&
    !(prefs.cookingMaxTime != null && r.cookingTime != null && r.cookingTime > prefs.cookingMaxTime),
  );

  // Los alimentos marcados "no me gusta" en Preferencias alimentarias se
  // EXCLUYEN, no se penalizan. Antes sumaban +2 al `fitScore` —la misma escala
  // que la distancia en intercambios— así que un plato con espinacas seguía
  // saliendo si encajaba 2 puntos mejor que el resto: al atleta le llegaba en
  // la dieta justo lo que había dicho que no quería. Con 8.850 recetas casi
  // siempre hay alternativa; si un atleta descarta tanto que la franja se
  // quedaría sin nada, se vuelven a admitir (una comida con algo que no le
  // encanta es mejor que una comida vacía) y el coach lo ve en el borrador.
  const sinNoDeseados = permitidas.filter(r => !prefs.disliked.some(f => ingredientMatch(r, f)));
  const safe = sinNoDeseados.length >= MIN_RECETAS_PARA_EXCLUIR ? sinNoDeseados : permitidas;

  // Se calcula PRIMERO el encaje puro de cada receta, sin preferencias. Antes
  // las preferencias se sumaban directamente al `fitScore`, que es distancia L1
  // en intercambios: un favorito (−3) que se pasaba 3 intercambios empataba con
  // uno que cuadraba clavado, y una receta ya usada (+5) perdía contra
  // cualquier cosa. Eso es lo que descuadraba los días enteros (Dani, 24-08):
  // las señales blandas competían de tú a tú con la precisión nutricional.
  type ConEncaje = { recipe: Recipe; fit: NonNullable<ReturnType<typeof bestScaleFit>> };
  const encajesDe = (permitirFueraDeRango: boolean): ConEncaje[] => safe
    .map(recipe => ({ recipe, fit: bestScaleFit(recipe, target, mode, { permitirFueraDeRango }) }))
    .filter((c): c is ConEncaje => c.fit != null);

  // Si ninguna receta llega al objetivo de la franja se reintenta sin el tope de
  // escala: mejor el plato más grande disponible + complementos que una comida
  // vacía (ver `bestScaleFit`).
  const conEncaje = ((): ConEncaje[] => {
    const estricto = encajesDe(false);
    return estricto.length > 0 ? estricto : encajesDe(true);
  })();
  if (conEncaje.length === 0) return [];

  // Banda de tolerancia: las preferencias solo ordenan DENTRO de las recetas
  // que ya encajan bien. Se mide en intercambios y crece con el tamaño de la
  // franja (un desayuno de 3 int. no admite el mismo error absoluto que una
  // comida de 10), con un suelo para que en franjas pequeñas siga habiendo
  // variedad donde elegir.
  const objetivoTotal = target.HC + target.PROT + target.GRASA;
  const mejorEncaje = Math.min(...conEncaje.map(c => c.fit.score));
  const banda = Math.max(BANDA_MINIMA, objetivoTotal * BANDA_PCT);
  const limite = mejorEncaje + banda;

  const scored: MenuCandidate[] = [];
  for (const { recipe, fit } of conEncaje) {
    let score = fit.score;
    const dt = dishType(recipe);
    if (favorites.has(recipe.id)) score -= 3;            // favorites: appear much more
    if (preferredDish.has(dt)) score -= 1.5;             // preferred dish types: prioritized
    // Sigue penalizando por si la franja cayó en la reserva de arriba (recetario
    // demasiado restringido): dentro de lo que hay, lo no deseado va al final.
    if (prefs.disliked.some(f => ingredientMatch(recipe, f))) score += 2;
    if (prefs.liked.some(f => ingredientMatch(recipe, f))) score -= 0.5;
    if (opts.needsTupper && recipe.tupper) score -= 0.5;
    // Penalización fuerte, no exclusión: si el recetario disponible para esa
    // franja tuviera pocos platos de tupper, excluirlos dejaría la comida vacía,
    // que es peor que proponer algo que aguanta regular. Con +4 solo sale un no-
    // tupper cuando de verdad no hay alternativa razonable.
    if (opts.batch && !recipe.tupper) score += 4;
    if (usedIds.has(recipe.id)) score += 5;              // strong nudge away, not a hard block
    const dishReuse = opts.usedDishTypes?.get(dt) ?? 0;
    if (dishReuse > 0) score += 2 * dishReuse;           // spread dish types across the day/week
    // Fuera de banda no se descarta —el buscador de alternativas y las franjas
    // con recetario pobre necesitan la lista larga— pero nunca puede adelantar
    // a algo que sí encaja, por muy favorito que sea.
    if (fit.score > limite) score += FUERA_DE_BANDA;
    scored.push({ recipe, scale: fit.scale, exch: fit.exch, score });
  }
  return scored.sort((a, b) => a.score - b.score);
}

// ─── Complements ─────────────────────────────────────────────────────────────

// Closes positive shortfalls only (never trims an overshoot) with simple,
// ready-to-eat foods — never invents an unrealistic recipe scale to chase the
// last 0.25 of a category. Capped at 2 exchanges of a single complement.
export function fillComplements(gap: BudgetVec, foods: MealItem[], mode: DietMode): MenuComplement[] {
  const simple = simpleComplementsFor(foods).filter(f => f.mode === mode);
  const cats: (keyof BudgetVec)[] = ['HC', 'PROT', 'GRASA'];
  const result: MenuComplement[] = [];
  for (const cat of cats) {
    let need = gap[cat];
    if (need < 0.5) continue;
    const candidates = simple.filter(f => f.category === cat || (cat === 'PROT' && f.category === 'MIX_HC'));
    if (candidates.length === 0) continue;
    // Antes se ponía UN solo complemento tapado a 2 intercambios: un hueco de 4
    // se quedaba a medias y el día seguía descuadrado sin decirlo. Ahora se
    // encadenan hasta cerrar el hueco, con alimentos distintos mientras los
    // haya (3 raciones de pan es peor consejo que pan + fruta + arroz) y un
    // tope de seguridad para no escribir una lista absurda si el hueco es
    // enorme por un fallo de configuración de la dieta.
    const usados = new Set<string>();
    for (let n = 0; n < MAX_COMPLEMENTOS_POR_CATEGORIA && need >= 0.5; n++) {
      const frescos = candidates.filter(f => !usados.has(f.label));
      const pool = frescos.length > 0 ? frescos : candidates;
      const food = pool[Math.floor(Math.random() * pool.length)];
      // Se reparte el hueco entre los complementos que quedan por poner, en vez
      // de vaciar 2 en el primero: 3+3 raciones repartidas es un consejo más
      // realista que 2+2+2 arbitrario, y evita quedarse corto en huecos grandes.
      const restantes = MAX_COMPLEMENTOS_POR_CATEGORIA - n;
      const objetivo = Math.max(0.5, need / restantes);
      const qty = Math.min(MAX_RACIONES_POR_COMPLEMENTO, Math.floor(objetivo * 2) / 2, Math.floor(need * 2) / 2);
      if (qty < 0.5) break;
      usados.add(food.label);
      result.push({ foodLabel: food.label, category: food.category, quantity: qty });
      need = round2(need - qty);
    }
  }
  return result;
}

function attachComplementsToMeals(meals: MenuMeal[], targets: BudgetVec[], complements: MenuComplement[]): void {
  for (const comp of complements) {
    const cat = comp.category === 'MIX_HC' || comp.category === 'MIX_GRASA' ? 'PROT' : comp.category;
    let bestIdx = 0, bestVal = -1;
    targets.forEach((t, i) => { if (t[cat as 'HC' | 'PROT' | 'GRASA'] > bestVal) { bestVal = t[cat as 'HC' | 'PROT' | 'GRASA']; bestIdx = i; } });
    meals[bestIdx].complements.push(comp);
  }
}

function mealKcal(meal: MenuMeal): number {
  const total = mealTotalExch(meal);
  return Math.round(exchangeToKcal(total));
}

// ─── Day generation ──────────────────────────────────────────────────────────

function dietBudgetVec(diet: Diet): BudgetVec {
  return { HC: diet.budget.HC ?? 0, PROT: diet.budget.PROT ?? 0, GRASA: diet.budget.GRASA ?? 0 };
}

function emptyMeal(id: string, slot: MealSlotSpec): MenuMeal {
  return { id, slot: slot.slot, name: slot.name, recipeId: '', recipeName: 'Sin receta disponible', scale: 1, exch: { HC: 0, PROT: 0, GRASA: 0 }, kcal: 0, complements: [] };
}

function buildMeal(id: string, slot: MealSlotSpec, recipe: Recipe, scale: number, exch: BudgetVec): MenuMeal {
  const meal: MenuMeal = {
    id, slot: slot.slot, name: slot.name,
    recipeId: recipe.id, recipeName: recipe.name,
    recipeImage: fotoDeReceta(recipe),
    scale, exch, kcal: 0, complements: [],
  };
  meal.kcal = mealKcal(meal);
  return meal;
}

// Shared tail of day generation: fill the remaining category gap with simple
// complements and recompute kcal. Used by both per-day and batch generation.
function finalizeDay(day: WeekDay, diet: Diet, target: BudgetVec, targets: BudgetVec[], meals: MenuMeal[], foods: MealItem[], mode: DietMode): MenuDay {
  const totals = meals.reduce((acc, m) => sumVec(acc, mealTotalExch(m)), { HC: 0, PROT: 0, GRASA: 0 });
  const gap: BudgetVec = {
    HC: Math.max(0, round2(target.HC - totals.HC)),
    PROT: Math.max(0, round2(target.PROT - totals.PROT)),
    GRASA: Math.max(0, round2(target.GRASA - totals.GRASA)),
  };
  const complements = fillComplements(gap, foods, mode);
  attachComplementsToMeals(meals, targets, complements);
  for (const meal of meals) meal.kcal = mealKcal(meal);
  return { day, dietId: diet.id, dietName: diet.name, target, meals };
}

export interface GenerateDayArgs {
  day: WeekDay;
  diet: Diet | null; // null = free/unassigned day, no meals generated
  slots: MealSlotSpec[];
  pools: Record<number, Recipe[]>; // recipe candidates keyed by slot (intakeType)
  foods: MealItem[];
  prefs: GeneratorPrefs;
  usedIds: Set<string>; // mutated in place to track recipe variety across days
  usedDishTypes?: Map<DishType, number>; // mutated in place to spread dish types across days
  mode?: DietMode;
}

function bumpDishType(map: Map<DishType, number>, dt: DishType): void {
  map.set(dt, (map.get(dt) ?? 0) + 1);
}

export function generateDay(args: GenerateDayArgs): MenuDay {
  const { day, diet, slots, pools, foods, prefs, usedIds } = args;
  const mode = args.mode ?? 'OMNIVORO';
  // A per-day dish-type tally (seeded from any week-level one passed in) so two
  // slots on the same day don't both come out as, say, batidos.
  const dishTypes = args.usedDishTypes ?? new Map<DishType, number>();

  if (!diet) {
    return { day, dietId: null, target: { HC: 0, PROT: 0, GRASA: 0 }, meals: [] };
  }

  const target = dietBudgetVec(diet);
  const targets = slotTargets(target, slots);

  // Se elige franja a franja recalculando lo que QUEDA del día, en vez de
  // resolver las cuatro contra su cuota fija. Las recetas vienen en
  // intercambios discretos y la escala solo va de 0,5 a 2 en pasos de 0,25, así
  // que cada comida deja un pico suelto; con cuotas fijas esos picos se SUMAN
  // (era lo que dejaba días a −3 o −4 intercambios). Arrastrando el resto, la
  // comida siguiente lo absorbe y el error se cancela en vez de acumularse.
  let restante: BudgetVec = { ...target };
  const meals: MenuMeal[] = slots.map((slot, i) => {
    // Nunca por debajo de cero: si una comida se pasó, la siguiente pide lo
    // mínimo, no un objetivo negativo — con un objetivo negativo `bestScaleFit`
    // descarta TODAS las recetas y la comida saldría vacía, que es mucho peor
    // que servir algo pequeño.
    const disponible: BudgetVec = {
      HC: Math.max(0, restante.HC), PROT: Math.max(0, restante.PROT), GRASA: Math.max(0, restante.GRASA),
    };
    const objetivoFranja = slotTargets(disponible, slots.slice(i))[0] ?? targets[i];
    const pool = pools[slot.slot] ?? [];
    const ranked = rankCandidates(pool, objetivoFranja, prefs, usedIds, { needsTupper: slot.needsTupper, mode, usedDishTypes: dishTypes });
    const pick = ranked[0];
    const id = `${day}_m${i + 1}`;
    if (!pick) return emptyMeal(id, slot);
    usedIds.add(pick.recipe.id);
    bumpDishType(dishTypes, dishType(pick.recipe));
    restante = {
      HC: round2(restante.HC - pick.exch.HC),
      PROT: round2(restante.PROT - pick.exch.PROT),
      GRASA: round2(restante.GRASA - pick.exch.GRASA),
    };
    return buildMeal(id, slot, pick.recipe, pick.scale, pick.exch);
  });

  return finalizeDay(day, diet, target, targets, meals, foods, mode);
}

// ─── Week generation ─────────────────────────────────────────────────────────

export interface GenerateWeekArgs {
  schedule: Partial<Record<WeekDay, string | null>>;
  diets: Diet[];
  slots: MealSlotSpec[];
  pools: Record<number, Recipe[]>;
  foods: MealItem[];
  prefs: GeneratorPrefs;
  mode?: DietMode;
  batch?: boolean; // batch-cooking: one recipe per slot for the whole week, portioned per day
}

function avgVec(vecs: BudgetVec[]): BudgetVec {
  if (vecs.length === 0) return { HC: 0, PROT: 0, GRASA: 0 };
  const sum = vecs.reduce(sumVec, { HC: 0, PROT: 0, GRASA: 0 });
  return { HC: sum.HC / vecs.length, PROT: sum.PROT / vecs.length, GRASA: sum.GRASA / vecs.length };
}

// Batch cooking: the athlete wants to cook everything in one session and portion
// it out over the week, so we fix ONE recipe per meal slot for the whole week
// (chosen against the average of that slot's targets across scheduled days) and
// only re-scale it per day. A day whose budget would push that recipe outside
// the 0.5–2x range falls back to a per-day pick for that slot alone (rare).
// Distinct recipes are kept across slots so breakfast ≠ lunch. See buildBatchPlan
// for the consolidated "cook once" view this feeds.
function generateWeekBatch(args: GenerateWeekArgs): MenuDay[] {
  const { schedule, diets, slots, pools, foods, prefs } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const dietsById = new Map(diets.map(d => [d.id, d]));

  const scheduledDiets = WEEK_DAYS
    .map(day => (schedule[day] ? dietsById.get(schedule[day]!) ?? null : null))
    .filter((d): d is Diet => d != null);

  // One fixed recipe per slot, chosen against the average slot target.
  const usedAcrossSlots = new Set<string>();
  const slotRecipe: (Recipe | null)[] = slots.map((slot, i) => {
    const slotTargetsAcrossDays = scheduledDiets.map(d => slotTargets(dietBudgetVec(d), slots)[i]);
    const repTarget = avgVec(slotTargetsAcrossDays);
    const ranked = rankCandidates(pools[slot.slot] ?? [], repTarget, prefs, usedAcrossSlots, { needsTupper: slot.needsTupper, batch: true, mode });
    const pick = ranked[0]?.recipe ?? null;
    if (pick) usedAcrossSlots.add(pick.id);
    return pick;
  });

  return WEEK_DAYS.map(day => {
    const dietId = schedule[day] ?? null;
    const diet = dietId ? dietsById.get(dietId) ?? null : null;
    if (!diet) return { day, dietId: null, target: { HC: 0, PROT: 0, GRASA: 0 }, meals: [] };

    const target = dietBudgetVec(diet);
    const targets = slotTargets(target, slots);
    const meals: MenuMeal[] = slots.map((slot, i) => {
      const id = `${day}_m${i + 1}`;
      const fixed = slotRecipe[i];
      if (fixed) {
        const fit = bestScaleFit(fixed, targets[i], mode);
        if (fit) return buildMeal(id, slot, fixed, fit.scale, fit.exch);
      }
      // Fixed recipe can't scale to this day's target — pick a one-off for this day.
      const ranked = rankCandidates(pools[slot.slot] ?? [], targets[i], prefs, new Set(), { needsTupper: slot.needsTupper, batch: true, mode });
      const pick = ranked[0];
      return pick ? buildMeal(id, slot, pick.recipe, pick.scale, pick.exch) : emptyMeal(id, slot);
    });

    return finalizeDay(day, diet, target, targets, meals, foods, mode);
  });
}

// Variety semantics (prefs.variety):
//  1-2  monotone   — one generation per diet type (e.g. "Día Alto"), cloned to
//                     every day scheduled with that type.
//  3    balanced   — no repeated recipe within the same diet type, but the
//                     same recipe may reappear across different diet types.
//  4-5  max variety — no repeated recipe anywhere in the week.
// args.batch overrides variety entirely (see generateWeekBatch).
export function generateWeek(args: GenerateWeekArgs): MenuDay[] {
  if (args.batch) return generateWeekBatch(args);

  const { schedule, diets, slots, pools, foods, prefs } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const dietsById = new Map(diets.map(d => [d.id, d]));

  const globalUsed = new Set<string>();
  const perDietUsed = new Map<string, Set<string>>();
  const perDietTemplate = new Map<string, MenuDay>();
  // Week-level dish-type tallies so the same *kind* of meal (e.g. breakfast
  // batido) doesn't repeat every day. Not used for variety<=2 (we clone there).
  const globalDishTypes = new Map<DishType, number>();
  const perDietDishTypes = new Map<string, Map<DishType, number>>();

  return WEEK_DAYS.map(day => {
    const dietId = schedule[day] ?? null;
    const diet = dietId ? dietsById.get(dietId) ?? null : null;
    if (!diet) return generateDay({ day, diet: null, slots, pools, foods, prefs, usedIds: new Set(), mode });

    if (prefs.variety <= 2) {
      const template = perDietTemplate.get(diet.id);
      if (template) {
        return { ...template, day, meals: template.meals.map((m, i) => ({ ...m, id: `${day}_m${i + 1}` })) };
      }
      const generated = generateDay({ day, diet, slots, pools, foods, prefs, usedIds: new Set(), mode });
      perDietTemplate.set(diet.id, generated);
      return generated;
    }

    if (prefs.variety === 3) {
      const usedIds = perDietUsed.get(diet.id) ?? new Set<string>();
      perDietUsed.set(diet.id, usedIds);
      const usedDishTypes = perDietDishTypes.get(diet.id) ?? new Map<DishType, number>();
      perDietDishTypes.set(diet.id, usedDishTypes);
      return generateDay({ day, diet, slots, pools, foods, prefs, usedIds, usedDishTypes, mode });
    }

    return generateDay({ day, diet, slots, pools, foods, prefs, usedIds: globalUsed, usedDishTypes: globalDishTypes, mode });
  });
}

// ─── Tolerance ───────────────────────────────────────────────────────────────

export function dayTotals(day: MenuDay): BudgetVec {
  return day.meals.reduce((acc, m) => sumVec(acc, mealTotalExch(m)), { HC: 0, PROT: 0, GRASA: 0 });
}

export function dayGlobalDeviation(day: MenuDay): number {
  const totals = dayTotals(day);
  const targetTotal = day.target.HC + day.target.PROT + day.target.GRASA;
  const actualTotal = totals.HC + totals.PROT + totals.GRASA;
  return round2(actualTotal - targetTotal);
}

export function isDayWithinTolerance(day: MenuDay): boolean {
  if (day.meals.length === 0) return true; // free/unassigned day
  return Math.abs(dayGlobalDeviation(day)) <= 1;
}

// ─── Athlete-facing swap ─────────────────────────────────────────────────────

export type SwapFit = 'exacto' | 'aproximado';

export interface SwapCandidate extends MenuCandidate {
  fit: SwapFit;
  /** Cómo quedaría el día en cada macro si se acepta el cambio (actual − objetivo). */
  drift: BudgetVec;
  /** Lo mismo sobre la suma de los tres. */
  driftTotal: number;
}

// Hasta dónde puede moverse el DÍA al aceptar un cambio. El tope sobre el total
// es el que ya se exigía; el reparto POR MACRO es nuevo, y es el arreglo de
// fondo: antes solo se miraba la suma de los tres, así que una receta que
// cambiaba 3 de hidratos por 3 de grasa entraba en la lista rotulada "mantiene
// tus puntos del día". Medido contra el recetario real (8.850 recetas,
// 2026-09-05), el 65 % de las alternativas que se ofrecían para la comida se
// desviaban más de un intercambio en algún macro concreto, con picos de 2 sobre
// un presupuesto de 10,5 de HC. El tope crece con el presupuesto del día para no
// dejar sin alternativas a quien come poco, y el suelo evita que una categoría
// pequeña (grasa) quede tan encorsetada que no admita ninguna receta.
const SWAP_TOTAL_EXACTO = 1;
const SWAP_TOTAL_APROX = 2;
const SWAP_MACRO_MIN_EXACTO = 1;
const SWAP_MACRO_MIN_APROX = 1.5;
const SWAP_MACRO_PCT_EXACTO = 0.15;
const SWAP_MACRO_PCT_APROX = 0.25;

function swapMacroTol(budget: number, min: number, pct: number): number {
  return Math.max(min, budget * pct);
}

// Alternatives that, if substituted in, keep the *day's* deviation within
// tolerance — in each macro, not just in the sum. Uses the meal's current
// exchanges (recipe + its complements) as the matching target, since that's what
// the coach already approved for this slot.
//
// Devuelve TODAS las que encajan, no una terna corta: el atleta que abre
// "Cambiar comida" es justo el que no quiere lo que hay, y cortar la lista a
// cinco le dejaba fuera cientos de opciones válidas del recetario. Se etiquetan
// en dos niveles ('exacto' / 'aproximado') para que la pantalla pueda enseñarlas
// todas sin mentir sobre cuáles cuadran clavadas.
export function findSwapAlternatives(
  day: MenuDay,
  mealId: string,
  pool: Recipe[],
  prefs: GeneratorPrefs,
  count = Infinity,
  mode: DietMode = 'OMNIVORO',
): SwapCandidate[] {
  const meal = day.meals.find(m => m.id === mealId);
  if (!meal) return [];

  const mealTarget = mealTotalExch(meal);
  const otherMealsTotal = day.meals
    .filter(m => m.id !== mealId)
    .reduce((acc, m) => sumVec(acc, mealTotalExch(m)), { HC: 0, PROT: 0, GRASA: 0 });
  const targetTotal = day.target.HC + day.target.PROT + day.target.GRASA;
  const usedIds = new Set(day.meals.filter(m => m.id !== mealId).map(m => m.recipeId));

  const cats: (keyof BudgetVec)[] = ['HC', 'PROT', 'GRASA'];
  const tolExacto = { HC: 0, PROT: 0, GRASA: 0 } as BudgetVec;
  const tolAprox = { HC: 0, PROT: 0, GRASA: 0 } as BudgetVec;
  for (const cat of cats) {
    tolExacto[cat] = swapMacroTol(day.target[cat], SWAP_MACRO_MIN_EXACTO, SWAP_MACRO_PCT_EXACTO);
    tolAprox[cat] = swapMacroTol(day.target[cat], SWAP_MACRO_MIN_APROX, SWAP_MACRO_PCT_APROX);
  }

  const graded: SwapCandidate[] = [];
  for (const c of rankCandidates(pool, mealTarget, prefs, usedIds, { mode })) {
    const drift: BudgetVec = {
      HC: round2(otherMealsTotal.HC + c.exch.HC - day.target.HC),
      PROT: round2(otherMealsTotal.PROT + c.exch.PROT - day.target.PROT),
      GRASA: round2(otherMealsTotal.GRASA + c.exch.GRASA - day.target.GRASA),
    };
    const driftTotal = round2(
      otherMealsTotal.HC + c.exch.HC + otherMealsTotal.PROT + c.exch.PROT
      + otherMealsTotal.GRASA + c.exch.GRASA - targetTotal,
    );
    const dentroDe = (topeTotal: number, topeMacro: BudgetVec) =>
      Math.abs(driftTotal) <= topeTotal && cats.every(cat => Math.abs(drift[cat]) <= topeMacro[cat]);

    if (dentroDe(SWAP_TOTAL_EXACTO, tolExacto)) graded.push({ ...c, fit: 'exacto', drift, driftTotal });
    else if (dentroDe(SWAP_TOTAL_APROX, tolAprox)) graded.push({ ...c, fit: 'aproximado', drift, driftTotal });
    // Más allá de eso el cambio saca del plan: no se ofrece.
  }

  // Diversify by dish type so the athlete sees genuinely different options (a
  // batido, a tostada, a tortilla…) rather than variations of the same thing.
  //
  // Reparto en RONDA, no "el mejor de cada tipo y luego relleno por puntuación":
  // ese relleno volvía a ser monotemático en cuanto se agotaban los tipos nuevos,
  // justo en la parte de la lista donde mira quien no quiere nada de lo primero.
  // Misma regla que el "Cambiar comida" de Mi plan (utils/recipeMatch.ts). Se
  // hace DENTRO de cada nivel de encaje para que las exactas sigan yendo antes.
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

// ─── Periodization / staleness ───────────────────────────────────────────────

// A published menu goes stale when the client's weekly schedule or a linked
// diet's budget changes after generation (e.g. the coach moved to a new
// periodization phase). Compares each day's snapshot dietId/target against the
// current schedule + diets so the coach gets nudged to regenerate.
export function isMenuStale(
  menu: { days: MenuDay[] },
  schedule: Partial<Record<WeekDay, string | null>>,
  diets: Diet[],
): boolean {
  const dietsById = new Map(diets.map(d => [d.id, d]));
  for (const day of menu.days) {
    const currentDietId = schedule[day.day] ?? null;
    if (currentDietId !== day.dietId) return true;
    if (currentDietId) {
      const diet = dietsById.get(currentDietId);
      if (!diet) return true;
      const b = dietBudgetVec(diet);
      if (b.HC !== day.target.HC || b.PROT !== day.target.PROT || b.GRASA !== day.target.GRASA) return true;
    }
  }
  return false;
}
