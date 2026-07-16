import {
  Recipe, MealItem, Diet, WeekDay, DietType, DietMode, FoodCategory,
  BudgetVec, MenuDay, MenuMeal, MenuComplement,
} from '../types';
import { addToPlaced, round2 } from './exchangeHelpers';
import { ingredientMatch, normalizeStr } from './foodPrefs';
import { fitScore } from './recipeMatch';
import { exchangeToKcal } from './nutritionConstants';
import { simpleComplementsFor } from './menuComplements';

// Pure, framework-free generator for recipe-first weekly menus. Reads its
// daily point budget from the client's already-configured exchange-type diets
// (Diet.budget + AthleteDietConfig.weeklySchedule) — see WeeklyMenuEditor.tsx
// for how the pieces are wired together with Firestore reads.

export const MENU_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const rQ = (x: number) => Math.round(x / 0.25) * 0.25;

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

const FALLBACK_SLOTS: Record<3 | 4 | 5, MealSlotSpec[]> = {
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

// Indya recipes carry a reliable intakeTypes tag; builder recipes (coach/athlete)
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

export function slotTargets(dayBudget: BudgetVec, slots: MealSlotSpec[]): BudgetVec[] {
  return slots.map(sl => ({
    HC: rQ(dayBudget.HC * sl.pct / 100),
    PROT: rQ(dayBudget.PROT * sl.pct / 100),
    GRASA: rQ(dayBudget.GRASA * sl.pct / 100),
  }));
}

// ─── Recipe → exchanges ──────────────────────────────────────────────────────

// Indya recipes carry a precomputed aggregate; coach/athlete builder recipes
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
): { scale: number; exch: BudgetVec; score: number } | null {
  const base = recipeExchanges(recipe, mode);
  if (!base) return null;
  const baseTotal = base.HC + base.PROT + base.GRASA;
  const targetTotal = target.HC + target.PROT + target.GRASA;
  if (baseTotal <= 0 || targetTotal <= 0) return null;

  const idealScale = targetTotal / baseTotal;
  if (idealScale < MENU_SCALES[0] || idealScale > MENU_SCALES[MENU_SCALES.length - 1]) return null;

  let best: { scale: number; exch: BudgetVec; score: number } | null = null;
  for (const scale of MENU_SCALES) {
    const exch: BudgetVec = { HC: round2(base.HC * scale), PROT: round2(base.PROT * scale), GRASA: round2(base.GRASA * scale) };
    const score = fitScore(target, exch);
    if (!best || score < best.score) best = { scale, exch, score };
  }
  return best;
}

const MEAT_FISH_KEYWORDS = [
  'pollo', 'ternera', 'cerdo', 'pavo', 'cordero', 'pescado', 'atun', 'salmon',
  'merluza', 'gamba', 'marisco', 'jamon', 'bacon', 'panceta', 'chorizo', 'conejo', 'pato',
];
const ANIMAL_KEYWORDS = [...MEAT_FISH_KEYWORDS, 'huevo', 'leche', 'queso', 'yogur', 'mantequilla', 'nata', 'miel'];

// Heuristic only — Indya recipes have no explicit vegan/vegetarian flag, so
// this checks the free-text ingredient list. Recipes without ingredientsText
// (most builder recipes) can't be verified this way and are let through
// unfiltered; the coach reviews the draft before publishing regardless.
function violatesDietType(recipe: Recipe, dietType?: DietType): boolean {
  if (!dietType || dietType === 'omnivoro' || dietType === 'otro') return false;
  const text = (recipe.ingredientsText ?? []).map(i => normalizeStr(i.name)).join(' ');
  if (!text) return false;
  const keywords = dietType === 'vegano' ? ANIMAL_KEYWORDS : MEAT_FISH_KEYWORDS;
  return keywords.some(k => text.includes(normalizeStr(k)));
}

export interface RankOptions {
  needsTupper?: boolean;
  mode?: DietMode;
}

// Hard filters (never appear in output): allergies, dietType violations,
// cooking time over the athlete's max. Soft signals (nudge the ranking):
// liked/disliked ingredients, tupper fit, and repetition per `usedIds`.
export function rankCandidates(
  pool: Recipe[],
  target: BudgetVec,
  prefs: GeneratorPrefs,
  usedIds: ReadonlySet<string>,
  opts: RankOptions = {},
): MenuCandidate[] {
  const mode = opts.mode ?? 'OMNIVORO';
  const safe = pool.filter(r =>
    !prefs.allergies.some(f => ingredientMatch(r, f)) &&
    !violatesDietType(r, prefs.dietType) &&
    !(prefs.cookingMaxTime != null && r.cookingTime != null && r.cookingTime > prefs.cookingMaxTime),
  );

  const scored: MenuCandidate[] = [];
  for (const recipe of safe) {
    const fit = bestScaleFit(recipe, target, mode);
    if (!fit) continue;
    let score = fit.score;
    if (prefs.disliked.some(f => ingredientMatch(recipe, f))) score += 2;
    if (prefs.liked.some(f => ingredientMatch(recipe, f))) score -= 0.5;
    if (opts.needsTupper && recipe.tupper) score -= 0.5;
    if (usedIds.has(recipe.id)) score += 5; // strong nudge away, not a hard block
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
    const need = gap[cat];
    if (need < 0.5) continue;
    const candidates = simple.filter(f => f.category === cat || (cat === 'PROT' && f.category === 'MIX_HC'));
    if (candidates.length === 0) continue;
    const food = candidates[Math.floor(Math.random() * candidates.length)];
    const qty = Math.min(2, Math.floor(need * 2) / 2);
    if (qty >= 0.5) result.push({ foodLabel: food.label, category: food.category, quantity: qty });
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

export interface GenerateDayArgs {
  day: WeekDay;
  diet: Diet | null; // null = free/unassigned day, no meals generated
  slots: MealSlotSpec[];
  pools: Record<number, Recipe[]>; // recipe candidates keyed by slot (intakeType)
  foods: MealItem[];
  prefs: GeneratorPrefs;
  usedIds: Set<string>; // mutated in place to track variety across days
  mode?: DietMode;
}

export function generateDay(args: GenerateDayArgs): MenuDay {
  const { day, diet, slots, pools, foods, prefs, usedIds } = args;
  const mode = args.mode ?? 'OMNIVORO';

  if (!diet) {
    return { day, dietId: null, target: { HC: 0, PROT: 0, GRASA: 0 }, meals: [] };
  }

  const target: BudgetVec = { HC: diet.budget.HC ?? 0, PROT: diet.budget.PROT ?? 0, GRASA: diet.budget.GRASA ?? 0 };
  const targets = slotTargets(target, slots);

  const meals: MenuMeal[] = slots.map((slot, i) => {
    const pool = pools[slot.slot] ?? [];
    const ranked = rankCandidates(pool, targets[i], prefs, usedIds, { needsTupper: slot.needsTupper, mode });
    const pick = ranked[0];
    const id = `${day}_m${i + 1}`;
    if (!pick) {
      return { id, slot: slot.slot, name: slot.name, recipeId: '', recipeName: 'Sin receta disponible', scale: 1, exch: { HC: 0, PROT: 0, GRASA: 0 }, kcal: 0, complements: [] };
    }
    usedIds.add(pick.recipe.id);
    const meal: MenuMeal = {
      id, slot: slot.slot, name: slot.name,
      recipeId: pick.recipe.id, recipeName: pick.recipe.name,
      recipeImage: pick.recipe.image ?? pick.recipe.photoUrl,
      scale: pick.scale, exch: pick.exch, kcal: 0, complements: [],
    };
    meal.kcal = mealKcal(meal);
    return meal;
  });

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

// ─── Week generation ─────────────────────────────────────────────────────────

export interface GenerateWeekArgs {
  schedule: Partial<Record<WeekDay, string | null>>;
  diets: Diet[];
  slots: MealSlotSpec[];
  pools: Record<number, Recipe[]>;
  foods: MealItem[];
  prefs: GeneratorPrefs;
  mode?: DietMode;
}

// Variety semantics (prefs.variety):
//  1-2  monotone   — one generation per diet type (e.g. "Día Alto"), cloned to
//                     every day scheduled with that type.
//  3    balanced   — no repeated recipe within the same diet type, but the
//                     same recipe may reappear across different diet types.
//  4-5  max variety — no repeated recipe anywhere in the week.
export function generateWeek(args: GenerateWeekArgs): MenuDay[] {
  const { schedule, diets, slots, pools, foods, prefs } = args;
  const mode = args.mode ?? 'OMNIVORO';
  const dietsById = new Map(diets.map(d => [d.id, d]));

  const globalUsed = new Set<string>();
  const perDietUsed = new Map<string, Set<string>>();
  const perDietTemplate = new Map<string, MenuDay>();

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
      return generateDay({ day, diet, slots, pools, foods, prefs, usedIds, mode });
    }

    return generateDay({ day, diet, slots, pools, foods, prefs, usedIds: globalUsed, mode });
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

// Alternatives that, if substituted in, keep the *day's* global deviation
// within tolerance — not just a like-for-like match on the single meal. Uses
// the meal's current exchanges (recipe + its complements) as the matching
// target, since that's what the coach already approved for this slot.
export function findSwapAlternatives(
  day: MenuDay,
  mealId: string,
  pool: Recipe[],
  prefs: GeneratorPrefs,
  count = 5,
  mode: DietMode = 'OMNIVORO',
): MenuCandidate[] {
  const meal = day.meals.find(m => m.id === mealId);
  if (!meal) return [];

  const mealTarget = mealTotalExch(meal);
  const otherMealsTotal = day.meals
    .filter(m => m.id !== mealId)
    .reduce((acc, m) => sumVec(acc, mealTotalExch(m)), { HC: 0, PROT: 0, GRASA: 0 });
  const targetTotal = day.target.HC + day.target.PROT + day.target.GRASA;
  const usedIds = new Set(day.meals.filter(m => m.id !== mealId).map(m => m.recipeId));

  const ranked = rankCandidates(pool, mealTarget, prefs, usedIds, { mode });

  return ranked
    .filter(c => {
      const newTotal = otherMealsTotal.HC + c.exch.HC + otherMealsTotal.PROT + c.exch.PROT + otherMealsTotal.GRASA + c.exch.GRASA;
      return Math.abs(newTotal - targetTotal) <= 1;
    })
    .slice(0, count);
}
