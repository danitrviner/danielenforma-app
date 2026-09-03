import { describe, it, expect } from 'vitest';
import { cabeEnElCupo, ordenarPorCupo } from './recipeMatch';
import type { Recipe } from '../types';

const r = (name: string, HC: number, PROT: number, GRASA: number): Recipe => ({
  id: name, ownerId: 'recetas', name, categories: [], ingredients: [], extras: [], steps: [],
  exchanges: { HC, PROT, GRASA },
} as Recipe);

const CUPO = { HC: 3, PROT: 2, GRASA: 1 };

describe('recetas que caben en lo que te queda', () => {
  it('deja pasar la que entra justa', () => {
    expect(cabeEnElCupo(r('justa', 3, 2, 1), CUPO)).toBe(true);
  });

  it('descarta la que se pasa de largo en una sola categoría', () => {
    expect(cabeEnElCupo(r('pasada', 3, 6, 1), CUPO)).toBe(false);
  });

  it('tolera pasarse un poco — cuadrar al gramo no pasa nunca', () => {
    expect(cabeEnElCupo(r('casi', 3.5, 2, 1), CUPO)).toBe(true);
    expect(cabeEnElCupo(r('demasiado', 4, 2, 1), CUPO)).toBe(false);
  });

  it('sin cupo restante solo caben las recetas muy pequeñas', () => {
    expect(cabeEnElCupo(r('grande', 2, 2, 1), { HC: 0, PROT: 0, GRASA: 0 })).toBe(false);
    expect(cabeEnElCupo(r('minima', 0.25, 0, 0), { HC: 0, PROT: 0, GRASA: 0 })).toBe(true);
  });
});

describe('ordenarPorCupo', () => {
  it('primero la que mejor aprovecha el cupo, no la más pequeña', () => {
    // Sin esto, arriba salían siempre las recetas de medio intercambio: caben
    // en todo y no resuelven la comida de nadie.
    const lista = [r('miniatura', 0.25, 0, 0), r('encaja', 3, 2, 1), r('media', 1, 1, 0)];
    expect(ordenarPorCupo(lista, CUPO).map(x => x.name)).toEqual(['encaja', 'media', 'miniatura']);
  });

  it('las que no caben ni aparecen', () => {
    const lista = [r('cabe', 1, 1, 0), r('nocabe', 9, 9, 9)];
    expect(ordenarPorCupo(lista, CUPO).map(x => x.name)).toEqual(['cabe']);
  });

  it('con la lista vacía devuelve vacío', () => {
    expect(ordenarPorCupo([], CUPO)).toEqual([]);
  });
});
