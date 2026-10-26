import type { FoodCategory, Macros, Recipe } from '../types';
import { kcalDeGramos, MACROS_CERO, restarMacros } from './macros';
import { macrosDeIntercambios } from './macrosLegado';

/* ═══════════════════════════════════════════════════════════════════════════
   Calorías y macros de una receta, y si cabe en lo que te queda (10-2026)

   Tres orígenes, por orden de confianza:
     1. `macros` en gramos (+ `kcal`): todas las del recetario importado.
     2. `ingredients` del constructor (coach/atleta): por sus intercambios.
     3. `exchanges` sueltos: recetas viejas o el índice antiguo.

   El margen es el de siempre traducido: medio intercambio de cada macro, que
   son 12,5 g de proteína o de hidratos y 5,5 g de grasa (≈ 50 kcal). Cuadrar al
   gramo no pasa nunca y ser estricto dejaba la lista casi vacía.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MARGEN_RECETA = { p: 12.5, hc: 12.5, g: 5.5 } as const;

const recetas = new WeakMap<Recipe, Macros>();

export function macrosDeReceta(r: Recipe): Macros {
  const guardado = recetas.get(r);
  if (guardado) return guardado;
  let m: Macros;
  if (r.macros && (r.macros.prot || r.macros.carb || r.macros.fat)) {
    const g = { p: r.macros.prot ?? 0, hc: r.macros.carb ?? 0, g: r.macros.fat ?? 0 };
    m = { kcal: r.kcal && r.kcal > 0 ? r.kcal : kcalDeGramos(g), ...g };
  } else if (r.ingredients && r.ingredients.length > 0) {
    const v: Partial<Record<FoodCategory, number>> = {};
    for (const ing of r.ingredients) v[ing.category] = (v[ing.category] ?? 0) + (ing.quantity ?? 0);
    m = macrosDeIntercambios(v);
  } else if (r.exchanges) {
    m = macrosDeIntercambios(r.exchanges);
  } else {
    m = { ...MACROS_CERO, kcal: r.kcal ?? 0 };
  }
  recetas.set(r, m);
  return m;
}

/** ¿Cabe esta receta en lo que te queda? Cada macro con su margen. */
export function cabeEnLoQueQueda(r: Recipe, queda: Macros, margen = MARGEN_RECETA): boolean {
  const m = macrosDeReceta(r);
  return m.p <= queda.p + margen.p && m.hc <= queda.hc + margen.hc && m.g <= queda.g + margen.g;
}

/** ¿Llena ese hueco sin tocar cantidades? Ni se queda corta ni se pasa. */
export function encajaEnLoQueQueda(r: Recipe, hueco: Macros, margen = MARGEN_RECETA): boolean {
  if (hueco.kcal <= 0) return false;
  const m = macrosDeReceta(r);
  return Math.abs(m.p - hueco.p) <= margen.p && Math.abs(m.hc - hueco.hc) <= margen.hc && Math.abs(m.g - hueco.g) <= margen.g;
}

/** Lo lejos que queda del hueco, en kcal de cada macro (para ordenar). */
export function distanciaAlHueco(r: Recipe, hueco: Macros): number {
  const d = restarMacros(hueco, macrosDeReceta(r));
  return Math.abs(d.p) * 4 + Math.abs(d.hc) * 4 + Math.abs(d.g) * 9;
}

/**
 * Las recetas que caben, de la que mejor aprovecha lo que queda a la que menos.
 * Ordenar por sobra (y no por «lo más pequeño primero») evita que arriba salgan
 * siempre las recetas diminutas, que caben en todo y no resuelven la comida.
 *
 * `descartarLasQueNoCaben = false` es para cuando el atleta BUSCA un plato por
 * su nombre: se ordena igual, pero no se le esconde el que busca (Dani,
 * 07-09-2026: «busco una receta que tengo en mi menú y no me sale»).
 */
export function ordenarPorLoQueQueda(recipes: Recipe[], queda: Macros, descartarLasQueNoCaben = true): Recipe[] {
  const base = descartarLasQueNoCaben ? recipes.filter(r => cabeEnLoQueQueda(r, queda)) : [...recipes];
  return base.sort((a, b) =>
    Number(cabeEnLoQueQueda(b, queda)) - Number(cabeEnLoQueQueda(a, queda)) || distanciaAlHueco(a, queda) - distanciaAlHueco(b, queda));
}
