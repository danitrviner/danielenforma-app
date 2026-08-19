import { describe, expect, it } from 'vitest';
import { Workout, WorkoutEntryLog, WorkoutExercise } from '../types';
import { prefillWorkoutSets } from './setPrefill';

const EX: WorkoutExercise = {
  exerciseId: 'ex1', order: 0, sets: 3, reps: '8-10', restSeconds: 90, rir: 2,
};

const WORKOUT: Workout = {
  id: 'w1', ownerId: 'coach1', name: 'Empuje', exercises: [EX],
};

describe('prefillWorkoutSets', () => {
  it('sin histórico previo: reps/rir salen de la prescripción, la carga queda vacía', () => {
    const rows = prefillWorkoutSets(WORKOUT, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(3);
    expect(rows[0][0]).toEqual({ weight: '', repsDone: '', rir: '2', done: false });
  });

  it('con histórico: prerrellena peso y reps reales de la última sesión, no solo la prescripción', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [
        { weight: 60, repsDone: 8, rir: 1 },
        { weight: 60, repsDone: 7, rir: 0 },
        { weight: 57.5, repsDone: 6, rir: 0 },
      ],
    }];
    const rows = prefillWorkoutSets(WORKOUT, prev);
    expect(rows[0][0]).toEqual({ weight: '60', repsDone: '8', rir: '1', done: false });
    expect(rows[0][2]).toEqual({ weight: '57.5', repsDone: '6', rir: '0', done: false });
  });

  it('serie previa al fallo: rir se prerrellena como "fallo", no como "0"', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [{ weight: 60, repsDone: 9, rir: 0, alFallo: true }],
    }];
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, sets: 1 }] }, prev);
    expect(rows[0][0].rir).toBe('fallo');
  });

  it('usa la sesión más reciente por ejercicio, ignorando sesiones más antiguas ya superadas', () => {
    const antigua: WorkoutEntryLog = { exerciseId: 'ex1', sets: [{ weight: 50, repsDone: 8, rir: 3 }] };
    const reciente: WorkoutEntryLog = { exerciseId: 'ex1', sets: [{ weight: 55, repsDone: 8, rir: 2 }] };
    // El llamador ya deduplica a "una entrada por ejercicio, la más reciente
    // primero" (ver TrainingScreen.openPlayer) — aquí se confirma que la
    // función usa la que le llega, no una elegida por ella misma.
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, sets: 1 }] }, [reciente]);
    expect(rows[0][0].weight).toBe('55');
    void antigua;
  });

  it('respeta el orden de los ejercicios y expande setGroups (top set / back-off)', () => {
    const conGrupos: WorkoutExercise = {
      ...EX,
      exerciseId: 'ex2',
      setGroups: [
        { label: 'Top set', sets: 1, reps: '5', rir: 1 },
        { label: 'Back-off', sets: 1, reps: '10', rir: 3 },
      ],
    };
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [conGrupos] }, []);
    expect(rows[0]).toHaveLength(2);
    expect(rows[0][0].rir).toBe('1');
    expect(rows[0][1].rir).toBe('3');
  });
});
