import { describe, expect, it } from 'vitest';
import type { Recipe, WeeklyMenu, MenuMeal } from '../types';
import { senalesDeCambios, sustitucionesPara, gustoPorTipo } from './gustosDelAtleta';

function menu(partes: { swaps?: WeeklyMenu['swapHistory']; meals?: Partial<MenuMeal>[] }): WeeklyMenu {
  return {
    id: 'm', athleteId: 'a@x.com', status: 'archived', name: 'Menú', createdAt: '2026-10-01', varietyLevel: 3,
    swapHistory: partes.swaps ?? [],
    days: [{ day: 'mon', dietId: 'd', target: { HC: 0, PROT: 0, GRASA: 0 }, meals: (partes.meals ?? []).map((m, i) => ({
      id: `mon_m${i + 1}`, slot: 1, name: 'Desayuno', recipeId: 'r', recipeName: 'R', scale: 1,
      exch: { HC: 0, PROT: 0, GRASA: 0 }, kcal: 0, complements: [], ...m,
    })) }],
  };
}
const swap = (from: string, to: string): WeeklyMenu['swapHistory'][number] =>
  ({ at: '2026-10-01', day: 'mon', mealId: 'mon_m1', fromRecipeId: from, fromRecipeName: from, toRecipeId: to, toRecipeName: to, toScale: 1 });

describe('senalesDeCambios', () => {
  it('cuenta las recetas que quita y las que elige, en todos los menús', () => {
    const s = senalesDeCambios([menu({ swaps: [swap('a', 'b')] }), menu({ swaps: [swap('a', 'c'), swap('d', 'b')] })]);
    expect(s.evitadas).toEqual({ a: 2, d: 1 });
    expect(s.elegidas).toEqual({ b: 2, c: 1 });
  });

  it('quitar una y volver a elegirla se anula', () => {
    const s = senalesDeCambios([menu({ swaps: [swap('a', 'b'), swap('b', 'a')] })]);
    expect(s.evitadas).toEqual({});
    expect(s.elegidas).toEqual({});
  });

  it('un alimento cambiado por el mismo otro en dos comidas es costumbre; una vez, no', () => {
    const s = senalesDeCambios([menu({ meals: [
      { ingredientSwaps: [{ from: 'Leche', to: 'Bebida de avena' }, { from: 'Yogur natural', to: 'Skyr' }] },
      { ingredientSwaps: [{ from: 'Leche', to: 'Bebida de avena' }] },
    ] })]);
    expect(s.sustituciones).toEqual({ leche: 'Bebida de avena' });
  });

  it('con dos destinos distintos gana el más repetido', () => {
    const s = senalesDeCambios([menu({ meals: [
      { ingredientSwaps: [{ from: 'Leche', to: 'Bebida de soja' }] },
      { ingredientSwaps: [{ from: 'Leche', to: 'Bebida de avena' }] },
      { ingredientSwaps: [{ from: 'Leche', to: 'Bebida de avena' }] },
    ] })]);
    expect(s.sustituciones).toEqual({ leche: 'Bebida de avena' });
  });
});

describe('sustitucionesPara', () => {
  it('devuelve el cambio con el nombre tal cual va en la receta', () => {
    const r = { ingredientsText: [{ name: 'Leche', quantity: 200 }, { name: 'Avena', quantity: 50 }] } as Pick<Recipe, 'ingredientsText'>;
    expect(sustitucionesPara(r, { leche: 'Bebida de avena' })).toEqual([{ from: 'Leche', to: 'Bebida de avena' }]);
    expect(sustitucionesPara(r, { huevo: 'Claras' })).toBeUndefined();
    expect(sustitucionesPara(r, undefined)).toBeUndefined();
  });
});

describe('gustoPorTipo', () => {
  const r = (id: string, name: string): Recipe => ({ id, ownerId: 'recetas', name, categories: [], ingredients: [], extras: [], steps: [] });
  const pool = [r('b1', 'Batido de fresa'), r('b2', 'Batido de plátano'), r('t1', 'Tostada'), r('e1', 'Ensalada')];

  it('suma favoritas y cambios, resta «no me gusta», y se queda en ±2', () => {
    const g = gustoPorTipo(pool, {
      favoritas: ['b1', 'b2'], noGustan: ['t1'],
      cambios: { evitadas: { e1: 2 }, elegidas: { b1: 2 }, sustituciones: {} },
    });
    expect(g.get('batido')).toBe(2);     // 1 + 1 + 1 → tope 2
    expect(g.get('tostada')).toBe(-1);
    expect(g.get('ensalada')).toBe(-1);
    expect(g.has('otro')).toBe(false);
  });

  it('solo mira las recetas de la franja', () => {
    expect(gustoPorTipo(pool.slice(2), { favoritas: ['b1'] }).size).toBe(0);
  });
});
