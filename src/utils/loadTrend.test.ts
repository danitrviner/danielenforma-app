import { describe, expect, it } from 'vitest';
import { WorkoutLog } from '../types';
import { ewmaDeSeriePorSesion } from './loadTrend';

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number }[]): WorkoutLog => ({
  id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series.map(s => ({ ...s, rir: 2 })) }],
});

describe('ewmaDeSeriePorSesion', () => {
  it('toma el mejor e1RM por día y suaviza con EWMA', () => {
    const logs = [
      log('2026-08-01', 'press', [{ weight: 100, repsDone: 1 }]), // epley(100,1) = 103.3
      log('2026-08-08', 'press', [{ weight: 100, repsDone: 1 }]),
      log('2026-08-15', 'press', [{ weight: 50, repsDone: 1 }]),  // mal día, epley(50,1) = 51.7
    ];
    const ewma = ewmaDeSeriePorSesion(logs, 'press', 0.3);
    expect(ewma.map(p => p.date)).toEqual(['2026-08-01', '2026-08-08', '2026-08-15']);
    expect(ewma[0].value).toBe(103.3);
    expect(ewma[2].value).toBe(87.82); // 0.3*51.7 + 0.7*103.3
  });

  it('ignora entries de otros ejercicios', () => {
    const logs = [log('2026-08-01', 'sentadilla', [{ weight: 100, repsDone: 1 }])];
    expect(ewmaDeSeriePorSesion(logs, 'press')).toEqual([]);
  });

  it('con dos sets el mismo día, se queda con el mejor, no los suma', () => {
    const logs = [log('2026-08-01', 'press', [{ weight: 100, repsDone: 1 }, { weight: 120, repsDone: 1 }])];
    expect(ewmaDeSeriePorSesion(logs, 'press')[0].value).toBe(124); // epley(120,1) = 124
  });
});
