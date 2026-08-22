import { describe, expect, it } from 'vitest';
import { WorkoutExercise } from '../types';
import { mesocycleWeekNumber, resolveExerciseForWeek } from './progression';

describe('mesocycleWeekNumber', () => {
  it('la fecha de inicio es semana 1', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-01')).toBe(1);
  });

  it('el último día de la semana 1 sigue siendo semana 1', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-07')).toBe(1);
  });

  it('el día 8 ya es semana 2', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-08-08')).toBe(2);
  });

  it('semana 6 tras 5 semanas completas', () => {
    expect(mesocycleWeekNumber('2026-08-01', '2026-09-05')).toBe(6);
  });
});

const BASE: WorkoutExercise = {
  exerciseId: 'ex1', order: 0, sets: 3, reps: '8-10', restSeconds: 90, rir: 2,
};

describe('resolveExerciseForWeek', () => {
  it('sin reglas, devuelve el ejercicio tal cual', () => {
    expect(resolveExerciseForWeek(BASE, 4)).toEqual(BASE);
  });

  it('antes de la primera regla, no aplica nada', () => {
    const we: WorkoutExercise = { ...BASE, weeklyProgression: [{ atWeek: 4, addSets: 1 }] };
    expect(resolveExerciseForWeek(we, 3).sets).toBe(3);
  });

  it('en la semana de la regla, aplica el escalón', () => {
    const we: WorkoutExercise = { ...BASE, weeklyProgression: [{ atWeek: 4, addSets: 1 }] };
    expect(resolveExerciseForWeek(we, 4).sets).toBe(4);
  });

  it('los escalones son acumulativos: el último aplicable gana', () => {
    const we: WorkoutExercise = {
      ...BASE,
      weeklyProgression: [
        { atWeek: 4, addSets: 1 },
        { atWeek: 6, addSets: 2 },
        { atWeek: 9, addSets: 1 },
      ],
    };
    expect(resolveExerciseForWeek(we, 5).sets).toBe(4);  // solo el escalón de la semana 4
    expect(resolveExerciseForWeek(we, 7).sets).toBe(5);  // el de la semana 6 (no se suman entre sí)
    expect(resolveExerciseForWeek(we, 12).sets).toBe(4); // el de la semana 9
  });

  it('sustituye reps y RIR a partir de su semana', () => {
    const we: WorkoutExercise = { ...BASE, weeklyProgression: [{ atWeek: 4, addReps: '10-12', setRir: 1 }] };
    const resolved = resolveExerciseForWeek(we, 4);
    expect(resolved.reps).toBe('10-12');
    expect(resolved.rir).toBe(1);
    expect(resolved.sets).toBe(3); // sin addSets, no cambia
  });

  it('con setGroups, el escalón se aplica solo al último bloque y resincroniza el agregado', () => {
    const we: WorkoutExercise = {
      ...BASE,
      setGroups: [
        { label: 'Top set', sets: 1, reps: '5', rir: 1 },
        { label: 'Back-off', sets: 2, reps: '10-12', rir: 3 },
      ],
      weeklyProgression: [{ atWeek: 4, addSets: 1 }],
    };
    const resolved = resolveExerciseForWeek(we, 4);
    expect(resolved.setGroups?.[0].sets).toBe(1);   // el primer bloque no cambia
    expect(resolved.setGroups?.[1].sets).toBe(3);   // el último bloque sube +1
    expect(resolved.sets).toBe(4);                  // agregado resincronizado (1 + 3)
  });

  it('no deja las series por debajo de 1', () => {
    const we: WorkoutExercise = { ...BASE, sets: 1, weeklyProgression: [{ atWeek: 4, addSets: -5 }] };
    expect(resolveExerciseForWeek(we, 4).sets).toBe(1);
  });

  describe('condición (Bloque H2.2)', () => {
    const withCondition = (fallback: 'mantener' | 'mitad' | 'posponer' | 'avisar'): WorkoutExercise => ({
      ...BASE,
      weeklyProgression: [{ atWeek: 4, addSets: 2, condition: { rows: [{ metric: 'adherenciaDieta', operator: '>=', value: 80 }], fallback } }],
    });

    it('sin conditionCtx, la regla condicional nunca se aplica (a lo seguro)', () => {
      expect(resolveExerciseForWeek(withCondition('mantener'), 4).sets).toBe(3);
    });

    it('con conditionCtx que cumple, se aplica normal', () => {
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 90 };
      expect(resolveExerciseForWeek(withCondition('mantener'), 4, ctx).sets).toBe(5);
    });

    it('fallback "mantener": si no se cumple, la regla no aplica', () => {
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50 };
      expect(resolveExerciseForWeek(withCondition('mantener'), 4, ctx).sets).toBe(3);
    });

    it('fallback "mitad": si no se cumple, aplica la mitad de addSets (redondeado)', () => {
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50 };
      expect(resolveExerciseForWeek(withCondition('mitad'), 4, ctx).sets).toBe(4); // 3 + round(2/2)
    });

    it('sin condición cumplida, cae al escalón anterior que sí aplique', () => {
      const we: WorkoutExercise = {
        ...BASE,
        weeklyProgression: [
          { atWeek: 4, addSets: 1 },
          { atWeek: 6, addSets: 2, condition: { rows: [{ metric: 'adherenciaDieta', operator: '>=', value: 80 }], fallback: 'mantener' } },
        ],
      };
      const ctx = { today: '2026-09-01', workoutAssignments: [], workoutLogs: [], bodyweightLogs: [], dietAdherencePct: 50 };
      expect(resolveExerciseForWeek(we, 7, ctx).sets).toBe(4); // se queda en el escalón de la semana 4
    });
  });
});
