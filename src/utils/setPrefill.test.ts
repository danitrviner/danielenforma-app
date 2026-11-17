import { describe, expect, it } from 'vitest';
import { Workout, WorkoutEntryLog, WorkoutExercise, WorkoutLog } from '../types';
import { prefillWorkoutSets, entradasDeLaUltimaVez, tieneSeriesValidas } from './setPrefill';

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

  it('con histórico: el peso y las reps salen de la última sesión, el RIR NO', () => {
    // El RIR es la pauta del entrenador, no una marca personal. Heredarlo
    // hacía que a partir del segundo día el atleta viera el que tecleó él, no
    // el que le pautaron — y un error de dedo se arrastraba para siempre.
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [
        { weight: 60, repsDone: 8, rir: 1 },
        { weight: 60, repsDone: 7, rir: 0 },
        { weight: 57.5, repsDone: 6, rir: 0 },
      ],
    }];
    const rows = prefillWorkoutSets(WORKOUT, prev);
    expect(rows[0][0]).toEqual({ weight: '60', repsDone: '8', rir: '2', done: false });
    expect(rows[0][2]).toEqual({ weight: '57.5', repsDone: '6', rir: '2', done: false });
  });

  it('haber ido al fallo un día no convierte el ejercicio en un ejercicio al fallo', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [{ weight: 60, repsDone: 9, rir: 0, alFallo: true }],
    }];
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, sets: 1 }] }, prev);
    expect(rows[0][0].rir).toBe('2');
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

  it('14-b: drop set y myo-reps traen sus bajadas / miniseries ya puestas, detrás de las series', () => {
    const drop = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, technique: 'dropset' }] }, [])[0];
    expect(drop).toHaveLength(5);
    expect(drop.slice(0, 3).every(r => !r.segmento)).toBe(true);
    expect(drop.slice(3)).toEqual([
      { weight: '', repsDone: '', rir: '0', done: false, segmento: true, segmentoDe: 3 },
      { weight: '', repsDone: '', rir: '0', done: false, segmento: true, segmentoDe: 3 },
    ]);
    const myo = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, technique: 'myoreps', tecnicaAjustes: { myoreps: { repsActivacion: '12-15', miniSeries: '4-6', repsMini: '3-5', descansoSeg: 15 } } }] }, [])[0];
    expect(myo.filter(r => r.segmento)).toHaveLength(4);
    expect(prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, technique: 'amrap' }] }, [])[0]).toHaveLength(3);
  });

  it('lo de la última vez se lee por serie principal aunque las bajadas fueran en medio', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [
        { weight: 60, repsDone: 10, rir: 0 },
        { weight: 48, repsDone: 8, rir: 0, segmento: true, segmentoDe: 1 },
        { weight: 62.5, repsDone: 9, rir: 1 },
        { weight: 62.5, repsDone: 8, rir: 1 },
      ],
    }];
    const rows = prefillWorkoutSets(WORKOUT, prev)[0];
    expect(rows.map(r => r.weight)).toEqual(['60', '62.5', '62.5']);
  });

  it('F7a: donde tocaba subir, en descarga / puente / parón la fila repite lo de la última vez', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [{ weight: 60, repsDone: 10, rir: 2 }, { weight: 60, repsDone: 10, rir: 2 }, { weight: 60, repsDone: 10, rir: 3 }],
    }];
    // Semana normal: llega con la carga nueva y el mínimo del rango.
    expect(prefillWorkoutSets(WORKOUT, prev)[0][0]).toEqual({ weight: '62.5', repsDone: '8', rir: '2', done: false });
    for (const semana of ['descarga', 'puente', 'paron'] as const) {
      const rows = prefillWorkoutSets(WORKOUT, prev, undefined, semana)[0];
      expect(rows.map(r => `${r.weight}x${r.repsDone}`)).toEqual(['60x10', '60x10', '60x10']);
    }
  });

  it('F19: si la última vez hubo menos series que hoy, las de más copian la última serie válida', () => {
    // Venía de una descarga con 2 series; hoy vuelven las 4.
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [{ weight: 60, repsDone: 9, rir: 2 }, { weight: 57.5, repsDone: 8, rir: 2 }],
    }];
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, sets: 4 }] }, prev)[0];
    expect(rows.map(r => `${r.weight}x${r.repsDone}`)).toEqual(['60x9', '57.5x8', '57.5x8', '57.5x8']);
    expect(rows.every(r => r.rir === '2' && !r.done)).toBe(true);
  });

  it('F19: una serie guardada a 0 repeticiones no deja su fila en blanco', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [{ weight: 60, repsDone: 9, rir: 2 }, { weight: 0, repsDone: 0, rir: 0 }],
    }];
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, sets: 2 }] }, prev)[0];
    expect(rows[1]).toMatchObject({ weight: '60', repsDone: '9' });
  });

  it('F19: si las series de más siguen a una que sube, suben con ella (la tabla no mezcla pesos)', () => {
    const prev: WorkoutEntryLog[] = [{
      exerciseId: 'ex1',
      sets: [{ weight: 60, repsDone: 10, rir: 2 }, { weight: 60, repsDone: 10, rir: 2 }],
    }];
    const rows = prefillWorkoutSets(WORKOUT, prev)[0];
    expect(rows.map(r => `${r.weight}x${r.repsDone}`)).toEqual(['62.5x8', '62.5x8', '62.5x8']);
  });
});

describe('entradasDeLaUltimaVez (F19)', () => {
  const log = (id: string, date: string, entries: WorkoutEntryLog[]): WorkoutLog =>
    ({ id, athleteId: 'a@x.com', workoutId: 'w1', assignmentId: `as-${id}`, date, completedAt: date, entries });
  const serie = (weight: number, repsDone: number) => ({ weight, repsDone, rir: 2 });

  it('tieneSeriesValidas: hace falta alguna serie principal con repeticiones', () => {
    expect(tieneSeriesValidas({ sets: [] })).toBe(false);
    expect(tieneSeriesValidas({ sets: [{ weight: 0, repsDone: 0, rir: 0 }] })).toBe(false);
    expect(tieneSeriesValidas({ sets: [{ weight: 20, repsDone: 8, rir: 0, segmento: true }] })).toBe(false);
    // Peso corporal: 0 kg con repeticiones es una serie de verdad.
    expect(tieneSeriesValidas({ sets: [{ weight: 0, repsDone: 12, rir: 2 }] })).toBe(true);
  });

  it('la sesión más reciente de cada ejercicio, anterior a la fecha', () => {
    const logs = [
      log('l1', '2026-11-03', [{ exerciseId: 'ex1', sets: [serie(50, 8)] }, { exerciseId: 'ex2', sets: [serie(20, 12)] }]),
      log('l2', '2026-11-10', [{ exerciseId: 'ex1', sets: [serie(55, 8)] }]),
      log('l3', '2026-11-17', [{ exerciseId: 'ex1', sets: [serie(60, 8)] }]),
    ];
    const entradas = entradasDeLaUltimaVez(logs, '2026-11-17');
    expect(entradas.find(e => e.exerciseId === 'ex1')!.sets[0].weight).toBe(55);
    expect(entradas.find(e => e.exerciseId === 'ex2')!.sets[0].weight).toBe(20);
  });

  it('un ejercicio saltado con motivo no es «la última vez»: se usa la sesión anterior con series', () => {
    const logs = [
      log('l1', '2026-11-03', [{ exerciseId: 'ex1', sets: [serie(55, 8), serie(55, 7)], note: 'Bien' }]),
      log('l2', '2026-11-10', [{ exerciseId: 'ex1', sets: [], note: 'No lo hice: máquina ocupada' }]),
    ];
    const [entrada] = entradasDeLaUltimaVez(logs, '2026-11-17');
    expect(entrada.sets.map(x => x.weight)).toEqual([55, 55]);
    // Y con eso la tabla ya no llega en blanco.
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, sets: 2 }] }, [entrada])[0];
    expect(rows.map(r => r.weight)).toEqual(['55', '55']);
  });

  it('la nota y la respuesta del coach siguen siendo las de la entrada más reciente', () => {
    const respuesta = { text: 'Hazlo en la multipower', at: '2026-11-11' } as NonNullable<WorkoutEntryLog['noteReply']>;
    const logs = [
      log('l1', '2026-11-03', [{ exerciseId: 'ex1', sets: [serie(55, 8)], note: 'Bien', nuevaReferencia: true }]),
      log('l2', '2026-11-10', [{ exerciseId: 'ex1', sets: [], note: 'No lo hice: me molestaba', noteReply: respuesta }]),
    ];
    const [entrada] = entradasDeLaUltimaVez(logs, '2026-11-17');
    expect(entrada.note).toBe('No lo hice: me molestaba');
    expect(entrada.noteReply).toEqual(respuesta);
    expect(entrada.nuevaReferencia).toBe(true);
    expect(entrada.sets).toHaveLength(1);
  });

  it('sin ninguna sesión con series, devuelve la más reciente tal cual', () => {
    const saltada: WorkoutEntryLog = { exerciseId: 'ex1', sets: [], note: 'No lo hice: sin tiempo' };
    expect(entradasDeLaUltimaVez([log('l1', '2026-11-10', [saltada])], '2026-11-17')).toEqual([saltada]);
  });

  it('al corregir una sesión ya hecha, su propio registro no cuenta', () => {
    const logs = [
      log('l1', '2026-11-03', [{ exerciseId: 'ex1', sets: [serie(50, 8)] }]),
      log('l2', '2026-11-10', [{ exerciseId: 'ex1', sets: [serie(55, 8)] }]),
    ];
    expect(entradasDeLaUltimaVez(logs, '2026-11-11', 'l2')[0].sets[0].weight).toBe(50);
  });
});
