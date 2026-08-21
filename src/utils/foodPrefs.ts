import type { Recipe, DietType } from '../types';
import { violatesRestrictions } from './dietaryRestrictions';

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

const MEAT_FISH_KEYWORDS = [
  'pollo', 'ternera', 'cerdo', 'pavo', 'cordero', 'pescado', 'atun', 'salmon',
  'merluza', 'gamba', 'marisco', 'jamon', 'bacon', 'panceta', 'chorizo', 'conejo', 'pato',
];
const ANIMAL_KEYWORDS = [...MEAT_FISH_KEYWORDS, 'huevo', 'leche', 'queso', 'yogur', 'mantequilla', 'nata', 'miel'];

// Primero mira `restrictions` (los códigos `forbiddenFor` del proveedor del
// recetario, ver dietaryRestrictions.ts) — es un dato explícito, más fiable
// que adivinar. Solo cae a la heurística de palabras clave cuando la receta no
// tiene `restrictions` (recetas importadas antes de que se recuperara ese
// campo, o recetas del constructor sin `ingredientsText`); el coach revisa el
// borrador antes de publicarlo de todas formas, así que dejarlas pasar sin
// filtrar es aceptable.
//
// Vivía en menuEngine.ts. Se movió aquí para que el buscador de alternativas
// (recipeMatch) pueda aplicar el mismo filtro sin un import circular: menuEngine
// ya importa fitScore de recipeMatch.
export function violatesDietType(recipe: Recipe, dietType?: DietType): boolean {
  if (!dietType || dietType === 'omnivoro' || dietType === 'otro') return false;
  if (violatesRestrictions(recipe.restrictions, dietType)) return true;
  if (recipe.restrictions && recipe.restrictions.length > 0) return false; // dato explícito y no dice que viole nada
  const text = (recipe.ingredientsText ?? []).map(i => normalizeStr(i.name)).join(' ');
  if (!text) return false;
  const keywords = dietType === 'vegano' ? ANIMAL_KEYWORDS : MEAT_FISH_KEYWORDS;
  return keywords.some(k => text.includes(normalizeStr(k)));
}
