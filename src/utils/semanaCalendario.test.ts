import { describe, it, expect } from 'vitest';
import { ejerciciosDelDia, diasDeLaSemana, rotuloDeSemana, DatosSemana } from './semanaCalendario';
import { Workout, Exercise, WorkoutAssignment, WorkoutLog, Mesocycle, MuscleGroup, MuscleGroupConfig } from '../types';

const grupos = () => ({ pecho: { series: 12, priority: 'alta' } } as unknown as Record<MuscleGroup, MuscleGroupConfig>);

const meso: Mesocycle = {
  id: 'm1', athleteId: 'a@b.com', number: 1, weeks: 6, startDate: '2026-09-07',
  objective: 'Hipertrofia', daysPerWeek: 3, groups: grupos(),
};
const exercises: Exercise[] = [
  { id: 'e1', ownerId: 'c', name: 'Press banca', primaryFocus: 'pecho', muscleGroup: 'pecho', type: 'fuerza', isCustom: false },
  { id: 'e2', ownerId: 'c', name: 'Remo con barra', primaryFocus: 'dorsal', muscleGroup: 'dorsal', type: 'fuerza', isCustom: false },
];
const workout: Workout = {
  id: 'w1', ownerId: 'c', name: 'Empuje', mesocycleId: 'm1',
  exercises: [
    { exerciseId: 'e2', order: 1, sets: 4, reps: '10-12', restSeconds: 90, rir: 2 },
    { exerciseId: 'e1', order: 0, sets: 3, reps: '8-10', restSeconds: 120, rir: 2, weeklyProgression: [{ atWeek: 2, addSets: 2 }] },
  ],
};
const asignacion: WorkoutAssignment = { id: 'a1', athleteId: 'a@b.com', workoutId: 'w1', date: '2026-09-15', status: 'completed' };

const base: DatosSemana = {
  workoutAssignments: [asignacion], workoutLogs: [], workouts: [workout], exercises, mesocycles: [meso],
};

describe('ejerciciosDelDia', () => {
  it('devuelve [] cuando no hay entreno asignado — no inventa una sesión vacía', () => {
    expect(ejerciciosDelDia('2026-09-16', base)).toEqual([]);
  });

  it('devuelve [] si la rutina asignada ya no existe', () => {
    expect(ejerciciosDelDia('2026-09-15', { ...base, workouts: [] })).toEqual([]);
  });

  it('respeta el orden del ejercicio, no el del array', () => {
    expect(ejerciciosDelDia('2026-09-15', base).map(e => e.nombre)).toEqual(['Press banca', 'Remo con barra']);
  });

  it('aplica la progresión de la semana del mesociclo', () => {
    // 15 sep es la semana 2 del meso que empieza el 7 sep → +2 series.
    expect(ejerciciosDelDia('2026-09-15', base)[0].series).toBe(5);
    // El otro ejercicio no tiene progresión y se queda igual.
    expect(ejerciciosDelDia('2026-09-15', base)[1].series).toBe(4);
  });

  it('en la semana 1 la progresión aún no entra', () => {
    const a: WorkoutAssignment = { ...asignacion, id: 'a0', date: '2026-09-08' };
    expect(ejerciciosDelDia('2026-09-08', { ...base, workoutAssignments: [a] })[0].series).toBe(3);
  });

  it('sin mesociclo que resuelva la semana, no revienta: cae a la semana 1', () => {
    expect(ejerciciosDelDia('2026-09-15', { ...base, mesocycles: [] })[0].series).toBe(3);
  });

  it('añade lo registrado por el atleta y la carga MEDIA, no la máxima', () => {
    const log: WorkoutLog = {
      id: 'l1', athleteId: 'a@b.com', workoutId: 'w1', assignmentId: 'a1', date: '2026-09-15', completedAt: '2026-09-15T18:00:00.000Z',
      entries: [{ exerciseId: 'e1', sets: [
        { weight: 80, repsDone: 10, rir: 2 },
        { weight: 90, repsDone: 8, rir: 1 },
      ] }],
    };
    const r = ejerciciosDelDia('2026-09-15', { ...base, workoutLogs: [log] });
    expect(r[0].seriesHechas).toBe(2);
    expect(r[0].pesoMedio).toBe(85);
    // El ejercicio sin registro no se inventa un 0.
    expect(r[1].seriesHechas).toBeUndefined();
    expect(r[1].pesoMedio).toBeUndefined();
  });

  it('usa el nombre del catálogo y aguanta un ejercicio borrado', () => {
    const r = ejerciciosDelDia('2026-09-15', { ...base, exercises: [] });
    expect(r[0].nombre).toBe('Ejercicio');
  });
});

describe('diasDeLaSemana y rotuloDeSemana', () => {
  it('son siete días desde el lunes', () => {
    expect(diasDeLaSemana('2026-08-24')).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
    ]);
  });

  it('el rótulo no repite el mes cuando la semana no lo cruza', () => {
    expect(rotuloDeSemana('2026-08-24')).toBe('24 — 30 ago');
  });

  it('y sí lo dice cuando lo cruza', () => {
    expect(rotuloDeSemana('2026-08-31')).toBe('31 ago — 6 sep');
  });

  it('cruza el año sin romperse', () => {
    expect(diasDeLaSemana('2026-12-28').at(-1)).toBe('2027-01-03');
    expect(rotuloDeSemana('2026-12-28')).toBe('28 dic — 3 ene');
  });
});
