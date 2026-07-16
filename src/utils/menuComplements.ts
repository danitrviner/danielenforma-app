import { MealItem } from '../types';

// Curated whitelist of "simple" complements a generated menu meal may add
// alongside its main recipe (a piece of fruit, a yogurt, a handful of nuts)
// to close the day's exchange gap without forcing an unrealistic recipe scale.
// Kept separate from menuEngine.ts so the keyword list can grow without
// touching generator logic. Matches against MealItem.label (the SYSTEM_FOODS
// verbatim portion text), not against recipe ingredients.

const FRUIT_KEYWORDS = [
  'manzana', 'pera', 'platano', 'plátano', 'mandarina', 'kiwi', 'naranja',
  'fresa', 'frutos rojos', 'melon', 'melón', 'sandia', 'sandía', 'piña',
  'pina', 'ciruela', 'uva', 'melocoton', 'melocotón', 'paraguayo', 'higo',
  'datil', 'dátil', 'nectarina', 'albaricoque', 'cereza', 'papaya', 'mango',
];

const DAIRY_KEYWORDS = ['yogur', 'yogurt', 'skyr', 'queso fresco'];

const NUT_KEYWORDS = ['frutos secos', 'puñado', 'punado'];

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function labelIncludesAny(label: string, keywords: string[]): boolean {
  const n = normalize(label);
  return keywords.some(k => n.includes(normalize(k)));
}

// True for simple, ready-to-eat items (fruit, yogurt/skyr/fresh cheese, plain
// nuts) — deliberately excludes anything that needs cooking or prep, and
// excludes nut "creams"/spreads (those read more like a recipe ingredient).
export function isSimpleComplement(item: MealItem): boolean {
  const label = item.label;
  if (labelIncludesAny(label, ['crema de'])) return false;
  if (item.category === 'HC' && labelIncludesAny(label, FRUIT_KEYWORDS)) return true;
  if ((item.category === 'PROT' || item.category === 'MIX_HC') && labelIncludesAny(label, DAIRY_KEYWORDS)) return true;
  if (item.category === 'GRASA' && labelIncludesAny(label, NUT_KEYWORDS)) return true;
  return false;
}

export function simpleComplementsFor(foods: MealItem[]): MealItem[] {
  return foods.filter(isSimpleComplement);
}
