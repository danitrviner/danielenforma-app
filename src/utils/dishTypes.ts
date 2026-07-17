import { Recipe } from '../types';
import { normalizeStr } from './foodPrefs';

// Heuristic "dish type" classification so the menu can offer variety filters
// (batidos, tostadas, arroces, pastas…) and stop serving the same kind of meal
// every day. Indya recipes only carry a coarse `categoria`, so the real signal
// is the recipe name; we fall back to categoria when the name is inconclusive.

export type DishType =
  | 'batido' | 'avena' | 'yogur' | 'tortilla' | 'tostada'
  | 'ensalada' | 'sopa' | 'arroz' | 'pasta' | 'legumbre'
  | 'pescado' | 'carne' | 'dulce' | 'otro';

export interface DishTypeSpec { id: DishType; label: string; icon: string }

export const DISH_TYPES: DishTypeSpec[] = [
  { id: 'batido',   label: 'Batidos',            icon: 'blender' },
  { id: 'avena',    label: 'Avena y tortitas',   icon: 'breakfast_dining' },
  { id: 'yogur',    label: 'Yogures y bowls',    icon: 'icecream' },
  { id: 'tortilla', label: 'Huevos y tortillas', icon: 'egg' },
  { id: 'tostada',  label: 'Tostadas y bocatas', icon: 'lunch_dining' },
  { id: 'ensalada', label: 'Ensaladas',          icon: 'grass' },
  { id: 'sopa',     label: 'Sopas y cremas',     icon: 'soup_kitchen' },
  { id: 'arroz',    label: 'Arroces',            icon: 'rice_bowl' },
  { id: 'pasta',    label: 'Pastas',             icon: 'ramen_dining' },
  { id: 'legumbre', label: 'Legumbres',          icon: 'grain' },
  { id: 'pescado',  label: 'Pescados',           icon: 'set_meal' },
  { id: 'carne',    label: 'Carnes',             icon: 'kebab_dining' },
  { id: 'dulce',    label: 'Dulces y postres',   icon: 'cake' },
  { id: 'otro',     label: 'Otros',              icon: 'restaurant' },
];

const DISH_LABEL = new Map(DISH_TYPES.map(d => [d.id, d.label]));
export function dishTypeLabel(t: string): string {
  return DISH_LABEL.get(t as DishType) ?? 'Otros';
}

// Ordered most-specific → most-generic; the first keyword hit wins. Format-defining
// types (ensalada, sopa, arroz…) come before protein keywords so "Ensalada de pollo"
// reads as an ensalada, not a carne.
const KEYWORDS: [DishType, string[]][] = [
  ['batido',   ['batido', 'smoothie', 'shake']],
  ['avena',    ['avena', 'porridge', 'oatmeal', 'tortita', 'pancake', 'crepe', 'gofre', 'waffle', 'muesli', 'granola', 'cereales']],
  ['yogur',    ['yogur', 'yogurt', 'skyr', 'pudding']],
  ['tortilla', ['tortilla', 'revuelto', 'omelette', 'huevos']],
  ['tostada',  ['tostada', 'tosta', 'bocadillo', 'bocata', 'sandwich', 'montadito', 'wrap', 'pan con']],
  ['ensalada', ['ensalada', 'salad']],
  ['sopa',     ['sopa', 'crema de', 'pure', 'gazpacho', 'caldo']],
  ['arroz',    ['arroz', 'risotto', 'paella', 'sushi', 'poke']],
  ['pasta',    ['pasta', 'espagueti', 'macarrones', 'tallarines', 'fideos', 'lasana', 'canelones', 'noqui', 'raviol', 'bolonesa']],
  ['legumbre', ['lenteja', 'garbanzo', 'alubia', 'judia', 'hummus', 'frijol']],
  ['pescado',  ['salmon', 'atun', 'merluza', 'bacalao', 'pescado', 'gamba', 'marisco', 'lubina', 'dorada', 'sardina', 'trucha', 'langostino', 'calamar', 'pulpo']],
  ['carne',    ['pollo', 'ternera', 'cerdo', 'pavo', 'carne', 'filete', 'hamburguesa', 'albondiga', 'lomo', 'solomillo', 'chuleta', 'costilla']],
  ['dulce',    ['tarta', 'galleta', 'bizcocho', 'muffin', 'brownie', 'postre', 'mousse', 'natilla', 'flan', 'helado', 'donut']],
];

export function dishType(recipe: Recipe): DishType {
  const name = normalizeStr(recipe.name);
  for (const [type, kws] of KEYWORDS) {
    if (kws.some(k => name.includes(normalizeStr(k)))) return type;
  }
  const cat = normalizeStr(recipe.categoria ?? '');
  if (cat.includes('bebida') || cat.includes('suplemento')) return 'batido';
  if (cat.includes('dulce')) return 'dulce';
  return 'otro';
}
