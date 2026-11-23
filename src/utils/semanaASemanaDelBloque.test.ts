import { describe, expect, it } from 'vitest';
import type { Exercise, Mesocycle, Workout, WorkoutExercise, WorkoutLog } from '../types';
import { semanaASemanaDelBloque, textoSerieCorta } from './semanaASemanaDelBloque';

const meso = {
  id: 'm1', athleteId: 'a@b.c', number: 1, weeks: 4, startDate: '2026-09-07', objective: '', daysPerWeek: 2,
  groups: {}, semanasDescarga: [4],
} as unknown as Mesocycle;

const pauta = (exerciseId: string, order: number, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({ exerciseId, order, sets: 3, reps: '8-10', rir: 2, restSeconds: 120, ...extra });

const workouts = [
  { id: 'w1', ownerId: 'c', name: 'Torso · Ana · Meso #1', mesocycleId: 'm1', dayIndex: 0,
    exercises: [pauta('banca', 0), pauta('remo', 1, { weeklyProgression: [{ atWeek: 3, cambios: { exerciseId: 'jalon' } }] })] },
  { id: 'w2', ownerId: 'c', name: 'Pierna · Ana · Meso #1', mesocycleId: 'm1', dayIndex: 1,
    exercises: [pauta('sentadilla', 0)] },
] as Workout[];

const exercises = [
  { id: 'banca', name: 'Press banca' }, { id: 'remo', name: 'Remo' }, { id: 'jalon', name: 'Jalón' },
  { id: 'sentadilla', name: 'Sentadilla' }, { id: 'curl', name: 'Curl' },
] as Exercise[];

let n = 0;
const log = (date: string, workoutId: string, entries: Record<string, [number, number][]>, extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `l${n++}`, athleteId: 'a@b.c', workoutId, assignmentId: 'as', mesocycleId: 'm1', date, completedAt: date,
  entries: Object.entries(entries).map(([exerciseId, sets]) => ({
    exerciseId, sets: sets.map(([weight, repsDone]) => ({ weight, repsDone, rir: 2 })),
  })),
  ...extra,
});

const calcular = (logs: WorkoutLog[], hoy = '2026-09-24') => semanaASemanaDelBloque({ meso, workouts, logs, exercises, hoy });

describe('cada ejercicio, semana a semana', () => {
  it('pone cada registro en su sesión, ejercicio y semana, con todas sus series', () => {
    const r = calcular([
      log('2026-09-07', 'w1', { banca: [[80, 10], [80, 9], [80, 8]] }),
      log('2026-09-14', 'w1', { banca: [[82.5, 10], [82.5, 9], [82.5, 9]] }),
    ]);
    expect(r.semanas.map(s => s.n)).toEqual([1, 2, 3, 4]);
    expect(r.sesiones.map(s => s.nombre)).toEqual(['Torso', 'Pierna']);
    const banca = r.sesiones[0].filas[0];
    expect(banca.nombre).toBe('Press banca');
    expect(banca.semanas[0].veces[0].series.map(textoSerieCorta)).toEqual(['80 × 10', '80 × 9', '80 × 8']);
    expect(banca.semanas[0].plan).toMatchObject({ esquema: '3×8-10', rir: 'RIR 2' });
    expect(banca.semanas[0].estado).toBe('cumple');
    expect(banca.semanas[1].vsAnterior).toBe('sube');
    expect(banca.semanas[1].mejor).toMatchObject({ kg: 82.5, reps: 10 });
    expect(banca.cambioPct).toBeGreaterThan(0);
  });

  it('distingue lo corto, lo no hecho, lo de esta semana y lo que está por llegar', () => {
    const r = calcular([log('2026-09-07', 'w1', { banca: [[80, 10], [80, 7]] })]);
    const banca = r.sesiones[0].filas[0];
    expect(banca.semanas.map(c => c.estado)).toEqual(['corto', 'sin_hacer', 'pendiente', 'por_llegar']);
    // La descarga quita la mitad de las series en la S4.
    expect(r.semanas[3].marca).toBe('descarga');
    expect(banca.semanas[3].plan?.series).toBe(2);
  });

  it('sigue el cambio de ejercicio programado y no pierde lo que no está en el plan', () => {
    const r = calcular([
      log('2026-09-21', 'w1', { jalon: [[50, 10], [50, 10], [50, 9]], curl: [[14, 12]] }),
    ]);
    const fila = r.sesiones[0].filas[1];
    expect(fila.semanas[2].otroEjercicio).toBe('Jalón');
    expect(fila.semanas[2].veces).toHaveLength(1);
    expect(r.fueraDelPlan.map(f => f.nombre)).toEqual(['Curl']);
  });

  it('busca la sesión por el ejercicio si la rutina ya no existe, y deja fuera otros bloques', () => {
    const r = calcular([
      log('2026-09-08', 'rutina-borrada', { sentadilla: [[100, 8]] }),
      log('2026-09-09', 'w2', { sentadilla: [[999, 1]] }, { mesocycleId: 'otro' }),
    ]);
    expect(r.sesiones[1].filas[0].semanas[0].veces).toHaveLength(1);
    expect(r.registros).toBe(1);
  });

  it('la sesión de fuera se enseña pero no cuenta para la fuerza', () => {
    const r = calcular([log('2026-09-07', 'w1', { banca: [[60, 10]] }, { fuera: true })]);
    const celda = r.sesiones[0].filas[0].semanas[0];
    expect(celda.veces[0].fuera).toBe(true);
    expect(celda.mejor).toBeNull();
  });
});
