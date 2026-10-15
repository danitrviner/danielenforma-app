import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { poolDelAtleta } from './poolDelAtleta';

const r = (id: string, extra: Partial<Recipe> = {}): Recipe =>
  ({ id, ownerId: 'recetas', name: id, categories: [], ingredients: [], extras: [], steps: [], ...extra }) as Recipe;

describe('poolDelAtleta', () => {
  it('sin filtros devuelve todo', () => {
    expect(poolDelAtleta([r('a'), r('b')], { allergies: [] }).map(x => x.id)).toEqual(['a', 'b']);
  });
  it('quita alergias y «no me gusta»', () => {
    const cacahuete = r('c', { ingredientsText: [{ name: 'Cacahuete', quantity: 20 }] } as Partial<Recipe>);
    const l = poolDelAtleta([r('a'), r('b'), cacahuete], { allergies: ['cacahuete'], dislikedRecipeIds: ['b'] });
    expect(l.map(x => x.id)).toEqual(['a']);
  });
});

import { categoriasDe, filtrarLista, FILTRO_VACIO } from './poolDelAtleta';
import { etiquetaDeTiempo } from './tiempoDeReceta';

describe('filtrarLista y categoriasDe', () => {
  const recetas = [
    r('arroz', { categoria: 'Arroces', cookingTime: 3, ingredientsText: [{ name: 'Arroz basmati', quantity: 80 }, { name: 'Pollo', quantity: 120 }] } as Partial<Recipe>),
    r('batido', { categoria: 'Batidos', cookingTime: 4, basica: true, ingredientsText: [{ name: 'Leche', quantity: 200 }] } as Partial<Recipe>),
    r('guiso', { categoria: 'Carnes', cookingTime: 45, ingredientsText: [{ name: 'Ternera', quantity: 150 }] } as Partial<Recipe>),
    r('sinTiempo', { categoria: 'Carnes' } as Partial<Recipe>),
  ];
  const ids = (l: Recipe[]) => l.map(x => x.id);

  it('cuenta categorías y pone Rápidas la primera', () => {
    expect(categoriasDe(recetas)).toEqual([
      { nombre: 'Rápidas', total: 1 },
      { nombre: 'Arroces', total: 1 },
      { nombre: 'Batidos', total: 1 },
      { nombre: 'Carnes', total: 2 },
    ]);
  });
  it('filtra por categoría, incluida Rápidas', () => {
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, categoria: 'Carnes' }))).toEqual(['guiso', 'sinTiempo']);
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, categoria: 'Rápidas' }))).toEqual(['batido']);
  });
  it('filtra por tiempo y deja fuera las que no lo declaran', () => {
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, tiempo: '10' }))).toEqual(['batido']);
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, tiempo: '20' }))).toEqual(['arroz', 'batido']);
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, tiempo: 'mas30' }))).toEqual(['guiso']);
  });
  it('filtra por ingrediente con y sin', () => {
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, ingrediente: 'pollo' }))).toEqual(['arroz']);
    expect(ids(filtrarLista(recetas, { ...FILTRO_VACIO, ingrediente: 'pollo', modoIngrediente: 'sin' })))
      .toEqual(['batido', 'guiso', 'sinTiempo']);
  });
  it('etiqueta de tiempo: estimado, real y sin dato', () => {
    expect(etiquetaDeTiempo({ cookingTime: 3 })).toBe('~20 min');
    expect(etiquetaDeTiempo({ cookingTime: 45 })).toBe('45 min');
    expect(etiquetaDeTiempo({})).toBe('Sin tiempo');
  });
});
