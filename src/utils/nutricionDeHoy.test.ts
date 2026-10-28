import { describe, it, expect } from 'vitest';
import type { DietMeal, DietItem, Macros } from '../types';
import { nutricionDeHoy, franjaDeLaHora, diaCerrado } from './nutricionDeHoy';

const item = (kcal: number, p = 0): DietItem =>
  ({ foodId: 'x', foodLabel: 'x', category: 'HC', quantity: 1, nutrientes: { kcal, p, hc: 0, g: 0 } }) as unknown as DietItem;

const dia = (...kcals: (number | null)[]): DietMeal[] =>
  ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena'].map((name, i) => ({
    id: `m${i}`, name, slot: i + 1, items: kcals[i] != null ? [item(kcals[i]!)] : [],
  }));

const hechosDe = (meals: DietMeal[]) => meals.flatMap(m => m.items.map((_, k) => `${m.id}_${k}`));
const objetivo: Macros = { kcal: 2400, p: 0, hc: 0, g: 0 };
const h = (hh: number, mm = 0) => hh * 60 + mm;

describe('franjaDeLaHora', () => {
  it('reparte el día en las cinco franjas', () => {
    expect(franjaDeLaHora(h(8))).toBe(1);
    expect(franjaDeLaHora(h(11, 30))).toBe(2);
    expect(franjaDeLaHora(h(13, 40))).toBe(3);
    expect(franjaDeLaHora(h(17))).toBe(4);
    expect(franjaDeLaHora(h(22))).toBe(5);
  });
});

describe('nutricionDeHoy', () => {
  it('un día recién sembrado ya cuenta sus cinco comidas (antes salía 0/0)', () => {
    const r = nutricionDeHoy(dia(), [], objetivo, h(9));
    expect(r.comidas).toHaveLength(5);
    expect(r.toca).toBe(0);
    expect(r.kcalPorComida).toBe(480);
    expect(r.todoRegistrado).toBe(false);
  });

  it('a mediodía toca la comida aunque el desayuno siga vacío', () => {
    const r = nutricionDeHoy(dia(), [], objetivo, h(13, 40));
    expect(r.toca).toBe(2);
  });

  it('si la de ahora ya está, toca la siguiente que falta', () => {
    const meals = dia(500, null, 800);
    const r = nutricionDeHoy(meals, hechosDe(meals), objetivo, h(14));
    expect(r.toca).toBe(3);
    expect(r.kcal).toBe(1300);
    expect(r.kcalPorComida).toBe(367); // 1.100 que quedan entre 3 comidas
    expect(r.comidas[2]).toMatchObject({ registrada: true, kcal: 800 });
  });

  it('por la noche, con la cena hecha, vuelve a la que se quedó atrás', () => {
    const meals = dia(500, 200, 800, null, 700);
    const r = nutricionDeHoy(meals, hechosDe(meals), objetivo, h(23));
    expect(r.toca).toBe(3);
  });

  it('lo apuntado sin marcar no cuenta como registrado', () => {
    const r = nutricionDeHoy(dia(500), [], objetivo, h(9));
    expect(r.comidas[0].registrada).toBe(false);
    expect(r.kcal).toBe(0);
  });

  it('con todo registrado no toca nada y se cierra si cuadra el objetivo', () => {
    const meals = dia(500, 200, 800, 300, 560);
    const r = nutricionDeHoy(meals, hechosDe(meals), objetivo, h(22));
    expect(r.toca).toBeNull();
    expect(r.todoRegistrado).toBe(true);
    expect(r.cerrado).toBe(true);
  });

  it('una comida libre no queda pendiente', () => {
    const meals = dia(500, 200, 800, 300);
    meals[4].libre = true;
    const r = nutricionDeHoy(meals, hechosDe(meals), objetivo, h(21));
    expect(r.toca).toBeNull();
    expect(r.todoRegistrado).toBe(true);
  });
});

describe('diaCerrado', () => {
  const obj: Macros = { kcal: 2000, p: 150, hc: 0, g: 0 };
  it('pide kcal a ±5 % y proteína al 90 %', () => {
    expect(diaCerrado({ kcal: 1950, p: 140 }, obj, true)).toBe(true);
    expect(diaCerrado({ kcal: 1800, p: 150 }, obj, true)).toBe(false);
    expect(diaCerrado({ kcal: 2000, p: 120 }, obj, true)).toBe(false);
    expect(diaCerrado({ kcal: 2000, p: 150 }, obj, false)).toBe(false);
  });
});
