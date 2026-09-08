import type { Recipe, DietType } from '../types';
import { violatesRestrictions, violatesHealthConditions } from './dietaryRestrictions';
import { normalizarTexto } from './busqueda';

/** Alias histórico de `normalizarTexto` (utils/busqueda). Había tres copias del
 *  mismo criterio y dos se dejaban los espacios de sobra sin colapsar, que es
 *  justo lo que rompe con los nombres del recetario importado (" Fideos de
 *  arroz…", "…y tomate\n"). */
export const normalizeStr = normalizarTexto;

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
  // Las condiciones de salud (celiaquía, intolerancias…) se clasifican como
  // 'allergy' a propósito: para quien mira la pantalla son lo mismo —una receta
  // que no puede comerse— y así todos los sitios que ya escondían o marcaban
  // los alérgenos hacen lo correcto sin cambiar su lógica.
  conditions: readonly number[] = [],
): RecipeClass {
  if (violatesHealthConditions(recipe, conditions)) return 'allergy';
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

/**
 * Qué régimen alimentario rige: el que el atleta haya corregido en su perfil y,
 * si no, el que contestó en el alta.
 *
 * Existe por un `??` que dejaba pasar la cadena vacía. `AthleteNutritionConfig`
 * guarda `dietType: ''` cuando nunca se ha tocado, y `'' ?? 'vegano'` es `''`:
 * unas pantallas leían "sin régimen" (y no filtraban nada) mientras el recetario
 * leía directamente el alta y sí filtraba. Resultado: la misma receta salía en
 * una pantalla y no en otra, sin nada que lo explicara (Dani, 07-09-2026, con la
 * cuenta danielbriz8 marcada como vegana).
 */
export function dietTypeVigente(
  delPerfil: DietType | '' | undefined | null,
  delAlta: DietType | undefined | null,
): DietType | undefined {
  return (delPerfil || delAlta) || undefined;
}
