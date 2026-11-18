import { describe, expect, it } from 'vitest';
import type { WorkoutLog } from '../types';
import { sesionesDelEjercicio, tramoComparable } from './comparabilidad';

const l = (date: string, weight: number, fuera = false): WorkoutLog => ({
  id: date, athleteId: 'a', workoutId: 'w', assignmentId: date, date, completedAt: '',
  ...(fuera ? { fuera: true } : {}),
  entries: [{ exerciseId: 'ex1', sets: [{ weight, repsDone: 8, rir: 1, ...(fuera ? { fuera: true } : {}) }] }],
});

describe('fuera de su gimnasio (17-11-2026)', () => {
  it('las sesiones fuera no entran en el historial comparable ni cortan el tramo', () => {
    const logs = [l('2026-10-20', 80), l('2026-10-27', 30, true), l('2026-11-03', 82.5), l('2026-11-10', 25, true), l('2026-11-17', 85)];
    expect(sesionesDelEjercicio(logs, 'ex1').map(s => s.date)).toEqual(['2026-10-20', '2026-11-03', '2026-11-17']);
    expect(tramoComparable(logs, 'ex1').map(p => p.date)).toEqual(['2026-10-20', '2026-11-03', '2026-11-17']);
  });
});
