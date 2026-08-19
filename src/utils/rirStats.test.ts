import { describe, expect, it } from 'vitest';
import { WorkoutLog } from '../types';
import { computeAverageRir } from './rirStats';

const TODAY = new Date('2026-08-07T12:00:00.000Z');

function log(date: string, sets: { rir: number; alFallo?: boolean }[]): WorkoutLog {
  return {
    id: date, athleteId: 'a1', workoutId: 'w1', assignmentId: 'as1', date, completedAt: `${date}T10:00:00.000Z`,
    entries: [{ exerciseId: 'ex1', sets: sets.map(s => ({ weight: 60, repsDone: 8, ...s })) }],
  };
}

describe('computeAverageRir', () => {
  it('sin logs: null, no 0', () => {
    expect(computeAverageRir([], TODAY)).toBeNull();
  });

  it('promedia el rir de las series dentro de la ventana de 28 días', () => {
    const logs = [log('2026-08-05', [{ rir: 2 }, { rir: 4 }])];
    expect(computeAverageRir(logs, TODAY)).toBe(3);
  });

  it('excluye series al fallo del promedio en vez de contarlas como rir 0', () => {
    const logs = [log('2026-08-05', [{ rir: 2 }, { rir: 0, alFallo: true }])];
    expect(computeAverageRir(logs, TODAY)).toBe(2);
  });

  it('ignora logs fuera de la ventana de 28 días', () => {
    const logs = [log('2026-06-01', [{ rir: 5 }])];
    expect(computeAverageRir(logs, TODAY)).toBeNull();
  });

  it('redondea a un decimal', () => {
    const logs = [log('2026-08-05', [{ rir: 2 }, { rir: 3 }, { rir: 3 }])];
    expect(computeAverageRir(logs, TODAY)).toBe(2.7);
  });
});
