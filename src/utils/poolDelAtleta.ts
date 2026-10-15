import type { DietType, Recipe } from '../types';
import { ingredientMatch, violatesDietType } from './foodPrefs';
import { violatesHealthConditions } from './dietaryRestrictions';
import { minutosDeReceta, superaElTiempo } from './tiempoDeReceta';
import { coincideBusqueda } from './busqueda';
import { CAT_BASICAS, encajaCategoria } from '../db/recetasHidratacion';
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

// ── Filtros de la lista del coach ────────────────────────────────────────────

export type TopeDeTiempo = '' | '10' | '20' | '30' | 'mas30';

export interface FiltroDeLista {
  texto: string;
  /** Nombre de categoría tal cual viene en `Recipe.categoria`, `'Rápidas'` o `''` (todas). */
  categoria: string;
  tiempo: TopeDeTiempo;
  ingrediente: string;
  /** `con`: la receta lleva ese ingrediente; `sin`: no lo lleva. */
  modoIngrediente: 'con' | 'sin';
}

export const FILTRO_VACIO: FiltroDeLista = {
  texto: '', categoria: '', tiempo: '', ingrediente: '', modoIngrediente: 'con',
};

export const TOPES_DE_TIEMPO: { value: TopeDeTiempo; label: string }[] = [
  { value: '', label: 'Cualquier tiempo' },
  { value: '10', label: 'Hasta 10 min' },
  { value: '20', label: 'Hasta 20 min' },
  { value: '30', label: 'Hasta 30 min' },
  { value: 'mas30', label: 'Más de 30 min' },
];

/** Categorías presentes en la lista, con cuántas recetas tiene cada una. */
export function categoriasDe(recetas: Recipe[]): { nombre: string; total: number }[] {
  const cuenta = new Map<string, number>();
  for (const r of recetas) {
    if (r.categoria) cuenta.set(r.categoria, (cuenta.get(r.categoria) ?? 0) + 1);
  }
  const rapidas = recetas.filter(r => r.basica === true).length;
  const lista = [...cuenta.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return rapidas > 0 ? [{ nombre: CAT_BASICAS, total: rapidas }, ...lista] : lista;
}

function pasaTiempo(r: Recipe, tope: TopeDeTiempo): boolean {
  if (!tope) return true;
  const min = minutosDeReceta(r);
  if (min == null) return false;  // sin dato no se puede afirmar que entre en el tope
  return tope === 'mas30' ? min > 30 : min <= Number(tope);
}

/** Aplica los filtros de la lista del coach. No altera el orden. */
export function filtrarLista(recetas: Recipe[], f: FiltroDeLista): Recipe[] {
  const ingrediente = f.ingrediente.trim();
  return recetas.filter(r => {
    if (f.texto.trim() && !coincideBusqueda(r.name, f.texto.trim())) return false;
    if (f.categoria && !encajaCategoria(r, f.categoria)) return false;
    if (!pasaTiempo(r, f.tiempo)) return false;
    if (ingrediente) {
      const lleva = ingredientMatch(r, ingrediente);
      if (f.modoIngrediente === 'con' ? !lleva : lleva) return false;
    }
    return true;
  });
}
