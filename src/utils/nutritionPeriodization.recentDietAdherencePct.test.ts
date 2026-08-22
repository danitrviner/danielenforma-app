import { describe, expect, it } from 'vitest';
import { Diet, DietCompletionLog } from '../types';
import { recentDietAdherencePct } from './nutritionPeriodization';

const diet: Diet = {
  id: 'd1', athleteId: 'a1', name: 'Dieta', selfManaged: false, budget: {} as any,
  meals: [{ id: 'm1', name: 'Comida 1', items: [
    { category: 'PROT', foodLabel: 'f1', quantity: 1 },
    { category: 'PROT', foodLabel: 'f2', quantity: 1 },
  ] }],
};

const mkLog = (date: string, doneItemIds: string[]): DietCompletionLog =>
  ({ id: date, athleteId: 'a1', date, dietId: 'd1', doneItemIds });

describe('recentDietAdherencePct', () => {
  it('sin logs en la ventana, undefined', () => {
    expect(recentDietAdherencePct([], [diet], '2026-08-22')).toBeUndefined();
  });

  it('promedia el % de items completados en los últimos 14 días', () => {
    const logs = [mkLog('2026-08-20', ['m1_0', 'm1_1']), mkLog('2026-08-21', ['m1_0'])];
    expect(recentDietAdherencePct(logs, [diet], '2026-08-22')).toBeCloseTo(75);
  });

  it('ignora logs fuera de la ventana o de una dieta desconocida', () => {
    const logs = [mkLog('2026-07-01', ['m1_0', 'm1_1']), { ...mkLog('2026-08-21', ['m1_0']), dietId: 'unknown' }];
    expect(recentDietAdherencePct(logs, [diet], '2026-08-22')).toBeUndefined();
  });
});
