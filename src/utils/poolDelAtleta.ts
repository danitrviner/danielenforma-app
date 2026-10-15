import type { DietType, Recipe } from '../types';
import { ingredientMatch, violatesDietType } from './foodPrefs';
import { violatesHealthConditions } from './dietaryRestrictions';
import { superaElTiempo } from './tiempoDeReceta';
import { dishType, type DishType } from './dishTypes';

/** Los filtros DUROS que el motor aplica a las recetas de un atleta. */
export interface FiltrosDelPool {
  allergies: string[];
  conditions?: number[];
  dietType?: DietType;
  cookingMaxTime?: number;
  excludedDishTypes?: DishType[];
  dislikedRecipeIds?: string[];
}

/**
 * Las recetas que el atleta puede recibir: el recetario menos lo que sus
 * alergias, condiciones, dieta, tiempo, tipos de plato y «no me gusta» dejan
 * fuera. Es la misma criba que `rankCandidates`, para que la lista del coach
 * enseñe exactamente lo que el generador tiene a mano —y sobre ella decide qué
 * esconder—, y no recetas que ya no iban a salir de todos modos.
 */
export function poolDelAtleta(recetas: Recipe[], f: FiltrosDelPool): Recipe[] {
  const noMeGusta = new Set(f.dislikedRecipeIds ?? []);
  const excluidos = new Set(f.excludedDishTypes ?? []);
  return recetas.filter(r =>
    !noMeGusta.has(r.id) &&
    !excluidos.has(dishType(r)) &&
    !f.allergies.some(a => ingredientMatch(r, a)) &&
    !violatesHealthConditions(r, f.conditions) &&
    !violatesDietType(r, f.dietType) &&
    !superaElTiempo(r, f.cookingMaxTime),
  );
}
