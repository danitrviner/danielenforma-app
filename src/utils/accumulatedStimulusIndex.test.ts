import { describe, expect, it } from 'vitest';
import { Exercise, Mesocycle, MuscleGroup, WorkoutLog } from '../types';
import { buildAccumulatedStimulusReport } from './accumulatedStimulusIndex';

const ex = (id: string, name: string, muscleGroup: MuscleGroup): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, type: 'fuerza', isCustom: false,
});
const EJERCICIOS = [ex('press', 'Press banca', 'pecho'), ex('curl', 'Curl bíceps', 'biceps')];

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number; rir: number; alFallo?: boolean }[]): WorkoutLog => ({
  id: `l-${date}-${exerciseId}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series }],
});

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@b.c', number: 2, weeks: 4, startDate: '2026-06-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: {} as Mesocycle['groups'],
  ...over,
});

describe('buildAccumulatedStimulusReport', () => {
  it('calcula IEA = series fraccionales × (RIR medio / 10)', () => {
    const logs = [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8, rir: 2 }, { weight: 80, repsDone: 8, rir: 4 }])];
    const r = buildAccumulatedStimulusReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const pecho = r.rows.find(row => row.group === 'pecho')!;
    expect(pecho.fractionalSets).toBe(2);
    expect(pecho.meanRir).toBe(3); // (2+4)/2
    expect(pecho.iea).toBe(0.6); // 2 * (3/10)
  });

  it('series al fallo cuentan como serie fraccional pero se excluyen del RIR medio', () => {
    const logs = [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8, rir: 0, alFallo: true }, { weight: 80, repsDone: 8, rir: 2 }])];
    const r = buildAccumulatedStimulusReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const pecho = r.rows.find(row => row.group === 'pecho')!;
    expect(pecho.fractionalSets).toBe(2); // ambas series cuentan
    expect(pecho.meanRir).toBe(2); // solo la que no fue al fallo
  });

  it('sin ningún RIR registrado en la ventana, IEA es null (no se asume un valor)', () => {
    const logs = [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8, rir: 0, alFallo: true }])];
    const r = buildAccumulatedStimulusReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const pecho = r.rows.find(row => row.group === 'pecho')!;
    expect(pecho.meanRir).toBeNull();
    expect(pecho.iea).toBeNull();
  });

  it('ordena los grupos por series fraccionales descendente', () => {
    const logs = [
      log('2026-06-02', 'press', [{ weight: 80, repsDone: 8, rir: 2 }]),
      log('2026-06-02', 'curl', Array.from({ length: 3 }, () => ({ weight: 20, repsDone: 10, rir: 2 }))),
    ];
    const r = buildAccumulatedStimulusReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    expect(r.rows[0].group).toBe('biceps'); // 3 series > 1 serie de pecho
  });
});
