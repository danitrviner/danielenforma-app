import { describe, expect, it } from 'vitest';
import { Workout, WorkoutEntryLog, WorkoutExercise, WorkoutLog } from '../types';
import { prefillWorkoutSets, entradasDeLaUltimaVez, tieneSeriesValidas, seriesAlMaximo, rirPautadoPorSerie } from './setPrefill';

const EX: WorkoutExercise = {
  exerciseId: 'ex1', order: 0, sets: 3, reps: '8-10', restSeconds: 90, rir: 2,
};

const WORKOUT: Workout = {
  id: 'w1', ownerId: 'coach1', name: 'Empuje', exercises: [EX],
};

describe('D1a: las repeticiones llegan a RIR pautado', () => {
  const UNA: Workout = { ...WORKOUT, exercises: [{ ...EX, sets: 1, reps: '8-12', rir: 1 }] };
  const ultima = (repsDone: number, rir: number, extra: object = { rirApuntado: true }): WorkoutEntryLog[] =>
    [{ exerciseId: 'ex1', sets: [{ weight: 80, repsDone, rir, ...extra }] }];

  it('el ejemplo de Dani: 10 a RIR 0 con RIR 1 pautado → hoy le marca 9', () => {
    expect(prefillWorkoutSets(UNA, ultima(10, 0))[0][0]).toEqual({ weight: '80', repsDone: '9', rir: '1', done: false });
  });

  it('8 a RIR 1 con RIR 1 pautado → 8, y con RIR 3 → 10', () => {
    expect(prefillWorkoutSets(UNA, ultima(8, 1))[0][0].repsDone).toBe('8');
    expect(prefillWorkoutSets(UNA, ultima(8, 3))[0][0].repsDone).toBe('10');
  });

  it('10 a RIR 3 con RIR 1 pautado son 12: llega al tope del rango y la fila sube de carga', () => {
    expect(prefillWorkoutSets(UNA, ultima(10, 3))[0][0]).toEqual({ weight: '82.5', repsDone: '8', rir: '1', done: false });
  });

  it('el RIR que llega es siempre el del coach, no el que apuntó el atleta', () => {
    expect(prefillWorkoutSets(UNA, ultima(10, 0))[0][0].rir).toBe('1');
    expect(prefillWorkoutSets(UNA, ultima(9, 0, { alFallo: true, rirApuntado: true }))[0][0]).toMatchObject({ repsDone: '8', rir: '1' });
  });

  it('sin el RIR apuntado (pautado sin tocar, o registro antiguo) llegan las repeticiones hechas', () => {
    expect(prefillWorkoutSets(UNA, ultima(10, 0, { rirApuntado: false }))[0][0].repsDone).toBe('10');
    expect(prefillWorkoutSets(UNA, ultima(10, 0, {}))[0][0].repsDone).toBe('10');
  });

  it('en descarga también: mismas cargas, repeticiones a RIR pautado, sin subir', () => {
    expect(prefillWorkoutSets(UNA, ultima(10, 3), undefined, 'descarga')[0][0]).toEqual({ weight: '80', repsDone: '12', rir: '1', done: false });
  });
});

describe('D5: las series al máximo llegan con «fallo» y sin repeticiones', () => {
  const prev: WorkoutEntryLog[] = [{
    exerciseId: 'ex1',
    sets: [{ weight: 60, repsDone: 9, rir: 2 }, { weight: 60, repsDone: 9, rir: 2 }, { weight: 60, repsDone: 8, rir: 2 }],
  }];
  const con = (extra: Partial<WorkoutExercise>) => prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, ...extra }] }, prev)[0];

  it('AMRAP en la última serie (lo normal en la semana de test): solo esa', () => {
    const rows = con({ technique: 'amrap' });
    expect(rows[0]).toEqual({ weight: '60', repsDone: '9', rir: '2', done: false });
    expect(rows[1]).toEqual({ weight: '60', repsDone: '9', rir: '2', done: false });
    expect(rows[2]).toEqual({ weight: '60', repsDone: '', rir: 'fallo', done: false });
  });

  it('pautadas al fallo en todas las series: todas', () => {
    const rows = con({ technique: 'fallo', tecnicaAjustes: { series: 'todas' } });
    expect(rows.map(r => `${r.weight}|${r.repsDone}|${r.rir}`)).toEqual(['60||fallo', '60||fallo', '60||fallo']);
  });

  it('«AMRAP» escrito como repeticiones también cuenta', () => {
    const rows = con({ setGroups: [{ sets: 2, reps: '8-10', rir: 2 }, { sets: 1, reps: 'AMRAP', rir: 0 }] });
    expect(rows.map(r => r.rir)).toEqual(['2', '2', 'fallo']);
    expect(rows[2].repsDone).toBe('');
  });

  it('sin historial llega igual: «fallo», y peso y repeticiones vacíos', () => {
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, technique: 'amrap' }] }, [])[0];
    expect(rows[2]).toEqual({ weight: '', repsDone: '', rir: 'fallo', done: false });
  });

  it('si esa serie sube de carga, llega con el peso nuevo y las repeticiones vacías', () => {
    const tope: WorkoutEntryLog[] = [{ exerciseId: 'ex1', sets: [60, 60, 60].map(weight => ({ weight, repsDone: 10, rir: 2 })) }];
    const rows = prefillWorkoutSets({ ...WORKOUT, exercises: [{ ...EX, technique: 'amrap' }] }, tope)[0];
    expect(rows[2]).toEqual({ weight: '62.5', repsDone: '', rir: 'fallo', done: false });
  });

  it('drop set y myo-reps no son series al máximo: conservan su RIR', () => {
    expect(con({ technique: 'dropset' }).slice(0, 3).map(r => r.rir)).toEqual(['2', '2', '2']);
    expect(seriesAlMaximo({ technique: 'myoreps' }, [{ reps: '12-15' }, { reps: '12-15' }]).size).toBe(0);
  });

  it('`rirPautadoPorSerie` da el objetivo de cada serie tal y como se enseña', () => {
    expect(rirPautadoPorSerie({ ...EX, technique: 'amrap' })).toEqual(['2', '2', 'fallo']);
    expect(rirPautadoPorSerie(EX)).toEqual(['2', '2', '2']);
  });
});

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

describe('fuera de su gimnasio (17-11-2026)', () => {
  const ANTERIOR: WorkoutEntryLog[] = [{ exerciseId: 'ex1', sets: [80, 80, 80].map(w => ({ weight: w, repsDone: 10, rir: 2 })) }];

  it('el peso llega vacío y las repeticiones con el mínimo del rango; sin subida aunque tocara', () => {
    // 10 a RIR 2 en 8-10 tocaría subir a 82,5; fuera, nada de eso.
    expect(prefillWorkoutSets(WORKOUT, ANTERIOR)[0][0].weight).toBe('82.5');
    expect(prefillWorkoutSets(WORKOUT, ANTERIOR, undefined, null, true)[0])
      .toEqual([0, 1, 2].map(() => ({ weight: '', repsDone: '8', rir: '2', done: false })));
  });

  it('las series al máximo siguen llegando con «fallo» y sin repeticiones', () => {
    const amrap: Workout = { ...WORKOUT, exercises: [{ ...EX, sets: 2, technique: 'amrap' }] };
    expect(prefillWorkoutSets(amrap, ANTERIOR, undefined, null, true)[0][1]).toEqual({ weight: '', repsDone: '', rir: 'fallo', done: false });
  });

  const log = (id: string, date: string, weight: number, extra: Partial<WorkoutLog> = {}, note?: string): WorkoutLog => ({
    id, athleteId: 'a', workoutId: 'w1', assignmentId: id, date, completedAt: '',
    entries: [{ exerciseId: 'ex1', sets: [{ weight, repsDone: 8, rir: 2, ...(extra.fuera ? { fuera: true } : {}) }], ...(note ? { note } : {}) }],
    ...extra,
  });

  it('la sesión siguiente en su gimnasio toma la última NO fuera, aunque sea antigua; la nota, la más reciente', () => {
    const logs = [
      log('gym', '2026-10-01', 80),
      log('f1', '2026-11-03', 30, { fuera: true }),
      log('f2', '2026-11-10', 25, { fuera: true }, 'Hotel sin barra'),
    ];
    const [e] = entradasDeLaUltimaVez(logs, '2026-11-17');
    expect(e.sets[0].weight).toBe(80);
    expect(e.note).toBe('Hotel sin barra');
  });

  it('si solo hay sesiones fuera, sin referencia (pero con su nota)', () => {
    const [e] = entradasDeLaUltimaVez([log('f1', '2026-11-10', 25, { fuera: true }, 'Mancuernas de 12')], '2026-11-17');
    expect(e.sets).toEqual([]);
    expect(e.note).toBe('Mancuernas de 12');
    expect(prefillWorkoutSets(WORKOUT, [e])[0][0].weight).toBe('');
  });

  it('también vale con la marca solo en las series (registro marcado a medias)', () => {
    const logs = [log('gym', '2026-11-01', 80), { ...log('f', '2026-11-10', 25), entries: [{ exerciseId: 'ex1', sets: [{ weight: 25, repsDone: 8, rir: 2, fuera: true }] }] }];
    expect(entradasDeLaUltimaVez(logs, '2026-11-17')[0].sets[0].weight).toBe(80);
  });
});
