import { describe, it, expect } from 'vitest';
import { macrosDeReceta, cabeEnLoQueQueda, encajaEnLoQueQueda, ordenarPorLoQueQueda } from './macrosDeReceta';
import type { Recipe } from '../types';

/** Receta del recetario: gramos de proteína, hidratos y grasa. */
const r = (name: string, p: number, hc: number, g: number, kcal?: number): Recipe => ({
  id: name, ownerId: 'recetas', name, categories: [], ingredients: [], extras: [], steps: [],
  macros: { prot: p, carb: hc, fat: g }, ...(kcal ? { kcal } : {}),
} as Recipe);

// 50 g P · 75 g HC · 11 g G ≈ 599 kcal
const QUEDA = { kcal: 599, p: 50, hc: 75, g: 11 };

describe('macros de una receta', () => {
  it('con gramos: los suyos y sus kcal (o 4/4/9 si no las trae)', () => {
    expect(macrosDeReceta(r('a', 28, 42, 8, 352))).toEqual({ kcal: 352, p: 28, hc: 42, g: 8 });
    expect(macrosDeReceta(r('b', 10, 10, 10)).kcal).toBe(170);
  });

  it('sin gramos: por sus intercambios viejos', () => {
    const vieja = { id: 'v', ownerId: 'x', name: 'v', categories: [], ingredients: [], extras: [], steps: [], exchanges: { HC: 2, PROT: 1, GRASA: 0 } } as unknown as Recipe;
    expect(macrosDeReceta(vieja)).toEqual({ kcal: 300, p: 25, hc: 50, g: 0 });
  });

  it('del constructor: por sus ingredientes, con los mixtos repartidos', () => {
    const propia = {
      id: 'c', ownerId: 'x', name: 'c', categories: [], extras: [], steps: [],
      ingredients: [{ foodLabel: 'Queso', category: 'MIX_GRASA', mode: 'OMNIVORO', quantity: 2 }],
    } as unknown as Recipe;
    expect(macrosDeReceta(propia)).toEqual({ kcal: 199, p: 25, hc: 0, g: 11 });
  });
});

describe('recetas que caben en lo que te queda', () => {
  it('deja pasar la que entra justa', () => {
    expect(cabeEnLoQueQueda(r('justa', 50, 75, 11), QUEDA)).toBe(true);
  });

  it('descarta la que se pasa de largo en una sola macro', () => {
    expect(cabeEnLoQueQueda(r('pasada', 150, 75, 11), QUEDA)).toBe(false);
  });

  it('tolera pasarse un poco — cuadrar al gramo no pasa nunca', () => {
    expect(cabeEnLoQueQueda(r('casi', 50, 87, 11), QUEDA)).toBe(true);
    expect(cabeEnLoQueQueda(r('demasiado', 50, 100, 11), QUEDA)).toBe(false);
  });

  it('sin nada que quede solo caben las recetas muy pequeñas', () => {
    const nada = { kcal: 0, p: 0, hc: 0, g: 0 };
    expect(cabeEnLoQueQueda(r('grande', 50, 50, 11), nada)).toBe(false);
    expect(cabeEnLoQueQueda(r('minima', 0, 6, 0), nada)).toBe(true);
  });

  it('encajar es llenar el hueco, no solo caber', () => {
    expect(encajaEnLoQueQueda(r('llena', 45, 80, 9), QUEDA)).toBe(true);
    expect(encajaEnLoQueQueda(r('pequeña', 10, 20, 2), QUEDA)).toBe(false);
    expect(encajaEnLoQueQueda(r('x', 50, 75, 11), { kcal: 0, p: 0, hc: 0, g: 0 })).toBe(false);
  });
});

describe('ordenarPorLoQueQueda', () => {
  it('primero la que mejor aprovecha lo que queda, no la más pequeña', () => {
    const lista = [r('miniatura', 0, 6, 0), r('encaja', 50, 75, 11), r('media', 25, 25, 0)];
    expect(ordenarPorLoQueQueda(lista, QUEDA).map(x => x.name)).toEqual(['encaja', 'media', 'miniatura']);
  });

  it('las que no caben ni aparecen, salvo buscando', () => {
    const lista = [r('cabe', 25, 25, 0), r('nocabe', 200, 200, 90)];
    expect(ordenarPorLoQueQueda(lista, QUEDA).map(x => x.name)).toEqual(['cabe']);
    expect(ordenarPorLoQueQueda(lista, QUEDA, false).map(x => x.name)).toEqual(['cabe', 'nocabe']);
  });

  it('con la lista vacía devuelve vacío', () => {
    expect(ordenarPorLoQueQueda([], QUEDA)).toEqual([]);
  });
});
