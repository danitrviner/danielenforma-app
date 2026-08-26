import { describe, expect, it } from 'vitest';
import { Exercise, MuscleGroup, Mesocycle, WorkoutLog } from '../types';
import { buildMovementPatternReport } from './movementPatterns';

const ex = (id: string, name: string, muscleGroup: MuscleGroup, secondary?: MuscleGroup[]): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, secondaryMuscleGroups: secondary,
  type: 'fuerza', isCustom: false,
});

const EJERCICIOS = [
  ex('press', 'Press banca', 'pecho', ['triceps']),
  ex('remo', 'Remo con barra', 'dorsal', ['biceps']),
  ex('curl', 'Curl bíceps', 'biceps'),
  ex('sentadilla', 'Sentadilla', 'cuadriceps'),
  ex('hip-thrust', 'Hip thrust', 'gluteo'),
  ex('plancha', 'Plancha', 'core'), // sin patrón asignado
];

const log = (date: string, exerciseId: string, series: { weight: number; repsDone: number }[]): WorkoutLog => ({
  id: `l-${date}-${exerciseId}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets: series.map(s => ({ ...s, rir: 2 })) }],
});

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm2', athleteId: 'a@b.c', number: 2, weeks: 4, startDate: '2026-06-01',
  objective: 'Hipertrofia', daysPerWeek: 4, groups: {} as Mesocycle['groups'],
  ...over,
});

describe('buildMovementPatternReport', () => {
  it('agrupa por patrón de movimiento, no por grupo muscular', () => {
    const logs = [
      log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }]),
      log('2026-06-03', 'sentadilla', [{ weight: 100, repsDone: 5 }]),
    ];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const torso = r.patterns.find(p => p.group === 'empuje_torso')!;
    const pierna = r.patterns.find(p => p.group === 'empuje_pierna')!;
    expect(torso.tonnage).toBe(640); // 80kg x 8 reps
    expect(pierna.tonnage).toBe(500); // 100kg x 5 reps
  });

  it('reparte un mismo grupo muscular en varios patrones sin dividir el peso (tríceps: torso Y brazo)', () => {
    const logs = [log('2026-06-02', 'press', [{ weight: 80, repsDone: 8 }])];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    const torso = r.patterns.find(p => p.group === 'empuje_torso')!;
    const brazo = r.patterns.find(p => p.group === 'brazo')!;
    // Principal (pecho->torso) pesa 1, secundario (tríceps->torso+brazo) pesa 0.5 en cada uno.
    expect(torso.tonnage).toBe(640);
    expect(brazo.tonnage).toBe(320);
  });

  it('un ejercicio sin patrón asignado (core) no aporta a ningún bucket', () => {
    const logs = [log('2026-06-02', 'plancha', [{ weight: 0, repsDone: 1 }])];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso()],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: null },
    });
    expect(r.patterns.every(p => p.sets === 0)).toBe(true);
  });

  it('calcula el delta de 1RM medio contra el mesociclo anterior', () => {
    const anterior = meso({ id: 'm1', number: 1, startDate: '2026-05-01' });
    const logs = [
      log('2026-05-05', 'sentadilla', [{ weight: 80, repsDone: 5 }]),
      log('2026-06-05', 'sentadilla', [{ weight: 100, repsDone: 5 }]),
    ];
    const r = buildMovementPatternReport({
      logs, exercises: EJERCICIOS, mesocycles: [meso(), anterior],
      periodStart: '2026-06-01', periodEnd: '2026-06-28',
      comparison: { mode: 'mesocycle', currentId: 'm2', previousId: 'm1' },
    });
    const pierna = r.patterns.find(p => p.group === 'empuje_pierna')!;
    expect(pierna.ormDeltaPct).not.toBeNull();
    expect(pierna.ormDeltaPct!).toBeGreaterThan(0);
  });
});
