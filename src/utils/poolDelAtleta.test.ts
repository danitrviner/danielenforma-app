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
