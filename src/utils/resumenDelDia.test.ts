import { describe, it, expect } from 'vitest';
import type { DietMeal } from '../types';
import { resumenDelDia } from './resumenDelDia';

const comida = (items: DietMeal['items']): DietMeal => ({ id: 'm1', name: 'Comida', items });

describe('resumenDelDia', () => {
  it('un alimento del banco se deriva de sus intercambios y es aproximado', () => {
    const r = resumenDelDia([comida([{ category: 'HC', foodLabel: 'Arroz', quantity: 2 }])], ['m1_0']);
    expect(r).toMatchObject({ kcal: 200, hc: 50, p: 0, g: 0, aproximado: true, incompletos: 0 });
  });
  it('solo cuenta lo marcado como comido', () => {
    const items: DietMeal['items'] = [
      { category: 'HC', foodLabel: 'Arroz', quantity: 1 },
      { category: 'PROT', foodLabel: 'Pollo', quantity: 1 },
    ];
    expect(resumenDelDia([comida(items)], ['m1_1'])).toMatchObject({ p: 25, hc: 0 });
  });
  it('un producto con nutrientes suma esos números exactos, no aproximados', () => {
    const items: DietMeal['items'] = [
      { category: 'PROT', foodLabel: 'Yogur', quantity: 1, lineaId: 'L', nutrientes: { kcal: 75, p: 12.5, hc: 5, g: 0.6 }, gramos: 125 },
      { category: 'GRASA', foodLabel: 'Yogur', quantity: 0.25, lineaId: 'L' },
    ];
    const r = resumenDelDia([comida(items)], ['m1_0', 'm1_1']);
    expect(r).toMatchObject({ kcal: 75, p: 12.5, hc: 5, g: 0.6, aproximado: false });
  });
  it('las líneas de continuación no duplican los nutrientes', () => {
    const items: DietMeal['items'] = [
      { category: 'HC', foodLabel: 'Pan', quantity: 2, lineaId: 'L', nutrientes: { kcal: 200, p: 6, hc: 40, g: 2 } },
      { category: 'GRASA', foodLabel: 'Pan', quantity: 0.25, lineaId: 'L' },
    ];
    expect(resumenDelDia([comida(items)], ['m1_0', 'm1_1']).kcal).toBe(200);
  });
  it('un producto incompleto no suma y se cuenta aparte', () => {
    const items: DietMeal['items'] = [{ category: 'HC', foodLabel: 'Pan de centeno', quantity: 1, nutrientes: null }];
    expect(resumenDelDia([comida(items)], ['m1_0'])).toMatchObject({ kcal: 0, incompletos: 1, aproximado: false });
  });
  it('un día vacío da ceros', () => {
    expect(resumenDelDia(undefined, [])).toEqual({ kcal: 0, p: 0, hc: 0, g: 0, aproximado: false, incompletos: 0 });
  });
});
