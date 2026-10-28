import { describe, expect, it } from 'vitest';
import type {
  Exercise, Mesocycle, Workout, WorkoutAssignment, WorkoutLog, WorkoutSetLog, WeeklyChallenge, StepLog,
} from '../types';
import { generateChallengeOptions, AutoChallengeInput, ChallengeData } from './challengeOptions';
import { evaluateChallengeProgress, generateAutoChallenge } from './weeklyChallenge';
import { buildChallengeMemory, sinIntento } from './challengeMemory';
import {
  nivelDeRetos, semanasEntrenadas, mesoActivo, planDeLaSemana, rangoDeReps, ultimaVez,
  superaA, recordsBatidos, tablaDeRecords, seguroParaAmrap, ejerciciosMejorados,
} from './planDeLaSemana';
import { avisoDeReto } from './avisoDeReto';
import { addDays } from './trainingWeek';

/* Escenario base, calcado del caso de Dani (28-10-2026): avanzado, 9 semanas
   entrenando, sin un solo registro de pasos, bloque «Hipertrofia 1» en su
   semana 2, y asignaciones sobrantes de un mesociclo anterior. */

const HOY = '2026-10-28';            // miércoles, semana del 26-10
const LUNES = '2026-10-26';
const EMAIL = 'a@x.com';

const ex = (id: string, name: string, muscleGroup?: Exercise['muscleGroup']): Exercise =>
  ({ id, ownerId: 'c', name, primaryFocus: '', type: 'fuerza', isCustom: false, muscleGroup });

const EJERCICIOS: Exercise[] = [
  ex('prensa', 'Prensa pendular', 'cuadriceps'),
  ex('ext', 'Extensiones de cuádriceps en máquina', 'cuadriceps'),
  ex('femoral', 'Curl femoral en máquina', 'isquios'),
  ex('femoral2', 'Curl femoral sentado en máquina', 'isquios'),
  ex('muerto', 'Peso muerto rumano con barra', 'isquios'),
  ex('remo', 'Remo con barra', 'dorsal'),
];

const MESO: Mesocycle = {
  id: 'm1', athleteId: EMAIL, number: 2, name: 'Hipertrofia 1', weeks: 9, startDate: '2026-10-19',
  objective: '', daysPerWeek: 5,
} as unknown as Mesocycle;

const we = (exerciseId: string, order: number, reps = '8-12', muscleGroup?: Exercise['muscleGroup']) =>
  ({ exerciseId, order, sets: 3, reps, restSeconds: 90, rir: 1, ...(muscleGroup ? { muscleGroup } : {}) });

const PIERNA: Workout = {
  id: 'w-pierna', ownerId: 'c', name: 'Pierna · Daniel Briz · Meso #2', mesocycleId: 'm1',
  exercises: [we('prensa', 0), we('ext', 1), we('femoral', 2), we('femoral2', 3), we('muerto', 4)],
} as unknown as Workout;

const VIEJA: Workout = {
  id: 'w-vieja', ownerId: 'c', name: 'Día 1 - Meso #1', mesocycleId: 'm0',
  exercises: [we('remo', 0)],
} as unknown as Workout;

const asig = (id: string, date: string, workoutId: string, mesocycleId: string, status: WorkoutAssignment['status'] = 'pending'): WorkoutAssignment =>
  ({ id, workoutId, athleteId: EMAIL, date, status, mesocycleId });

const ASIGNACIONES: WorkoutAssignment[] = [
  asig('a-pierna', '2026-10-30', 'w-pierna', 'm1'),
  asig('a-vieja', '2026-10-29', 'w-vieja', 'm0'),
];

const s = (weight: number, repsDone: number, rir = 1, alFallo = false): WorkoutSetLog => ({ weight, repsDone, rir, ...(alFallo ? { alFallo } : {}) });

function log(date: string, entries: Record<string, WorkoutSetLog[]>, workoutId = 'w-pierna'): WorkoutLog {
  return {
    id: `l-${date}-${workoutId}`, athleteId: EMAIL, workoutId, assignmentId: `as-${date}`, date, completedAt: date,
    entries: Object.entries(entries).map(([exerciseId, sets]) => ({ exerciseId, sets })),
  };
}

// Nueve semanas con entrenos antes de esta, y las dos últimas sesiones de pierna con datos.
const HISTORIAL: WorkoutLog[] = [
  ...Array.from({ length: 7 }, (_, i) => log(addDays('2026-08-24', i * 7), { remo: [s(60, 10)] }, 'w-otra')),
  log('2026-10-15', {
    prensa: [s(110, 12), s(110, 11)],
    ext: [s(60, 12)],
    femoral: [s(40, 8)],
    femoral2: [s(35, 10)],
    muerto: [s(80, 8)],
  }),
  log('2026-10-22', {
    prensa: [s(120, 12), s(120, 10)],             // tope del rango 8-12 → toca subir
    ext: [s(65, 10, 0, true), s(60, 9)],          // al fallo → «más reserva»
    femoral: [s(40, 8)],                          // igual que la vez anterior → estancado
    femoral2: [s(35, 10)],                        // igual → estancado
    muerto: [s(85, 8)],
  }),
];

const BASE: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: HISTORIAL, exercises: EJERCICIOS,
  completionLogs: [], coachDiets: [], assignments: ASIGNACIONES, projection: null,
  workouts: [PIERNA, VIEJA], mesocycles: [MESO], experienceLevel: 'avanzado',
};

const input = (o: Partial<AutoChallengeInput> = {}): AutoChallengeInput =>
  ({ ...BASE, athleteId: EMAIL, today: HOY, history: [], ...o });

function reto(o: Partial<WeeklyChallenge> & Pick<WeeklyChallenge, 'kind' | 'metric'>): WeeklyChallenge {
  return {
    id: `${EMAIL}_2026-W44`, athleteId: EMAIL, isoWeek: '2026-W44', weekStart: LUNES, weekEnd: '2026-11-01',
    title: 't', description: 'd', origin: 'auto', status: 'activo', createdAt: LUNES, ...o,
  };
}

// ── Nivel ─────────────────────────────────────────────────────────────────────

describe('nivelDeRetos', () => {
  const logsEnSemanas = (n: number) =>
    Array.from({ length: n }, (_, i) => log(addDays('2026-06-01', i * 7), { remo: [s(50, 10)] }));

  it('cuenta semanas distintas con entrenos, sin la semana en curso', () => {
    expect(semanasEntrenadas([...logsEnSemanas(3), log(HOY, { remo: [s(50, 10)] })], LUNES)).toBe(3);
  });

  it('arranque < 4 semanas, constancia 4-7, rendimiento ≥ 8', () => {
    expect(nivelDeRetos({ workoutLogs: logsEnSemanas(3), today: HOY })).toBe('arranque');
    expect(nivelDeRetos({ workoutLogs: logsEnSemanas(4), today: HOY })).toBe('constancia');
    expect(nivelDeRetos({ workoutLogs: logsEnSemanas(8), today: HOY })).toBe('rendimiento');
  });

  it('un avanzado del alta pasa a rendimiento con 2 semanas de datos', () => {
    expect(nivelDeRetos({ workoutLogs: logsEnSemanas(2), today: HOY, experienceLevel: 'avanzado' })).toBe('rendimiento');
    expect(nivelDeRetos({ workoutLogs: logsEnSemanas(1), today: HOY, experienceLevel: 'avanzado' })).toBe('arranque');
  });

  it('el nivel fijado por el coach manda', () => {
    expect(nivelDeRetos({ workoutLogs: logsEnSemanas(10), today: HOY, nivelForzado: 'arranque' })).toBe('arranque');
  });
});

// ── Plan ──────────────────────────────────────────────────────────────────────

describe('planDeLaSemana', () => {
  it('sin rutinas no hay plan (el motor no inventa retos de rendimiento)', () => {
    expect(planDeLaSemana({ assignments: ASIGNACIONES, exercises: EJERCICIOS, today: HOY })).toBeNull();
  });

  it('solo cuenta las sesiones del bloque activo y acorta su nombre', () => {
    const plan = planDeLaSemana({ assignments: ASIGNACIONES, workouts: [PIERNA, VIEJA], mesocycles: [MESO], exercises: EJERCICIOS, today: HOY })!;
    expect(plan.sesiones.map(x => x.assignmentId)).toEqual(['a-pierna']);
    expect(plan.sesiones[0].nombre).toBe('Pierna');
    expect(plan.contexto).toEqual({ bloque: 'Hipertrofia 1', semana: 2, semanas: 9 });
  });

  it('marca el tipo de semana: test, descarga, vuelta de parón y evento', () => {
    const conMeso = (m: Partial<Mesocycle>) => planDeLaSemana({
      assignments: ASIGNACIONES, workouts: [PIERNA], mesocycles: [{ ...MESO, ...m } as Mesocycle], exercises: EJERCICIOS, today: HOY,
    })!.contexto?.tipoSemana;
    expect(conMeso({ semanasTest: [2] })).toBe('test');
    expect(conMeso({ semanasDescarga: [2] })).toBe('descarga');
    expect(conMeso({ vuelveDeParon: true, startDate: LUNES })).toBe('paron');
    expect(conMeso({ eventosSemana: { '2': { tipo: 'vacaciones' } } })).toBe('evento');
  });

  it('mesoActivo ignora bloques terminados o por empezar', () => {
    expect(mesoActivo([MESO], HOY)?.id).toBe('m1');
    expect(mesoActivo([{ ...MESO, startDate: '2026-01-05' } as Mesocycle], HOY)).toBeNull();
    expect(mesoActivo([{ ...MESO, startDate: '2026-11-02' } as Mesocycle], HOY)).toBeNull();
  });

  it('rangoDeReps', () => {
    expect(rangoDeReps('8-12')).toEqual([8, 12]);
    expect(rangoDeReps('10')).toEqual([10, 10]);
    expect(rangoDeReps('AMRAP')).toBeNull();
  });
});

// ── Marcas ────────────────────────────────────────────────────────────────────

describe('marcas', () => {
  it('ultimaVez coge la sesión más reciente antes de la fecha, sin bajadas', () => {
    const conBajada = log('2026-10-25', { prensa: [s(120, 11), { ...s(90, 8), segmento: true }] });
    const uv = ultimaVez([...HISTORIAL, conBajada], 'prensa', HOY)!;
    expect(uv.date).toBe('2026-10-25');
    expect(uv.series).toEqual([{ weight: 120, reps: 11, rir: 1, alFallo: false }]);
  });

  it('superaA: más kilos a las mismas reps o más reps a los mismos kilos', () => {
    const ref = { weight: 100, reps: 8 };
    expect(superaA(ref, { weight: 102.5, reps: 8 })).toBe(true);
    expect(superaA(ref, { weight: 100, reps: 9 })).toBe(true);
    expect(superaA(ref, { weight: 102.5, reps: 7 })).toBe(false);
    expect(superaA(ref, { weight: 100, reps: 8 })).toBe(false);
  });

  it('tablaDeRecords quita las marcas dominadas', () => {
    const logs = [log('2026-10-01', { prensa: [s(100, 10), s(110, 8), s(100, 9), s(90, 9)] })];
    expect(tablaDeRecords(logs, 'prensa', HOY)).toEqual([{ weight: 110, reps: 8 }, { weight: 100, reps: 10 }]);
  });

  it('recordsBatidos cuenta ejercicios con historial, no estrenos', () => {
    const semana = [
      log('2026-10-27', { prensa: [s(120, 13)], ext: [s(60, 9)] }),
      log('2026-10-27', { nuevo: [s(10, 10)] }, 'w-x'),
    ];
    expect(recordsBatidos([...HISTORIAL, ...semana], LUNES, HOY)).toBe(1);
  });

  it('AMRAP: nunca en básicos libres con barra; sí en guiados', () => {
    expect(seguroParaAmrap(ex('x', 'Peso muerto rumano con barra'))).toBe(false);
    expect(seguroParaAmrap(ex('x', 'Sentadilla con barra'))).toBe(false);
    expect(seguroParaAmrap(ex('x', 'Sentadilla hack en máquina'))).toBe(true);
    expect(seguroParaAmrap(ex('x', 'Curl de bíceps con mancuernas'))).toBe(true);
  });
});

// ── Generación ────────────────────────────────────────────────────────────────

describe('retos de rendimiento — generación', () => {
  it('el caso de Dani: un avanzado sin pasos ya no recibe «registra tus pasos»', () => {
    const opts = generateChallengeOptions(input());
    expect(opts[0].kind).not.toBe('racha_registro');
    expect(opts.find(o => o.kind === 'racha_registro')?.score).toBe(5);
    expect(opts[0].contexto).toEqual({ bloque: 'Hipertrofia 1', semana: 2, semanas: 9 });
  });

  it('el reto auto que se guarda lleva el contexto del bloque', () => {
    const ch = generateAutoChallenge(input());
    expect(ch.contexto?.bloque).toBe('Hipertrofia 1');
  });

  it('nunca propone un ejercicio que no está en las sesiones de esta semana', () => {
    const opts = generateChallengeOptions(input());
    expect(opts.some(o => o.metric.exerciseId === 'remo')).toBe(false);
  });

  it('doble progresión: en el tope del rango toca subir de peso', () => {
    const opt = generateChallengeOptions(input()).find(o => o.kind === 'doble_progresion')!;
    expect(opt.metric).toMatchObject({ exerciseId: 'prensa', subirDe: 120, target: 8, assignmentId: 'a-pierna' });
  });

  it('supera tu sesión guarda las marcas de referencia de cada ejercicio', () => {
    const opt = generateChallengeOptions(input()).find(o => o.kind === 'supera_sesion')!;
    expect(opt.metric.workoutId).toBe('w-pierna');
    expect(opt.metric.referencias).toHaveLength(5);
    expect(opt.metric.target).toBeGreaterThanOrEqual(2);
    expect(opt.title).toBe('Pierna: supera a la última vez');
  });

  it('AMRAP: con el peso de la última serie y récord + 1, nunca en el peso muerto', () => {
    const opt = generateChallengeOptions(input()).find(o => o.kind === 'amrap_serie')!;
    expect(opt.metric.exerciseId).not.toBe('muerto');
    expect(opt.metric.target).toBe((opt.metric.baseline ?? 0) + 1);
  });

  it('mismo peso con más reserva sobre la serie que fue al fallo', () => {
    const opt = generateChallengeOptions(input()).find(o => o.kind === 'mas_reserva')!;
    expect(opt.metric).toMatchObject({ exerciseId: 'ext', atWeight: 65, baseline: 10, minRir: 1 });
  });

  it('grupo estancado: el grupo cuyos ejercicios no mejoraron', () => {
    const opt = generateChallengeOptions(input()).find(o => o.kind === 'grupo_estancado')!;
    expect(opt.metric.muscleGroup).toBe('isquios');
    expect(opt.metric.referencias?.map(r => r.exerciseId).sort()).toEqual(['femoral', 'femoral2']);
  });

  it('«Semana completa» solo cuenta las sesiones del bloque activo', () => {
    const opt = generateChallengeOptions(input()).find(o => o.kind === 'entrenos_completados')!;
    expect(opt.metric).toMatchObject({ target: 1, mesocycleId: 'm1' });
    expect(opt.title).toBe('Semana 2 de 9: 1 de 1');
  });

  it('descarga: solo «RIR mínimo», nada de progresar', () => {
    const opts = generateChallengeOptions(input({ mesocycles: [{ ...MESO, semanasDescarga: [2] } as Mesocycle] }));
    expect(opts[0].kind).toBe('rir_minimo');
    expect(opts.some(o => o.kind === 'amrap_serie' || o.kind === 'doble_progresion')).toBe(false);
  });

  it('semana de test: «bate 3 récords»', () => {
    const opts = generateChallengeOptions(input({ mesocycles: [{ ...MESO, semanasTest: [2] } as Mesocycle] }));
    expect(opts[0]).toMatchObject({ kind: 'record_reps', metric: { target: 3 } });
    expect(opts.some(o => o.kind === 'amrap_serie')).toBe(false);
  });

  it('vacaciones: mínimo 2 sesiones con la nota del coach', () => {
    const opts = generateChallengeOptions(input({
      mesocycles: [{ ...MESO, eventosSemana: { '2': { tipo: 'vacaciones', nota: 'Entrena en el hotel.' } } } as Mesocycle],
      assignments: [...ASIGNACIONES, asig('a-2', '2026-10-31', 'w-pierna', 'm1')],
    }));
    expect(opts[0]).toMatchObject({ kind: 'entrenos_completados', metric: { target: 2 } });
    expect(opts[0].description).toContain('Entrena en el hotel.');
  });

  it('arranque: sin retos de rendimiento aunque haya plan', () => {
    const opts = generateChallengeOptions(input({ workoutLogs: HISTORIAL.slice(-2), experienceLevel: 'principiante' }));
    expect(opts.some(o => o.kind === 'doble_progresion' || o.kind === 'amrap_serie')).toBe(false);
  });

  it('constancia: salen, pero por detrás (−15)', () => {
    const r = generateChallengeOptions(input()).find(o => o.kind === 'supera_sesion')!.score;
    const c = generateChallengeOptions(input({ nivelForzado: 'constancia' })).find(o => o.kind === 'supera_sesion')!.score;
    expect(r - c).toBe(15);
  });

  it('rota: el tipo de la semana pasada pierde el primer puesto', () => {
    const primero = generateChallengeOptions(input())[0].kind;
    const pasada = reto({ kind: primero, metric: { unit: 'reps', target: 8 }, isoWeek: '2026-W43', status: 'conseguido', progressValue: 8 });
    expect(generateChallengeOptions(input({ history: [pasada] }))[0].kind).not.toBe(primero);
  });

  it('sin rutinas (llamadores antiguos) se comporta como antes: sin retos de rendimiento', () => {
    const opts = generateChallengeOptions(input({ workouts: undefined }));
    expect(opts.some(o => o.kind === 'supera_sesion')).toBe(false);
  });

  it('el texto del reto de registro ya no dice «unos 0 días»', () => {
    const steps: StepLog[] = [];
    const opts = generateChallengeOptions(input({ workoutLogs: [], stepLogs: steps, bodyweightLogs: [
      { id: 'b1', athleteId: EMAIL, date: '2026-10-20', weight: 80 },
      { id: 'b2', athleteId: EMAIL, date: '2026-10-21', weight: 80 },
      { id: 'b3', athleteId: EMAIL, date: '2026-10-22', weight: 80 },
    ] as ChallengeData['bodyweightLogs'] }));
    const racha = opts.find(o => o.kind === 'racha_registro')!;
    expect(racha.description).not.toContain('unos 0 días');
  });
});

// ── Evaluación ────────────────────────────────────────────────────────────────

describe('retos de rendimiento — evaluación', () => {
  const datos = (semana: WorkoutLog[], assignments = ASIGNACIONES): ChallengeData =>
    ({ ...BASE, workoutLogs: [...HISTORIAL, ...semana], assignments });

  it('amrap_serie: repeticiones con el peso o más', () => {
    const ch = reto({ kind: 'amrap_serie', metric: { unit: 'reps', target: 13, atWeight: 120, exerciseId: 'prensa' } });
    expect(evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(120, 13, 0, true)] })]), '2026-10-30').achieved).toBe(true);
    expect(evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(120, 12)] })]), '2026-10-30').achieved).toBe(false);
  });

  it('doble_progresion «toca subir»: cualquier peso por encima, con las reps mínimas', () => {
    const ch = reto({ kind: 'doble_progresion', metric: { unit: 'reps', target: 8, subirDe: 120, exerciseId: 'prensa' } });
    expect(evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(125, 8)] })]), '2026-10-30').achieved).toBe(true);
    expect(evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(120, 12)] })]), '2026-10-30').achieved).toBe(false);
  });

  it('mas_reserva: mismo peso y reps sin fallo y con RIR ≥ 1', () => {
    const ch = reto({ kind: 'mas_reserva', metric: { unit: 'serie', target: 1, minRir: 1, atWeight: 65, baseline: 10, exerciseId: 'ext' } });
    expect(evaluateChallengeProgress(ch, datos([log('2026-10-30', { ext: [s(65, 10, 1)] })]), '2026-10-30').achieved).toBe(true);
    expect(evaluateChallengeProgress(ch, datos([log('2026-10-30', { ext: [s(65, 10, 0, true)] })]), '2026-10-30').achieved).toBe(false);
  });

  it('supera_sesion: cuenta ejercicios mejorados en esa rutina', () => {
    const referencias = [
      { exerciseId: 'prensa', exerciseName: 'Prensa', weight: 120, reps: 12 },
      { exerciseId: 'ext', exerciseName: 'Ext', weight: 65, reps: 10 },
    ];
    const ch = reto({ kind: 'supera_sesion', metric: { unit: 'ejercicios', target: 2, workoutId: 'w-pierna', referencias } });
    const p = evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(125, 12)], ext: [s(65, 11)] })]), '2026-10-30');
    expect(p).toMatchObject({ progressValue: 2, achieved: true });
    // En otra rutina no cuenta.
    const otra = evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(125, 12)] }, 'w-otra')]), '2026-10-30');
    expect(otra.progressValue).toBe(0);
    expect(ejerciciosMejorados(referencias, [log('2026-10-30', { prensa: [s(125, 12)] }, 'w-otra')], LUNES, HOY)).toBe(0);
  });

  it('rir_minimo: conseguido con todas las sesiones hechas y ni una serie por debajo', () => {
    const ch = reto({ kind: 'rir_minimo', metric: { unit: '%', target: 100, minRir: 3, sesiones: 1, mesocycleId: 'm1' } });
    const hechas = [asig('a-pierna', '2026-10-30', 'w-pierna', 'm1', 'completed')];
    const bien = evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(100, 8, 3)] })], hechas), '2026-10-30');
    expect(bien).toMatchObject({ progressValue: 100, achieved: true });
    const mal = evaluateChallengeProgress(ch, datos([log('2026-10-30', { prensa: [s(100, 8, 3), s(100, 10, 1)] })], hechas), '2026-10-30');
    expect(mal).toMatchObject({ progressValue: 50, achieved: false });
  });

  it('entrenos_completados con bloque: las sesiones de otro mesociclo no cuentan', () => {
    const ch = reto({ kind: 'entrenos_completados', metric: { unit: 'sesiones', target: 1, mesocycleId: 'm1' } });
    const soloVieja = [asig('a-vieja', '2026-10-29', 'w-vieja', 'm0', 'completed')];
    expect(evaluateChallengeProgress(ch, datos([], soloVieja), '2026-10-30').progressValue).toBe(0);
  });
});

// ── Memoria ───────────────────────────────────────────────────────────────────

describe('memoria: un 0 por no hacer el ejercicio no es un fallo', () => {
  it('no cuenta para rachas de fallos ni tasa', () => {
    const cero = reto({ kind: 'carga_ejercicio', isoWeek: '2026-W43', status: 'fallido', progressValue: 0, metric: { unit: 'kg', target: 60, exerciseId: 'remo' } });
    expect(sinIntento(cero)).toBe(true);
    const mem = buildChallengeMemory([cero], '2026-W44');
    expect(mem.resolvedCount).toBe(0);
    expect(mem.failStreakByKind.get('carga_ejercicio')).toBeUndefined();
    expect(mem.recentKinds).toEqual(['carga_ejercicio']);   // la rotación sí lo ve
  });

  it('un fallo con datos sí cuenta', () => {
    const real = reto({ kind: 'carga_ejercicio', isoWeek: '2026-W43', status: 'fallido', progressValue: 55, metric: { unit: 'kg', target: 60 } });
    expect(buildChallengeMemory([real], '2026-W44').resolvedCount).toBe(1);
  });
});

// ── Aviso en el entreno ──────────────────────────────────────────────────────

describe('avisoDeReto', () => {
  it('AMRAP solo en su ejercicio', () => {
    const ch = reto({ kind: 'amrap_serie', metric: { unit: 'reps', target: 11, baseline: 10, atWeight: 120, exerciseId: 'prensa' } });
    expect(avisoDeReto(ch, 'prensa')?.etiqueta).toBe('Reto de la semana · AMRAP');
    expect(avisoDeReto(ch, 'prensa')?.texto).toContain('Récord: 10. A por 11.');
    expect(avisoDeReto(ch, 'ext')).toBeNull();
  });

  it('supera tu sesión: la marca de referencia, solo en esa rutina', () => {
    const ch = reto({ kind: 'supera_sesion', metric: {
      unit: 'ejercicios', target: 2, workoutId: 'w-pierna',
      referencias: [{ exerciseId: 'prensa', exerciseName: 'Prensa', weight: 120, reps: 12 }],
    } });
    expect(avisoDeReto(ch, 'prensa', 'w-pierna')?.texto).toBe('La última vez: 120 kg × 12. Más kilos o más repeticiones.');
    expect(avisoDeReto(ch, 'prensa', 'w-otra')).toBeNull();
  });

  it('un reto ya conseguido no molesta', () => {
    const ch = reto({ kind: 'rir_minimo', status: 'conseguido', metric: { unit: '%', target: 100, minRir: 3 } });
    expect(avisoDeReto(ch, 'prensa')).toBeNull();
  });

  it('los retos que no van de entreno no avisan', () => {
    expect(avisoDeReto(reto({ kind: 'pasos_media', metric: { unit: 'pasos', target: 8000 } }), 'prensa')).toBeNull();
  });
});
