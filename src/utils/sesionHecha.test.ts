import { describe, it, expect } from 'vitest';
import type { WorkoutExercise, WorkoutLog } from '../types';
import { ejerciciosDeSesionHecha, logDeAsignacion } from './sesionHecha';

const ej = (exerciseId: string, order: number): WorkoutExercise =>
  ({ exerciseId, order, sets: 3, reps: '8-10', restSeconds: 90, rir: 2 });

const entrada = (exerciseId: string, reps: number[]) =>
  ({ exerciseId, sets: reps.map(r => ({ weight: 50, repsDone: r, rir: 1 })) });

/* 13-10: el lunes entrenado se pintaba con la rutina de HOY. Al cambiar el
   mesociclo, las series de los ejercicios que ya no estaban se perdían de la
   pantalla, y si el atleta editaba ese lunes, también del registro. */
describe('ejerciciosDeSesionHecha', () => {
  it('si todo lo apuntado sigue en la rutina, devuelve la rutina tal cual', () => {
    const rutina = [ej('press', 1), ej('remo', 0)];
    const res = ejerciciosDeSesionHecha(rutina, { entries: [entrada('press', [8])] });
    expect(res.map(e => e.exerciseId)).toEqual(['remo', 'press']);
  });

  it('si la rutina cambió, enseña lo que se hizo y no pierde ningún ejercicio', () => {
    const rutinaNueva = [ej('sentadilla', 0), ej('press', 1)];
    const log: Pick<WorkoutLog, 'entries'> = { entries: [entrada('peso-muerto', [6, 5, 5]), entrada('press', [8, 8])] };
    const res = ejerciciosDeSesionHecha(rutinaNueva, log);
    expect(res.map(e => e.exerciseId)).toEqual(['peso-muerto', 'press']);
    // El que ya no está en la rutina se pauta con lo que se hizo.
    expect(res[0]).toMatchObject({ sets: 3, reps: '5-6' });
    // El que sigue conserva la pauta de la rutina.
    expect(res[1]).toMatchObject({ sets: 3, reps: '8-10' });
  });

  it('sin rutina (borrada) reconstruye la sesión entera desde el registro', () => {
    const res = ejerciciosDeSesionHecha([], { entries: [entrada('curl', [12, 12])] });
    expect(res).toEqual([expect.objectContaining({ exerciseId: 'curl', sets: 2, reps: '12' })]);
  });
});

describe('logDeAsignacion', () => {
  const log = (id: string, assignmentId: string, date: string, workoutId = 'w1') =>
    ({ id, assignmentId, date, workoutId });

  it('encuentra el registro de una asignación recreada (id nuevo) por su fecha', () => {
    const logs = [log('l1', 'a-vieja', '2026-10-12')];
    expect(logDeAsignacion(logs, { id: 'a-nueva', date: '2026-10-12', workoutId: 'w1' })?.id).toBe('l1');
  });

  it('prefiere el registro con su mismo id', () => {
    const logs = [log('l1', 'otra', '2026-10-12'), log('l2', 'a1', '2026-10-12')];
    expect(logDeAsignacion(logs, { id: 'a1', date: '2026-10-12', workoutId: 'w1' })?.id).toBe('l2');
  });
});
