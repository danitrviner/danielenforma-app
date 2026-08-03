/**
 * Primitivas del Design System.
 *
 * Punto de entrada único: las pantallas importan de `components/ui`, nunca del
 * archivo suelto. Eso es lo que permitirá mover, renombrar o partir una
 * primitiva sin tocar quien la usa.
 *
 * En F7 nadie importa de aquí todavía salvo el escaparate: la fase construye
 * las piezas y las deja probadas: la adopción en pantallas reales es F8, y la
 * de los 39 overlays artesanales, F9.
 */

export { default as Icon } from './Icon';
export type { IconSize } from './Icon';
