import { Recipe } from '../types';

/* Cuánto se tarda en hacer una receta, en MINUTOS.
 *
 * El recetario importado no guarda minutos: guarda `cookingTime` como un índice
 * de 1 a 4, y además INVERTIDO — 4 es lo más rápido y 1 lo más lento. El código
 * lo comparaba directamente contra los minutos que elige el atleta
 * (`cookingMaxTime`: 15, 30, 45, 60, 90), y como 4 nunca es mayor que 15, el
 * filtro descartaba CERO recetas: la pregunta "¿cuánto tiempo puedes dedicarle a
 * una receta?" no hacía absolutamente nada (encontrado el 2026-09-05).
 *
 * La escala se calibró contra los minutos que las propias recetas declaran en
 * sus pasos ("durante 10 minutos"), sobre las 8.850:
 *
 *   índice │  n     │ declaran min │ mediana │ p75 │ p90 │ pasos │ ingredientes
 *   ───────┼────────┼──────────────┼─────────┼─────┼─────┼───────┼─────────────
 *     4    │ 3.649  │     7 %      │    8    │ 10  │ 20  │  2,8  │     3,6
 *     3    │ 2.869  │    45 %      │   10    │ 18  │ 23  │  5,8  │     6,8
 *     2    │ 1.765  │    80 %      │   22    │ 30  │ 45  │  7,2  │     8,4
 *     1    │   567  │    67 %      │   40    │ 57  │ 70  │  7,6  │     8,4
 *
 * Monótono y coherente con el contenido: el índice 4 son bocadillos y sándwiches
 * (2,8 pasos, casi sin cocción) y el 1 son platos de horno y olla.
 *
 * Los minutos asignados salen del p75 de cada tramo, no de la mediana, por dos
 * motivos: los pasos solo declaran el tiempo de COCCIÓN (no el de picar, pelar o
 * recoger), y solo el 7 % de las del índice 4 declara alguno. Quedarse corto
 * sería peor que pasarse: colaría en "15 minutos" recetas que no lo son, que es
 * justo el problema que el atleta quería evitar al contestar.
 */

/** Índice 1-4 del recetario importado → minutos estimados (p75 del tramo). */
const MINUTOS_POR_INDICE: Record<number, number> = {
  4: 10,   // bocadillo, sándwich, batido: montar y comer
  3: 20,   // sartén o plancha rápida
  2: 35,   // horno o guiso corto
  1: 60,   // horno largo, olla, repostería
};

/** Por encima de esto, el valor ya son minutos de verdad y no el índice. Las
 *  recetas del constructor del entrenador no traen `cookingTime`, pero si algún
 *  día lo trajeran en minutos, esto evita leer un "45" como si fuera un índice. */
const MAX_INDICE = 4;

/**
 * Minutos estimados de una receta, o `null` si no hay dato — en cuyo caso no se
 * puede filtrar por tiempo y la receta se admite (mejor ofrecerla que esconderla
 * por un dato que falta).
 */
export function minutosDeReceta(recipe: Pick<Recipe, 'cookingTime'>): number | null {
  const v = recipe.cookingTime;
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v > MAX_INDICE) return v;                 // ya viene en minutos
  return MINUTOS_POR_INDICE[Math.round(v)] ?? null;
}

/** `true` si la receta se pasa del tiempo que el atleta dijo tener. */
export function superaElTiempo(recipe: Pick<Recipe, 'cookingTime'>, maxMinutos?: number): boolean {
  if (maxMinutos == null) return false;
  const minutos = minutosDeReceta(recipe);
  return minutos != null && minutos > maxMinutos;
}
