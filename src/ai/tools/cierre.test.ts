import { describe, it, expect } from 'vitest';
import type { Exercise, Mesocycle, Workout, WorkoutAssignment, WorkoutLog } from '../../types';
import { usarFuenteDeDatos, type FuenteDeDatos } from './datos';
import { getCierreBloque } from './lectores';

/* `get_cierre_bloque` contra un bloque acabado con dos sesiones registradas.
   Lo que se comprueba es que devuelve los números del motor de cierre (no
   inventados) con la forma que lee el guion de fin de bloque. */

const EJ: Exercise[] = [{ id: 'press', ownerId: 'c', name: 'Press banca', primaryFocus: '', type: 'fuerza', muscleGroup: 'pecho' } as Exercise];
const MESO = { id: 'm1', athleteId: 'ana@x.com', number: 1, weeks: 4, startDate: '2026-09-28', objective: 'Hipertrofia', daysPerWeek: 2, groups: { pecho: { setsPerWeek: 6, priority: 'alta' } } } as unknown as Mesocycle;
const W: Workout = { id: 'w0', ownerId: 'c', name: 'A', mesocycleId: 'm1', dayIndex: 0, exercises: [{ exerciseId: 'press', order: 0, sets: 3, reps: '8-10', rir: 2, restSeconds: 90 }] };
const asig = (date: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({ id: `a_${date}`, workoutId: 'w0', athleteId: 'ana@x.com', date, status, mesocycleId: 'm1' });
const log = (date: string, kg: number): WorkoutLog => ({ id: `l_${date}`, athleteId: 'ana@x.com', workoutId: 'w0', assignmentId: `a_${date}`, mesocycleId: 'm1', date, completedAt: `${date}T19:00:00.000Z`, entries: [{ exerciseId: 'press', sets: [{ weight: kg, repsDone: 10, rir: 2 }, { weight: kg, repsDone: 9, rir: 2 }, { weight: kg, repsDone: 8, rir: 1 }] }] });

const fuente = {
  getUserProfileByEmail: async () => ({ userId: 'u', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client' }),
  getAllUserProfiles: async () => [{ userId: 'u', email: 'ana@x.com', displayName: 'Ana Ruiz', role: 'client' }],
  getMesocycles: async () => [MESO],
  getWorkoutLogs: async () => [log('2026-09-29', 60), log('2026-10-06', 62), log('2026-10-13', 64), log('2026-10-20', 66)],
  getWorkoutAssignments: async () => [asig('2026-09-29', 'completed'), asig('2026-10-06', 'completed'), asig('2026-10-13', 'completed'), asig('2026-10-20', 'completed'), asig('2026-10-22', 'perdido')],
  getExercises: async () => EJ,
  getWorkouts: async () => [W],
  coachActual: () => ({ uid: 'coach', email: 'danitrviner@gmail.com' }),
  isLocalBypassActive: () => false,
};

describe('get_cierre_bloque', () => {
  it('devuelve el cierre del bloque con sesiones, volumen por grupo, rendimiento y titulares', async () => {
    usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);
    const r = JSON.parse(await getCierreBloque('ana@x.com'));
    expect(r.bloque).toMatchObject({ id: 'm1', numero: 1, semanas: 4, inicio: '2026-09-28', fin: '2026-10-25' });
    expect(r.sesiones.registradas).toBe(4);
    expect(r.sesiones.programadas).toBe(5);
    expect(r.volumen.porGrupo.find((g: { grupo: string }) => /pecho/i.test(g.grupo))).toBeTruthy();
    expect(typeof r.rendimiento.tonelaje.current).toBe('number');
    expect(Array.isArray(r.titulares)).toBe(true);
    expect(typeof r.borradorParaElCliente).toBe('string');
    expect(r.note).toContain('Mesociclo › Cierre');
  });
  it('sin mesociclos lo dice; con un id que no existe, también', async () => {
    usarFuenteDeDatos({ ...fuente, getMesocycles: async () => [] } as unknown as FuenteDeDatos);
    expect(JSON.parse(await getCierreBloque('ana@x.com')).error).toMatch(/no tiene mesociclos/);
    usarFuenteDeDatos(fuente as unknown as FuenteDeDatos);
    expect(JSON.parse(await getCierreBloque('ana@x.com', 'zzz')).error).toMatch(/No existe/);
  });
});
