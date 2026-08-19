import { describe, expect, it } from 'vitest';
import { WorkoutLog } from '../types';
import { exerciseBestProgress, exerciseWeightTrend, exerciseSessionHistory } from './athleteMetrics';

function log(date: string, exerciseId: string, sets: { weight: number; repsDone: number }[]): WorkoutLog {
  return {
    id: date, athleteId: 'a1', workoutId: 'w1', assignmentId: 'as1', date, completedAt: `${date}T10:00:00.000Z`,
    entries: [{ exerciseId, sets: sets.map(s => ({ ...s, rir: 2 })) }],
  };
}

describe('exerciseBestProgress', () => {
  it('sin logs del ejercicio: null', () => {
    expect(exerciseBestProgress([], 'ex1')).toBeNull();
  });

  it('un solo registro: sin delta previo', () => {
    const logs = [log('2026-08-01', 'ex1', [{ weight: 60, repsDone: 8 }])];
    const r = exerciseBestProgress(logs, 'ex1');
    expect(r?.current.weight).toBe(60);
    expect(r?.deltaKgVsPrevious).toBeNull();
  });

  it('calcula el delta en kg contra el mejor set anterior a la fecha del actual', () => {
    const logs = [
      log('2026-07-01', 'ex1', [{ weight: 60, repsDone: 8 }]),
      log('2026-08-01', 'ex1', [{ weight: 65, repsDone: 8 }]),
    ];
    const r = exerciseBestProgress(logs, 'ex1');
    expect(r?.current.weight).toBe(65);
    expect(r?.deltaKgVsPrevious).toBe(5);
  });

  it('ignora ejercicios distintos', () => {
    const logs = [log('2026-08-01', 'ex2', [{ weight: 100, repsDone: 5 }])];
    expect(exerciseBestProgress(logs, 'ex1')).toBeNull();
  });
});

describe('exerciseWeightTrend', () => {
  it('sin logs del ejercicio: array vacío', () => {
    expect(exerciseWeightTrend([], 'ex1')).toEqual([]);
  });

  it('un valor por sesión, el peso máximo de esa sesión, en orden cronológico', () => {
    const logs = [
      log('2026-08-03', 'ex1', [{ weight: 60, repsDone: 8 }]),
      log('2026-08-01', 'ex1', [{ weight: 50, repsDone: 10 }, { weight: 55, repsDone: 6 }]),
    ];
    expect(exerciseWeightTrend(logs, 'ex1')).toEqual([55, 60]);
  });

  it('recorta a las últimas `sessionsBack` sesiones', () => {
    const logs = Array.from({ length: 10 }, (_, i) =>
      log(`2026-08-${String(i + 1).padStart(2, '0')}`, 'ex1', [{ weight: 50 + i, repsDone: 8 }]));
    expect(exerciseWeightTrend(logs, 'ex1', 8)).toEqual([52, 53, 54, 55, 56, 57, 58, 59]);
  });
});

describe('exerciseSessionHistory', () => {
  it('sin logs del ejercicio: array vacío', () => {
    expect(exerciseSessionHistory([], 'ex1')).toEqual([]);
  });

  it('una entrada por sesión con sus series reales, más reciente primero', () => {
    const logs = [
      log('2026-08-01', 'ex1', [{ weight: 50, repsDone: 10 }, { weight: 55, repsDone: 6 }]),
      log('2026-08-03', 'ex1', [{ weight: 60, repsDone: 8 }]),
    ];
    expect(exerciseSessionHistory(logs, 'ex1')).toEqual([
      { date: '2026-08-03', sets: [{ weight: 60, reps: 8 }] },
      { date: '2026-08-01', sets: [{ weight: 50, reps: 10 }, { weight: 55, reps: 6 }] },
    ]);
  });

  it('ignora ejercicios distintos y sesiones sin series de ese ejercicio', () => {
    const logs = [log('2026-08-01', 'ex2', [{ weight: 100, repsDone: 5 }])];
    expect(exerciseSessionHistory(logs, 'ex1')).toEqual([]);
  });

  it('recorta al límite pedido (10 por defecto)', () => {
    const logs = Array.from({ length: 15 }, (_, i) =>
      log(`2026-08-${String(i + 1).padStart(2, '0')}`, 'ex1', [{ weight: 50 + i, repsDone: 8 }]));
    const history = exerciseSessionHistory(logs, 'ex1');
    expect(history).toHaveLength(10);
    expect(history[0].date).toBe('2026-08-15');
    expect(history[9].date).toBe('2026-08-06');
  });
});
