/* ═══════════════════════════════════════════════════════════════════════════
   Con qué recetas trabaja cada atleta (N-03)

   Dos decisiones del coach, separadas:

   1. LISTA DEL MENÚ: las recetas que el generador de menús y los cambios de
      comida pueden usar. Hay una lista global (`recipeAccess/global`) y cada
      atleta puede tener la suya (`athleteRecipeRules/{email}.listaMenu`).
      Prioridad: atleta > global > todas. Sin ninguna lista, se usan todas.
   2. RECETARIO: si el atleta navega todas las recetas o solo las que el coach
      le recomienda. Cómo se exploran no cambia, solo cuántas hay dentro.

   Aquí solo vive la lógica pura; los documentos están en db/recipes.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { PaqueteDeRecetas } from './seleccionDeRecetas.js';

export type ModoRecetario = 'todas' | 'recomendadas';

/** Lista con la que trabaja el generador: ids concretos, o `'rapidas'` (las
 *  recetas marcadas `basica`), que es lo que se usa mientras el coach no haya
 *  editado ninguna lista. */
export type ListaDeMenu = string[] | 'rapidas';

/** Documento global `recipeAccess/global`. */
export interface AccesoGlobalARecetas {
  /** Recetas con las que se trabaja por defecto. Ausente = las Rápidas. */
  listaMenu?: string[];
  /** Paquetes de recetas del coach, para usar con cualquier atleta (seleccionDeRecetas.ts). */
  paquetes?: PaqueteDeRecetas[];
  updatedAt?: string;
}

/** Por debajo de este número de recetas, la lista se ignora: un menú sin
 *  opciones es peor que un menú con más variedad de la pedida. */
export const MIN_RECETAS_DE_LISTA = 5;

/**
 * Lista que manda para un atleta: la suya si existe, si no la global, si no las
 * Rápidas. Una lista vacía cuenta como «no hay lista»: dejar al atleta sin
 * ninguna receta no es una decisión, es un descuido.
 */
export function listaDeMenuVigente(
  personal: string[] | undefined, global: string[] | undefined,
): ListaDeMenu {
  if (personal && personal.length > 0) return personal;
  if (global && global.length > 0) return global;
  return 'rapidas';
}

/** Modo del recetario del atleta. Sin dato, todas. */
export function modoRecetarioVigente(modo: ModoRecetario | undefined): ModoRecetario {
  return modo === 'recomendadas' ? 'recomendadas' : 'todas';
}

/**
 * Deja en el pool solo las recetas de la lista. Si la lista no existe, o
 * dejaría menos de `MIN_RECETAS_DE_LISTA`, devuelve el pool tal cual.
 */
export function filtrarPorLista<T extends { id: string; basica?: boolean }>(
  pool: T[], lista: ListaDeMenu | undefined,
): T[] {
  if (!lista || lista.length === 0) return pool;
  const ids = lista === 'rapidas' ? null : new Set(lista);
  const dentro = pool.filter(r => (ids ? ids.has(r.id) : r.basica === true));
  return dentro.length >= MIN_RECETAS_DE_LISTA ? dentro : pool;
}

/**
 * ¿Entra esta receta en el recetario del atleta? En modo «recomendadas» solo
 * las que el coach le recomienda; sin ninguna recomendada no se oculta nada
 * (un recetario vacío parece un fallo, no una decisión).
 */
export function entraEnRecetario(
  recipeId: string, modo: ModoRecetario, recomendadas: readonly string[],
): boolean {
  if (modo !== 'recomendadas' || recomendadas.length === 0) return true;
  return recomendadas.includes(recipeId);
}
