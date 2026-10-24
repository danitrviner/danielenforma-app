import { describe, expect, it } from 'vitest';
import { Exercise, MuscleGroup, WorkoutLog, WorkoutSetLog } from '../types';
import { seriesTonelajePorPatron } from './stimulusSeries';

const ex = (id: string, name: string, muscleGroup: MuscleGroup, secondary?: MuscleGroup[]): Exercise => ({
  id, ownerId: 'coach', name, primaryFocus: '', muscleGroup, secondaryMuscleGroups: secondary,
  type: 'fuerza', isCustom: false,
});

const EJERCICIOS = [
  ex('press', 'Press banca', 'pecho', ['triceps']),
  ex('sentadilla', 'Sentadilla', 'cuadriceps'),
  ex('plancha', 'Plancha', 'core'), // sin patrón asignado
];

const log = (date: string, exerciseId: string, sets: WorkoutSetLog[]): WorkoutLog => ({
  id: `l-${date}-${exerciseId}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as',
  date, completedAt: `${date}T10:00:00.000Z`,
  entries: [{ exerciseId, sets }],
});

describe('seriesTonelajePorPatron', () => {
  it('reparte el tonelaje de un ejercicio en todos los patrones de sus grupos', () => {
    const logs = [log('2026-06-01', 'press', [{ weight: 80, repsDone: 8, rir: 2 }])]; // 640 kg
    const series = seriesTonelajePorPatron(logs, EJERCICIOS);
    // pecho (principal, peso 1 -> empuje_torso) 640 + tríceps (secundario, peso 0.5 -> torso Y brazo) 320
    expect(series.find(s => s.pattern === 'empuje_torso')!.points[0].value).toBe(960);
    expect(series.find(s => s.pattern === 'brazo')!.points[0].value).toBe(320);
  });

  it('ignora los grupos sin patrón asignado (core)', () => {
    const logs = [log('2026-06-01', 'plancha', [{ weight: 20, repsDone: 10, rir: 2 }])];
    expect(seriesTonelajePorPatron(logs, EJERCICIOS)).toHaveLength(0);
  });

  it('ignora entradas sin peso ni repeticiones registradas', () => {
    const logs = [log('2026-06-01', 'sentadilla', [{ weight: 0, repsDone: 0, rir: 2 }])];
    expect(seriesTonelajePorPatron(logs, EJERCICIOS)).toHaveLength(0);
  });

  it('acumula por semana natural', () => {
    const logs = [
      log('2026-06-01', 'sentadilla', [{ weight: 100, repsDone: 5, rir: 2 }]), // 500
      log('2026-06-03', 'sentadilla', [{ weight: 100, repsDone: 5, rir: 2 }]), // 500, misma semana
    ];
    const pierna = seriesTonelajePorPatron(logs, EJERCICIOS).find(s => s.pattern === 'empuje_pierna')!;
    expect(pierna.points).toHaveLength(1);
    expect(pierna.points[0].value).toBe(1000);
  });
});
