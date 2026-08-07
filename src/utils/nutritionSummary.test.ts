import { describe, it, expect } from 'vitest';
import { Diet, AthleteDietConfig } from '../types';
import { pickTodaysDiet, countMealsDone } from './nutritionSummary';

function diet(id: string, mealsItemCounts: number[]): Diet {
  return {
    id, athleteId: 'a@x.com', name: id,
    budget: { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 },
    meals: mealsItemCounts.map((n, i) => ({
      id: `m${i}`, name: `Comida ${i}`,
      items: Array.from({ length: n }, () => ({ category: 'HC' as const, foodLabel: 'x', quantity: 1 })),
    })),
  };
}

describe('pickTodaysDiet', () => {
  it('sin dietas activas, no hay dieta hoy', () => {
    expect(pickTodaysDiet([], null, 'mon')).toBeNull();
  });

  it('con horario, coge la dieta programada ese día', () => {
    const diets = [diet('d1', [1]), diet('d2', [1])];
    const config: AthleteDietConfig = { athleteId: 'a@x.com', activeDietIds: ['d1', 'd2'], weeklySchedule: { mon: 'd2' } };
    expect(pickTodaysDiet(diets, config, 'mon')?.id).toBe('d2');
  });

  it('día libre explícito (null en el horario) no devuelve ninguna dieta', () => {
    const diets = [diet('d1', [1])];
    const config: AthleteDietConfig = { athleteId: 'a@x.com', activeDietIds: ['d1'], weeklySchedule: { mon: null } };
    expect(pickTodaysDiet(diets, config, 'mon')).toBeNull();
  });

  it('sin horario, cae a la primera dieta activa', () => {
    const diets = [diet('d1', [1])];
    const config: AthleteDietConfig = { athleteId: 'a@x.com', activeDietIds: ['d1'] };
    expect(pickTodaysDiet(diets, config, 'mon')?.id).toBe('d1');
  });

  it('ignora dietas en borrador aunque estén "activas"', () => {
    const draftDiet = { ...diet('d1', [1]), isDraft: true };
    const config: AthleteDietConfig = { athleteId: 'a@x.com', activeDietIds: ['d1'] };
    expect(pickTodaysDiet([draftDiet], config, 'mon')).toBeNull();
  });
});

describe('countMealsDone', () => {
  it('cuenta solo las ingestas con items, todas marcadas', () => {
    const d = diet('d1', [2, 0, 1]); // comida vacía (2) no cuenta al total
    expect(countMealsDone(d, ['m0_0', 'm0_1'])).toEqual({ done: 1, total: 2 });
  });

  it('una ingesta parcialmente marcada no cuenta como hecha', () => {
    const d = diet('d1', [2]);
    expect(countMealsDone(d, ['m0_0'])).toEqual({ done: 0, total: 1 });
  });

  it('sin ninguna marcada, 0 de N', () => {
    const d = diet('d1', [1, 1]);
    expect(countMealsDone(d, [])).toEqual({ done: 0, total: 2 });
  });
});
