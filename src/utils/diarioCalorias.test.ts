import { describe, it, expect } from 'vitest';
import type { DietMeal } from '../types';
import { lineasDelDiario, kcalDeLineas, repartoKcalPorDefecto, repartoKcalVigente, kcalPorComida } from './diarioCalorias';

const comida = (items: DietMeal['items'], extra: Partial<DietMeal> = {}): DietMeal => ({ id: 'm1', name: 'Desayuno', items, ...extra });

describe('lineasDelDiario', () => {
  it('solo enseña lo apuntado: lo sembrado del plan sin marcar no sale', () => {
    const m = comida([
      { category: 'HC', foodLabel: '40g pan', quantity: 1, baseGrams: 40 },
      { category: 'PROT', foodLabel: 'Pollo', quantity: 1 },
    ]);
    const ls = lineasDelDiario(m, new Set(['m1_1']));
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ nombre: 'Pollo', idxs: [1], kcal: 100, tipo: 'alimento' });
  });

  it('un producto repartido en categorías es una sola línea con sus kcal exactas', () => {
    const m = comida([
      { category: 'PROT', foodLabel: 'Yogur', quantity: 1, lineaId: 'L', gramos: 125, nutrientes: { kcal: 75, p: 12.5, hc: 5, g: 0.6 } },
      { category: 'GRASA', foodLabel: 'Yogur', quantity: 0.25, lineaId: 'L' },
    ]);
    const ls = lineasDelDiario(m, new Set(['m1_0', 'm1_1']));
    expect(ls).toEqual([expect.objectContaining({ idxs: [0, 1], gramos: 125, kcal: 75, aproximado: false, tipo: 'producto' })]);
  });

  it('los gramos de un alimento del banco salen de su gramaje por intercambio', () => {
    const ls = lineasDelDiario(comida([{ category: 'HC', foodLabel: '40g pan', quantity: 1.5, baseGrams: 40 }]), new Set(['m1_0']));
    expect(ls[0]).toMatchObject({ gramos: 60, kcal: 150 });
  });

  it('un plato entero del recetario es una línea con el nombre de la receta', () => {
    const m = comida([
      { category: 'HC', foodLabel: 'Pasta', quantity: 2, originRecipeId: 'r1' },
      { category: 'PROT', foodLabel: 'Pasta', quantity: 1, originRecipeId: 'r1' },
    ]);
    const ls = lineasDelDiario(m, new Set(['m1_0', 'm1_1']), id => (id === 'r1' ? 'Pasta boloñesa' : undefined));
    expect(ls).toEqual([expect.objectContaining({ nombre: 'Pasta boloñesa', idxs: [0, 1], kcal: 300, tipo: 'plato' })]);
  });

  it('los ingredientes desglosados llevan su receta para agruparlos', () => {
    const receta = { id: 'r2', nombre: 'Tostada' };
    const m = comida([
      { category: 'HC', foodLabel: 'Pan', quantity: 1, lineaId: 'a', gramos: 40, nutrientes: { kcal: 100, p: 3, hc: 20, g: 1 }, receta },
      { category: 'GRASA', foodLabel: 'Aceite', quantity: 1, lineaId: 'b', gramos: 10, nutrientes: { kcal: 90, p: 0, hc: 0, g: 10 }, receta },
    ]);
    const ls = lineasDelDiario(m, new Set(['m1_0', 'm1_1']));
    expect(ls.map(l => l.receta?.nombre)).toEqual(['Tostada', 'Tostada']);
    expect(kcalDeLineas(ls)).toBe(190);
  });

  it('un producto sin datos completos no suma', () => {
    const ls = lineasDelDiario(comida([{ category: 'HC', foodLabel: 'Pan raro', quantity: 1, lineaId: 'x', nutrientes: null }]), new Set(['m1_0']));
    expect(ls[0].kcal).toBeNull();
    expect(kcalDeLineas(ls)).toBe(0);
  });
});

describe('reparto de calorías por comida', () => {
  const meals: DietMeal[] = [
    { id: 'a', name: 'Desayuno', items: [], target: { HC: 2, PROT: 1, GRASA: 1, MIX_HC: 0, MIX_GRASA: 0 } },
    { id: 'b', name: 'Comida', items: [], target: { HC: 4, PROT: 2, GRASA: 1, MIX_HC: 0, MIX_GRASA: 0 } },
  ];

  it('sale del reparto por intercambios pasado a kcal y suma 100', () => {
    const r = repartoKcalPorDefecto(meals);
    expect(r.reduce((s, n) => s + n, 0)).toBe(100);
    expect(r[1]).toBeGreaterThan(r[0]);
  });

  it('sin reparto en la dieta, a partes iguales', () => {
    expect(repartoKcalPorDefecto([{ id: 'a', name: 'a', items: [] }, { id: 'b', name: 'b', items: [] }, { id: 'c', name: 'c', items: [] }])).toEqual([34, 33, 33]);
  });

  it('respeta el guardado solo si casa con las comidas y suma 100', () => {
    expect(repartoKcalVigente(meals, [30, 70])).toEqual([30, 70]);
    expect(repartoKcalVigente(meals, [30, 60])).toEqual(repartoKcalPorDefecto(meals));
    expect(repartoKcalVigente(meals, [20, 30, 50])).toEqual(repartoKcalPorDefecto(meals));
  });

  it('kcal por comida', () => {
    expect(kcalPorComida(2330, [25, 35, 30, 10])).toEqual([583, 816, 699, 233]);
  });
});
