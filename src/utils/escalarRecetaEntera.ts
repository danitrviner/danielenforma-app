import { Recipe } from '../types';
import { roundQuarter } from './exchangeHelpers';

/**
 * Escala una receta ENTERA por un factor: intercambios, gramos, kcal y macros.
 *
 * El fallo que arregla: al subir o bajar los intercambios de una receta metida
 * en una comida de «Mi plan», `escalarReceta` (utils/filasDelPlan) sí escalaba
 * los intercambios de cada `DietItem`, pero la FICHA de la receta seguía
 * enseñando los gramos originales — el atleta le ponía ×2 a la avena y la ficha
 * le seguía diciendo «40 g» (Dani, 10-09-2026). Lo mismo pasaba en el menú
 * semanal, que hasta pintaba «×2» en el título con los gramos sin tocar, y en
 * el deslizador de ESCALA del recetario, que escalaba todo MENOS los gramos.
 *
 * Los gramos viven en dos sitios distintos según de dónde venga la receta:
 *  - `ingredientsText[].quantity` — gramos reales, recetas del recetario importado.
 *  - `ingredients[].quantity`     — INTERCAMBIOS, recetas del constructor.
 * Se escalan los dos, cada uno con su redondeo: gramos a entero (no existe
 * medio gramo de arroz en una báscula de cocina), intercambios al cuarto.
 *
 * El ÍNDICE del recetario guarda los ingredientes solo por nombre, sin cantidad,
 * para que quepa en el móvil: multiplicar ese hueco escribía «NaN g». Mismo
 * criterio que `buildShoppingList` — sin cantidad, se deja el hueco como está.
 */
export function escalarRecetaEntera(recipe: Recipe, factor: number): Recipe {
  if (!Number.isFinite(factor) || factor === 1 || factor <= 0) return recipe;

  return {
    ...recipe,
    ingredientsText: recipe.ingredientsText?.map(ing => ({
      ...ing,
      quantity: Number.isFinite(ing.quantity) ? Math.round(ing.quantity * factor) : ing.quantity,
    })),
    ingredients: (recipe.ingredients ?? []).map(ing => ({
      ...ing,
      quantity: roundQuarter(ing.quantity * factor),
    })),
    exchanges: recipe.exchanges ? {
      HC: roundQuarter(recipe.exchanges.HC * factor),
      PROT: roundQuarter(recipe.exchanges.PROT * factor),
      GRASA: roundQuarter(recipe.exchanges.GRASA * factor),
    } : undefined,
    macros: recipe.macros ? {
      carb: Math.round(recipe.macros.carb * factor),
      prot: Math.round(recipe.macros.prot * factor),
      fat: Math.round(recipe.macros.fat * factor),
    } : undefined,
    kcal: recipe.kcal != null ? Math.round(recipe.kcal * factor) : recipe.kcal,
    weight: recipe.weight != null ? Math.round(recipe.weight * factor) : recipe.weight,
  };
}

/**
 * Cuántas veces se ha escalado una receta dentro de una comida: los
 * intercambios que ocupa AHORA partido por los que trae de fábrica.
 *
 * Se calcula con el total de las tres categorías y no categoría a categoría
 * porque `escalarReceta` escala todos los ítems por el mismo factor: si HC ha
 * pasado de 2 a 4, la proteína también se ha doblado.
 */
export function factorDeReceta(actuales: number, base: number): number {
  if (!(base > 0) || !Number.isFinite(actuales)) return 1;
  const factor = actuales / base;
  // Los dos totales se redondean por caminos distintos: `recipeExchanges` pasa
  // por `snapExchanges` (al cuarto, repartiendo la deriva entre categorías) y
  // el del plato por `round2` ítem a ítem. Con ingredientes MIX (medio HC,
  // medio PROT) esa diferencia puede dejar un 0,98 donde debería haber un 1
  // exacto, y una receta que nadie ha tocado saldría con un cartel de
  // «Cantidades para ×0,98». Por debajo de un 5 % se considera sin escalar.
  return Math.abs(factor - 1) < 0.05 ? 1 : factor;
}
