// Subir la ración de un ingrediente que la receta YA lleva, en vez de colgarle
// un alimento suelto al lado.
//
// El caso que lo motiva (Dani, 2026-09-05): si a un "arroz con pollo" le faltan
// hidratos, lo natural es echar más arroz — no añadir dos tostadas. Y si le
// falta proteína, más pollo. Medido contra el recetario real, el 79,3 % de las
// 8.850 recetas llevan al menos un ingrediente que se puede subir así.
//
// Reparto de responsabilidades, a propósito: aquí se escribe SOLO cómo se llama
// cada cosa en las recetas (el mapeo lingüístico). Cuántos gramos son un
// intercambio y de qué categoría lo dice el BANCO, buscando la etiqueta por su
// texto exacto. Escribí esta tabla a mano la primera vez y tenía tres errores de
// nutrición —las legumbres puestas como HC cuando son MIX_HC, el huevo y el tofu
// como PROT cuando son MIX_GRASA—, que habrían llegado a los clientes con los
// macros mal. Un test comprueba que cada etiqueta de aquí abajo sigue existiendo
// en el banco, para que renombrar un alimento no rompa esto en silencio.
import { MealItem, FoodCategory, DietMode } from '../types';
import { parseBaseGrams, foodNameWithoutGrams } from './exchangeHelpers';
import { normalizeStr } from './foodPrefs';

/** Un ingrediente base que tiene sentido servir en más cantidad. */
interface Escalable {
  /** Cómo aparece en las recetas. Se prueba contra el nombre del ingrediente. */
  patron: RegExp;
  /** Etiqueta EXACTA del banco de la que salen categoría y gramos. */
  etiqueta: string;
  /** Cómo se le llama al atleta ("más arroz"). */
  nombre: string;
}

// Solo ingredientes que se sirven a cucharadas y aportan el grueso de un macro.
// Nada de condimentos, ni de verduras (libres en intercambios), ni de cosas que
// no se escalan solas: una loncha más de jamón no es "más ración".
const ESCALABLES: Escalable[] = [
  { patron: /\barroz\b/, etiqueta: '30g arroz, pasta, couscous o quinoa', nombre: 'arroz' },
  { patron: /\bpasta\b|espagueti|macarr|fideo|tallarin|penne|lasa[ñn]a/, etiqueta: '30g arroz, pasta, couscous o quinoa', nombre: 'pasta' },
  { patron: /quinoa|couscous|cuscus|c[uú]scus/, etiqueta: '30g arroz, pasta, couscous o quinoa', nombre: 'quinoa' },
  { patron: /\bpatata/, etiqueta: '150g patata (cruda o cocida)', nombre: 'patata' },
  { patron: /boniato/, etiqueta: '120g boniato', nombre: 'boniato' },
  { patron: /\bpan\b|\bpan de\b|pan de molde|barrita de pan/, etiqueta: '40g pan (de molde, tostado, con o sin semillas...)', nombre: 'pan' },
  { patron: /avena|copos de|corn ?flakes|muesli/, etiqueta: '30g cereales (corn flakes, muesli, copos...)', nombre: 'avena' },
  { patron: /lenteja|garbanzo|alubia|jud[ií]a blanca|frijol|legumbre/, etiqueta: '100g legumbre cocida', nombre: 'legumbre' },
  { patron: /\bpollo\b|\bpavo\b|pechuga/, etiqueta: '100g carne blanca sin piel (pollo, pavo...)', nombre: 'pollo' },
  { patron: /ternera|vacuno|solomillo|magro de|carne picada/, etiqueta: '80g carne roja magra (sin grasa)', nombre: 'ternera' },
  { patron: /merluza|bacalao|lubina|dorada|pescado blanco|panga|rape/, etiqueta: '120g pescado blanco (merluza, bacalao, lubina...)', nombre: 'pescado' },
  { patron: /\bat[uú]n\b/, etiqueta: '100g atún claro al natural (2 latas)', nombre: 'atún' },
  { patron: /seit[áa]n/, etiqueta: '80g seitán', nombre: 'seitán' },
  { patron: /soja texturizada|heura/, etiqueta: '30g soja texturizada', nombre: 'soja texturizada' },
  { patron: /\btofu\b/, etiqueta: '100g tofu magro (menos de 115kcal a los 100g)', nombre: 'tofu' },
  { patron: /aceite/, etiqueta: '10ml (1 cuchara) aceite (preferible AOVE)', nombre: 'aceite' },
  { patron: /aguacate|guacamole/, etiqueta: '60g aguacate o guacamole', nombre: 'aguacate' },
  { patron: /frutos secos|almendra|nuez|nueces|anacardo|pistacho|avellana/, etiqueta: '15g frutos secos sin freír (cualquier fruto seco)', nombre: 'frutos secos' },
];

/** Las etiquetas del banco que esta tabla necesita (lo usa el test). */
export const ETIQUETAS_ESCALABLES: string[] = [...new Set(ESCALABLES.map(e => e.etiqueta))];

export interface IngredienteEscalable {
  /** Nombre tal cual viene en la receta ("Pechuga de pollo"). */
  nombreEnReceta: string;
  /** Cómo llamarlo al atleta ("pollo"). */
  nombre: string;
  category: FoodCategory;
  /** Gramos que hay que añadir por cada intercambio. Del banco. */
  gramosPorIntercambio: number;
}

/**
 * Los ingredientes de una receta que se pueden servir en más cantidad, con los
 * gramos por intercambio sacados del banco del atleta.
 *
 * Se descarta lo que el banco no sepa cuantificar en gramos: el huevo, por
 * ejemplo, está como "1 huevo grande o 2 pequeños" y no hay forma de decir
 * "añade 0,75 huevos" sin inventarse un peso. Antes que dar un gramaje a ojo,
 * ese ingrediente no se ofrece y el hueco lo cierra un acompañamiento.
 */
export function ingredientesEscalables(
  ingredientes: { name: string }[] | undefined,
  foods: MealItem[],
  mode: DietMode = 'OMNIVORO',
): IngredienteEscalable[] {
  if (!ingredientes?.length) return [];
  const banco = new Map(foods.filter(f => f.mode === mode).map(f => [f.label, f]));
  const out: IngredienteEscalable[] = [];
  const vistos = new Set<string>();

  for (const ing of ingredientes) {
    const n = normalizeStr(ing.name ?? '');
    if (!n) continue;
    const match = ESCALABLES.find(e => e.patron.test(n));
    if (!match || vistos.has(match.etiqueta)) continue;
    const entrada = banco.get(match.etiqueta);
    if (!entrada) continue;                       // el banco de este atleta no lo tiene
    const gramos = parseBaseGrams(entrada.label);
    if (gramos == null || gramos <= 0) continue;  // sin gramos no se puede decir cuánto añadir
    vistos.add(match.etiqueta);
    out.push({
      nombreEnReceta: ing.name,
      nombre: match.nombre,
      category: entrada.category,
      gramosPorIntercambio: gramos,
    });
  }
  return out;
}

/** "arroz" → "+60g de arroz". Para pintar la sugerencia. */
export function textoDeRacionExtra(ing: IngredienteEscalable, intercambios: number): string {
  const gramos = Math.round(ing.gramosPorIntercambio * intercambios);
  return `+${gramos}g de ${ing.nombre}`;
}

/** Etiqueta del banco a la que corresponde un escalable, para depurar. */
export function etiquetaDelBanco(nombreIngrediente: string): string | null {
  const n = normalizeStr(nombreIngrediente ?? '');
  return ESCALABLES.find(e => e.patron.test(n))?.etiqueta ?? null;
}

export { foodNameWithoutGrams };
