import { FoodCategory, DietMode, DietItem, DietMeal, Diet, Recipe } from '../types';

// Shared constants + helpers for the food-exchange (intercambios) system.
// Extracted from NutritionScreen.tsx / NutritionPlansScreen.tsx, which duplicated
// these verbatim before "Mis Dietas" would have made it a third copy.

export const CATS: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];
// Only HC, PROT, GRASA appear in budget and live-distribution panels.
// MIX_HC / MIX_GRASA exist only at food-item level.
export const BUDGET_CATS: FoodCategory[] = ['HC', 'PROT', 'GRASA'];

export const CAT_LABEL: Record<FoodCategory, string> = {
  HC: 'HC', PROT: 'Proteína', GRASA: 'Grasa', MIX_HC: '½P+½HC', MIX_GRASA: '½P+½Grasa',
};

export const CAT_COLOR: Record<FoodCategory, string> = {
  HC: 'text-amber-300', PROT: 'text-blue-300', GRASA: 'text-orange-300',
  MIX_HC: 'text-violet-300', MIX_GRASA: 'text-pink-300',
};

export const CAT_BG: Record<FoodCategory, string> = {
  HC: 'bg-amber-500/10 border-amber-500/20',
  PROT: 'bg-blue-500/10 border-blue-500/20',
  GRASA: 'bg-orange-500/10 border-orange-500/20',
  MIX_HC: 'bg-violet-500/10 border-violet-500/20',
  MIX_GRASA: 'bg-pink-500/10 border-pink-500/20',
};

export const MODE_LABEL: Record<DietMode, string> = {
  OMNIVORO: 'Omnívoro', VEGANO: 'Vegano', SIN_PESAR: 'Sin pesar',
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function fmtQty(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return q.toFixed(2).replace(/\.?0+$/, '');
}

export function parseBaseGrams(label: string): number | null {
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(g|ml|cc|kg|l)\b/i);
  if (!m) return null;
  let val = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  if (u === 'kg') val *= 1000;
  if (u === 'l') val *= 1000;
  return val;
}

export function itemWeightLabel(foodLabel: string, qty: number): string {
  const base = parseBaseGrams(foodLabel);
  if (base == null) return `×${fmtQty(qty)}`;
  const g = Math.round(base * qty * 10) / 10;
  return g >= 1000 ? `${(g / 1000).toFixed(1)}kg` : `${g}g`;
}

// MIX_HC    → +0.5 HC    +0.5 PROT per exchange
// MIX_GRASA → +0.5 GRASA +0.5 PROT per exchange
export function addToPlaced(p: Record<FoodCategory, number>, category: FoodCategory, qty: number): void {
  if (category === 'MIX_HC') {
    p.HC   = round2(p.HC   + qty * 0.5);
    p.PROT = round2(p.PROT + qty * 0.5);
  } else if (category === 'MIX_GRASA') {
    p.GRASA = round2(p.GRASA + qty * 0.5);
    p.PROT  = round2(p.PROT  + qty * 0.5);
  } else {
    p[category] = round2(p[category] + qty);
  }
}

// Builds the DietItems to insert into a meal when a recipe is "added to Intercambios".
// Coach/athlete-built recipes carry a structured `ingredients` list (food-by-food,
// tagged per diet mode) — use that when present. Indya-imported recipes (the vast
// majority of the library) never populate `ingredients` (see scripts/importIndya.mjs);
// they only carry an aggregate `exchanges` total computed from their macros at import
// time, so fall back to one item per non-zero category, labeled with the recipe name.
// Total exchanges actually placed in a diet's meals, regardless of whether the
// athlete has checked them off as eaten (contrast with the daily "done" tracking
// in NutritionScreen, which is a different, date-scoped notion of progress).
export function computeDietPlaced(meals: DietMeal[] | undefined): Record<FoodCategory, number> {
  const p: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
  for (const meal of meals ?? []) for (const item of meal.items ?? []) addToPlaced(p, item.category, item.quantity);
  return p;
}

// A coach-dictated diet is "pending" until the athlete has placed enough food
// items to cover every category the coach budgeted for. Firestore docs aren't
// guaranteed to match the TS shape (older diets can predate a field) — guard
// against `budget`/`meals` being missing rather than trusting the type.
export function isDietPending(diet: Pick<Diet, 'budget' | 'meals'>): boolean {
  const placed = computeDietPlaced(diet.meals);
  return BUDGET_CATS.some(cat => (diet.budget?.[cat] ?? 0) > 0 && placed[cat] < (diet.budget?.[cat] ?? 0));
}

export function recipeToDietItems(recipe: Recipe, enabledModes: DietMode[]): DietItem[] {
  // Indya-imported recipes (the vast majority) never populate `ingredients` at all —
  // it's not just empty, it's absent — so don't assume the array exists.
  const structured: DietItem[] = (recipe.ingredients ?? [])
    .filter(ing => enabledModes.includes(ing.mode))
    .map(ing => ({ category: ing.category, foodLabel: ing.foodLabel, quantity: ing.quantity, originRecipeId: recipe.id }));
  if (structured.length > 0) return structured;

  if (recipe.exchanges) {
    return BUDGET_CATS
      .filter(cat => (recipe.exchanges![cat] ?? 0) > 0)
      .map(cat => ({ category: cat, foodLabel: recipe.name, quantity: recipe.exchanges![cat], originRecipeId: recipe.id }));
  }

  return [];
}
