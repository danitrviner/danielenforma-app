import type { DietItem, Macros, Recipe } from '../types.js';
import { macrosDeReceta } from './macrosDeReceta.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Usar receta» en el diario (11-2026)

   Dani: «cuando le doy a la receta me la vuelca automáticamente, no me enseña
   la receta ni la preparación, ni me deja modificar las cantidades». Y la
   pregunta previa («¿que cuadre en la comida o en el día?») ya no tiene
   sentido: se ven todas y se ajusta después, en la ficha.

   Aquí vive la lógica pura de esa ficha: qué ración cabe en lo que queda, cómo
   se marca cada receta en la lista y cómo se retoca un ingrediente suelto.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PASO_RACION = 0.25;
export const RACION_MIN = 0.25;
export const RACION_MAX = 4;

const aCuartos = (n: number) => Math.round(n / PASO_RACION) * PASO_RACION;

export function acotarRacion(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(RACION_MAX, Math.max(RACION_MIN, aCuartos(n)));
}

/** La ración más grande (en cuartos) que no se pasa de `huecoKcal`. Si ni un
 *  cuarto cabe, un cuarto: menos no se puede servir. */
export function racionQueCabe(baseKcal: number, huecoKcal: number): number {
  if (!(baseKcal > 0) || !(huecoKcal > 0)) return RACION_MIN;
  const cuartos = Math.floor(huecoKcal / baseKcal / PASO_RACION + 1e-9) * PASO_RACION;
  return Math.min(RACION_MAX, Math.max(RACION_MIN, cuartos));
}

/** Lo que una receta puede pasarse del hueco y seguir «encajando» (el medio
 *  intercambio de siempre, ≈ 50 kcal). */
export const MARGEN_KCAL = 50;

/** ¿Cabe en kcal? En la lista se mira solo la energía, que es en lo que piensa
 *  el atleta al elegir; el reparto de macros se ve en la ficha. */
export function cabeEnKcal(r: Recipe, hueco: Macros): boolean {
  const kcal = macrosDeReceta(r).kcal;
  return kcal > 0 && hueco.kcal > 0 && kcal <= hueco.kcal + MARGEN_KCAL;
}

/** Cómo queda una receta frente al hueco: cabe, o cuánto se pasa. */
export type MarcaDeCupo = { tipo: 'encaja' } | { tipo: 'sobra'; kcal: number };

export function marcaDeCupo(r: Recipe, hueco: Macros): MarcaDeCupo | null {
  const kcal = macrosDeReceta(r).kcal;
  if (!(kcal > 0) || !(hueco.kcal > 0)) return null;
  if (cabeEnKcal(r, hueco)) return { tipo: 'encaja' };
  return { tipo: 'sobra', kcal: Math.round(kcal - hueco.kcal) };
}

/** Orden del selector: favoritas, las que encajan y el resto; nada se esconde. */
export function ordenarParaElegir<T extends Recipe>(recetas: T[], hueco: Macros, favoritas: ReadonlySet<string>): T[] {
  const rango = (r: T) => (favoritas.has(r.id) ? 0 : cabeEnKcal(r, hueco) ? 1 : 2);
  return [...recetas].sort((a, b) => rango(a) - rango(b) || a.name.localeCompare(b.name, 'es'));
}

/** Ingredientes ya desglosados, agrupados como se ven (un producto repartido
 *  en categorías es UN ingrediente). */
export interface IngredienteDeFicha {
  /** Posiciones en `items`. */
  idxs: number[];
  nombre: string;
  gramos?: number;
  kcal: number | null;
}

export function ingredientesDeFicha(items: readonly DietItem[]): IngredienteDeFicha[] {
  const out: IngredienteDeFicha[] = [];
  const porLinea = new Map<string, IngredienteDeFicha>();
  items.forEach((it, i) => {
    const previo = it.lineaId ? porLinea.get(it.lineaId) : undefined;
    if (previo) { previo.idxs.push(i); return; }
    const gramos = it.gramos ?? (it.baseGrams ? Math.round(it.baseGrams * it.quantity) : undefined);
    const ing: IngredienteDeFicha = {
      idxs: [i], nombre: it.foodLabel, kcal: it.nutrientes ? it.nutrientes.kcal : null,
      ...(gramos !== undefined ? { gramos } : {}),
    };
    if (it.lineaId) porLinea.set(it.lineaId, ing);
    out.push(ing);
  });
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Las líneas con un ingrediente multiplicado por `ratio` (0,5 = la mitad). */
export function conIngredienteEscalado(items: readonly DietItem[], idxs: readonly number[], ratio: number): DietItem[] {
  if (!(ratio > 0) || ratio === 1) return [...items];
  const tocar = new Set(idxs);
  return items.map((it, i) => {
    if (!tocar.has(i)) return it;
    return {
      ...it,
      quantity: r2(it.quantity * ratio),
      ...(it.gramos !== undefined ? { gramos: Math.max(1, Math.round(it.gramos * ratio)) } : {}),
      ...(it.nutrientes
        ? { nutrientes: { kcal: Math.round(it.nutrientes.kcal * ratio), p: r1(it.nutrientes.p * ratio), hc: r1(it.nutrientes.hc * ratio), g: r1(it.nutrientes.g * ratio) } }
        : {}),
    };
  });
}

/** Aplica los retoques por ingrediente (`ratios[n]` es el del ingrediente n). */
export function conRetoques(items: readonly DietItem[], ratios: Readonly<Record<number, number>>): DietItem[] {
  const ings = ingredientesDeFicha(items);
  let out = [...items];
  ings.forEach((ing, n) => {
    const ratio = ratios[n];
    if (ratio !== undefined && ratio !== 1) out = conIngredienteEscalado(out, ing.idxs, ratio);
  });
  return out;
}
