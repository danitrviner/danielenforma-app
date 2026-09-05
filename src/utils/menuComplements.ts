import { MealItem, DietMode, FoodCategory } from '../types';

// Los "extras" que acompañan al plato de una comida generada: lo que cierra el
// hueco entre lo que da la receta y lo que pide el día.
//
// Antes esto era una lista blanca de 69 alimentos —solo fruta, yogur y frutos
// secos— elegidos a dedo aquí. Con ella, "añade un punto de pan" era imposible:
// el pan no estaba, ni el arroz, ni la patata, ni la avena. Y solo había cuatro
// opciones de grasa para todo el recetario.
//
// Ahora el catálogo es el BANCO DE INTERCAMBIOS entero, que es donde ya vive esa
// información con sus gramos ("40g pan (de molde, tostado, con o sin
// semillas...)") y que el atleta ya usa en Intercambios. No hacía falta una
// segunda lista: hacía falta usar la que ya teníamos (Dani, 2026-09-05).
//
// La lista blanca no desaparece del todo, cambia de papel: ya no decide QUÉ
// puede ser un extra, solo ORDENA cuál se propone por defecto. Un extra que el
// generador pone solo debería ser algo que se resuelve abriendo la nevera; si el
// atleta prefiere ponerse arroz, lo cambia él.

const FRUIT_KEYWORDS = [
  'manzana', 'pera', 'platano', 'plátano', 'mandarina', 'kiwi', 'naranja',
  'fresa', 'frutos rojos', 'melon', 'melón', 'sandia', 'sandía', 'piña',
  'pina', 'ciruela', 'uva', 'melocoton', 'melocotón', 'paraguayo', 'higo',
  'datil', 'dátil', 'nectarina', 'albaricoque', 'cereza', 'papaya', 'mango',
  'caqui', 'castañas', 'castanas',
];

const DAIRY_KEYWORDS = ['yogur', 'yogurt', 'skyr', 'queso fresco', 'requeson', 'requesón', 'cottage'];

const NUT_KEYWORDS = ['frutos secos', 'puñado', 'punado', 'pipas', 'semillas', 'aceitunas', 'aguacate'];

/** Listo para comer sin cocinar: pan, tortitas, cereales… además de la fruta,
 *  el lácteo y el fruto seco de siempre. Es lo que se propone por defecto. */
const READY_HC_KEYWORDS = [
  'pan', 'tortitas de arroz', 'tortitas de maiz', 'cereales', 'corn flakes',
  'muesli', 'copos', 'frutas deshidratadas',
];

/** Azúcares y untables: siguen estando en el banco y el atleta puede elegirlos
 *  si quiere, pero el generador no los propone por su cuenta. "Añade 1,5
 *  raciones de mermelada" no es un consejo que deba dar una app de coaching
 *  sin que nadie se lo haya pedido. */
const NUNCA_AUTOMATICO = ['mermelada', 'miel', 'azucar', 'azúcar', 'dextrosa', 'chocolate', 'cacao'];

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function labelIncludesAny(label: string, keywords: string[]): boolean {
  const n = normalize(label);
  return keywords.some(k => n.includes(normalize(k)));
}

// True for simple, ready-to-eat items (fruit, bread, yogurt/skyr/fresh cheese,
// plain nuts) — deliberately excludes nut "creams"/spreads (those read more like
// a recipe ingredient) and anything that needs cooking.
export function isSimpleComplement(item: MealItem): boolean {
  const label = item.label;
  if (labelIncludesAny(label, ['crema de'])) return false;
  if (labelIncludesAny(label, NUNCA_AUTOMATICO)) return false;
  if (item.category === 'HC' && labelIncludesAny(label, [...FRUIT_KEYWORDS, ...READY_HC_KEYWORDS])) return true;
  if ((item.category === 'PROT' || item.category === 'MIX_HC') && labelIncludesAny(label, DAIRY_KEYWORDS)) return true;
  if (item.category === 'GRASA' && labelIncludesAny(label, NUT_KEYWORDS)) return true;
  return false;
}

/** Todo lo que el atleta puede elegir como extra: el banco entero de su modo de
 *  dieta. Ordenado con lo más "de abrir y comer" delante, que es lo que busca
 *  quien va justo de tiempo, pero sin esconder nada. */
export function complementosDisponibles(foods: MealItem[], mode: DietMode, category?: FoodCategory): MealItem[] {
  const propios = foods.filter(f => f.mode === mode && (category == null || encajaEnCategoria(f, category)));
  return [...propios].sort((a, b) => Number(isSimpleComplement(b)) - Number(isSimpleComplement(a)));
}

/** Un extra de PROT puede cubrirse con un MIX_HC (un yogur aporta media de
 *  proteína y media de hidratos): es la misma equivalencia que ya aplicaba
 *  `fillComplements`, extraída aquí para que la elija también el atleta. */
export function encajaEnCategoria(item: MealItem, category: FoodCategory): boolean {
  if (item.category === category) return true;
  return category === 'PROT' && item.category === 'MIX_HC';
}

/** Los que el generador propone por sí solo cuando nadie ha elegido nada. */
export function simpleComplementsFor(foods: MealItem[]): MealItem[] {
  return foods.filter(isSimpleComplement);
}
