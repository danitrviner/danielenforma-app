import type { DietItem, FoodCategory } from '../types';
import { addToPlaced } from './exchangeHelpers';

/**
 * Cómo se enseña una comida del plan: un renglón por alimento suelto, y UN solo
 * renglón por receta.
 *
 * El motivo: una receta del recetario no trae ingredientes, solo sus
 * intercambios agregados, y `recipeToDietItems` la convierte en un `DietItem`
 * POR CATEGORÍA (ver exchangeHelpers). "Pollo al curry" acababa apareciendo
 * tres veces seguidas —una con los hidratos, otra con la proteína y otra con la
 * grasa—, las tres con el mismo nombre, como si te hubieras comido tres platos.
 *
 * La agrupación es solo de presentación: por debajo los intercambios siguen
 * separados por categoría, que es lo que necesitan las barras de HC/PROT/GRASA,
 * la adherencia y el panel del coach. Aquí solo se decide qué se pinta junto.
 *
 * Se agrupan ítems CONTIGUOS con el mismo `originRecipeId` — contiguos porque
 * es como los mete `handleApplyRecipe` (todos de golpe al final de la comida) y
 * porque así, si la misma receta se añade dos veces, salen dos renglones, que
 * es lo correcto: son dos platos.
 */
export type FilaDelPlan =
  | { tipo: 'alimento'; idx: number; item: DietItem }
  | { tipo: 'receta'; recipeId: string; nombre: string; idxs: number[]; intercambios: Record<FoodCategory, number> };

export function filasDeComida(items: DietItem[]): FilaDelPlan[] {
  const filas: FilaDelPlan[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const recipeId = item.originRecipeId;
    if (!recipeId) {
      filas.push({ tipo: 'alimento', idx: i, item });
      i++;
      continue;
    }
    const idxs: number[] = [];
    const intercambios: Record<FoodCategory, number> = { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
    while (i < items.length && items[i].originRecipeId === recipeId) {
      idxs.push(i);
      addToPlaced(intercambios, items[i].category, items[i].quantity);
      i++;
    }
    filas.push({
      tipo: 'receta',
      recipeId,
      // Todos los ítems de una receta del recetario llevan el nombre de la
      // receta; los de una receta del constructor llevan el del ingrediente, y
      // en ese caso el nombre bueno lo pone quien pinta (tiene la receta).
      nombre: items[idxs[0]].foodLabel,
      idxs,
      intercambios,
    });
  }
  return filas;
}

/**
 * Escala una receta entera. El stepper de un renglón de receta mueve el plato
 * completo, no un ingrediente suelto: se aplica el mismo factor a todos sus
 * ítems y se redondea cada uno a cuartos de intercambio, que es la unidad con
 * la que trabaja toda la app. El mínimo es un cuarto: una receta a cero no es
 * una receta, se quita.
 */
export function escalarReceta(items: DietItem[], idxs: number[], delta: number): DietItem[] {
  const base = idxs.reduce((max, i) => Math.max(max, items[i].quantity), 0);
  if (base <= 0) return items;
  const factor = Math.max(0.25, base + delta) / base;
  const copia = [...items];
  for (const i of idxs) {
    const escalada = Math.round((items[i].quantity * factor) / 0.25) * 0.25;
    copia[i] = { ...items[i], quantity: Math.max(0.25, Math.round(escalada * 100) / 100) };
  }
  return copia;
}
