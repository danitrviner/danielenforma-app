import { describe, it, expect } from 'vitest';
import { combinacionesDeSiempre } from './combinacionesDeSiempre';

const dia = (date: string, labels: string[], mealId = 'm3', name = 'Merienda') => ({
  date,
  doneItemIds: labels.map((_, i) => `${mealId}_${i}`),
  meals: [{ id: mealId, name, items: labels.map(l => ({ category: 'HC', foodLabel: l, quantity: 1, nutrientes: { kcal: 100, p: 1, hc: 20, g: 1 } })) }],
}) as never;

describe('combinacionesDeSiempre', () => {
  it('propone lo que se repite en esa comida, lo más repetido primero', () => {
    const logs = [
      dia('2026-10-01', ['53 g de Pan tostado', 'Mermelada']),
      dia('2026-10-02', ['Yogur griego', 'Plátano']),
      dia('2026-10-03', ['Mermelada', '53 g de Pan tostado']),
      dia('2026-10-04', ['53 g de Pan tostado', 'Mermelada']),
      dia('2026-10-05', ['Yogur griego', 'Plátano']),
      dia('2026-10-06', ['Manzana', 'Nueces']),
    ];
    const c = combinacionesDeSiempre(logs, { id: 'm3', name: 'Merienda' });
    expect(c.map(x => [x.nombres.join(' + '), x.veces])).toEqual([['Pan tostado + Mermelada', 3], ['Yogur griego + Plátano', 2]]);
    expect(c[0].kcal).toBe(200);
  });
  it('un solo alimento o una sola vez no cuentan, y otra comida tampoco', () => {
    const logs = [dia('2026-10-01', ['Pan']), dia('2026-10-02', ['Pan']), dia('2026-10-03', ['Huevo', 'Pan'], 'm1', 'Desayuno'), dia('2026-10-04', ['Huevo', 'Pan'], 'm1', 'Desayuno')];
    expect(combinacionesDeSiempre(logs, { id: 'm3', name: 'Merienda' })).toEqual([]);
  });
});
