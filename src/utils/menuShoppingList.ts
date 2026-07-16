import { MenuDay, Recipe } from '../types';
import { parseBaseGrams } from './exchangeHelpers';

// Aggregated weekly shopping list built from a published menu. Sums ingredient
// quantities across every meal of the week (recipe portions × scale, plus
// complements), grouped by ingredient name.
//
// Indya recipes carry a structured `ingredientsText` in grams — those aggregate
// cleanly. Builder recipes and complements only carry exchange quantities + a
// free-text portion label; we recover grams from the label when possible
// (parseBaseGrams), and otherwise fall back to listing the exchange count.

export interface ShoppingListItem {
  name: string;
  grams: number | null;       // total grams when known
  exchanges: number | null;   // total exchanges when grams can't be derived
  display: string;            // human-friendly amount, e.g. "1.2 kg" or "3 int."
}

function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// "150g patata (cruda o cocida)" → "patata (cruda o cocida)"; "1 manzana o 1 pera" → "manzana o 1 pera"
function labelToName(label: string): string {
  return label
    .replace(/^\s*\d+(?:[.,]\d+)?\s*(?:g|ml|cc|kg|l|ud|uds|unidad(?:es)?)?\s*(?:de\s+)?/i, '')
    .trim() || label.trim();
}

function fmtGrams(g: number): string {
  const r = Math.round(g);
  return r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)} kg` : `${r} g`;
}

interface Acc { name: string; grams: number; exchanges: number; hasGrams: boolean }

export function buildShoppingList(days: MenuDay[], recipesById: Map<string, Recipe>): ShoppingListItem[] {
  const acc = new Map<string, Acc>();

  const addGrams = (rawName: string, grams: number) => {
    const key = normalizeName(rawName);
    const cur = acc.get(key) ?? { name: rawName.trim(), grams: 0, exchanges: 0, hasGrams: true };
    cur.grams += grams;
    cur.hasGrams = true;
    acc.set(key, cur);
  };
  const addExchanges = (rawName: string, exchanges: number) => {
    const key = normalizeName(rawName);
    const cur = acc.get(key) ?? { name: rawName.trim(), grams: 0, exchanges: 0, hasGrams: false };
    cur.exchanges += exchanges;
    acc.set(key, cur);
  };

  for (const day of days) {
    for (const meal of day.meals) {
      const recipe = meal.recipeId ? recipesById.get(meal.recipeId) : undefined;
      if (recipe?.ingredientsText?.length) {
        for (const ing of recipe.ingredientsText) addGrams(ing.name, ing.quantity * meal.scale);
      } else if (recipe?.ingredients?.length) {
        for (const ing of recipe.ingredients) {
          const base = parseBaseGrams(ing.foodLabel);
          const name = labelToName(ing.foodLabel);
          if (base != null) addGrams(name, base * ing.quantity * meal.scale);
          else addExchanges(name, ing.quantity * meal.scale);
        }
      }
      // Complements are eaten fresh but still need buying.
      for (const comp of meal.complements) {
        const base = parseBaseGrams(comp.foodLabel);
        const name = labelToName(comp.foodLabel);
        if (base != null) addGrams(name, base * comp.quantity);
        else addExchanges(name, comp.quantity);
      }
    }
  }

  const items: ShoppingListItem[] = Array.from(acc.values()).map(a => ({
    name: a.name,
    grams: a.hasGrams ? Math.round(a.grams) : null,
    exchanges: a.hasGrams ? null : Math.round(a.exchanges * 100) / 100,
    display: a.hasGrams ? fmtGrams(a.grams) : `${Math.round(a.exchanges * 100) / 100} int.`,
  }));

  // Grams-known items first (sorted by weight), then exchange-only, alphabetical.
  return items.sort((x, y) => {
    if ((x.grams != null) !== (y.grams != null)) return x.grams != null ? -1 : 1;
    if (x.grams != null && y.grams != null) return y.grams - x.grams;
    return x.name.localeCompare(y.name);
  });
}
