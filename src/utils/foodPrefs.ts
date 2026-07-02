import type { Recipe } from '../types';

export function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function ingredientMatch(recipe: Recipe, food: string): boolean {
  const nFood = normalizeStr(food);
  if (!nFood) return false;
  return (recipe.ingredientsText ?? []).some(ing =>
    normalizeStr(ing.name).includes(nFood),
  );
}

export type RecipeClass = 'allergy' | 'featured' | 'disliked' | 'normal';

export function classifyRecipe(
  recipe: Recipe,
  liked: string[],
  disliked: string[],
  allergies: string[],
): RecipeClass {
  if (allergies.some(f => ingredientMatch(recipe, f))) return 'allergy';
  if (liked.some(f => ingredientMatch(recipe, f))) return 'featured';
  if (disliked.some(f => ingredientMatch(recipe, f))) return 'disliked';
  return 'normal';
}
