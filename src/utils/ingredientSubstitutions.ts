import { FOOD_GROUPS } from '../data/alimentos_anamnesis';
import { normalizeStr } from './foodPrefs';

// Group-based ingredient substitution (approximate equivalence). The athlete can
// swap an ingredient of a recipe for another food from the SAME anamnesis food
// group — e.g. leche → kéfir / bebida vegetal, arroz blanco → quinoa. We treat
// same-group foods as roughly interchangeable, so the meal's exchanges/kcal are
// left unchanged; for exact macro-matched swaps a future version would rescale.

function matchFoodInGroup(ingredientName: string): { groupId: string; groupName: string; food: string } | null {
  const n = normalizeStr(ingredientName);
  if (!n) return null;
  for (const g of FOOD_GROUPS) {
    for (const food of g.foods) {
      const nf = normalizeStr(food);
      // Either direction: "leche entera" includes "leche", or the ingredient text
      // is a substring of the catalog entry.
      if (n.includes(nf) || nf.includes(n)) return { groupId: g.id, groupName: g.name, food };
    }
  }
  return null;
}

// The food group an ingredient belongs to, if recognized (null = not swappable).
export function findFoodGroup(ingredientName: string): { id: string; name: string } | null {
  const m = matchFoodInGroup(ingredientName);
  return m ? { id: m.groupId, name: m.groupName } : null;
}

// Same-group equivalents the athlete can swap this ingredient for (excludes the
// matched food itself). Empty when the ingredient isn't in any known group.
export function substitutesFor(ingredientName: string, max = 8): string[] {
  const m = matchFoodInGroup(ingredientName);
  if (!m) return [];
  const group = FOOD_GROUPS.find(g => g.id === m.groupId);
  if (!group) return [];
  const matchedNorm = normalizeStr(m.food);
  return group.foods.filter(f => normalizeStr(f) !== matchedNorm).slice(0, max);
}
