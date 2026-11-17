import { describe, expect, it } from 'vitest';
import { recordDeReps } from './planDeLaSemana';
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

  it('F7c: marca la semana puente, salvo que además sea de descarga o de test', () => {
    const puente = (m: Partial<Mesocycle>) => planDeLaSemana({
      assignments: ASIGNACIONES, workouts: [PIERNA], mesocycles: [{ ...MESO, ...m } as Mesocycle], exercises: EJERCICIOS, today: HOY,
    })!.semanaPuente;
    expect(puente({ semanasPivot: [2] })).toBe(true);
    expect(puente({ semanasPivot: [3] })).toBeUndefined();
    expect(puente({ semanasPivot: [2], semanasDescarga: [2] })).toBeUndefined();
    expect(puente({ semanasPivot: [2], semanasTest: [2] })).toBeUndefined();
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

  const DE_PROGRESAR = ['doble_progresion', 'amrap_serie', 'supera_sesion', 'grupo_estancado', 'mas_reserva', 'record_reps'];

  it('D10: descarga — el reto es hacer las sesiones; ni RIR mínimo ni progresar', () => {
    const opts = generateChallengeOptions(input({ mesocycles: [{ ...MESO, semanasDescarga: [2] } as Mesocycle] }));
    expect(opts[0]).toMatchObject({ kind: 'entrenos_completados', title: 'Semana de descarga: haz tu sesión', metric: { target: 1, mesocycleId: 'm1' } });
    // En descarga se quita volumen, no intensidad: nada que pida alejarse del fallo.
    expect(opts.some(o => o.kind === 'rir_minimo')).toBe(false);
    expect(opts.some(o => DE_PROGRESAR.includes(o.kind))).toBe(false);
  });

  it('D10: lo que lee el atleta en descarga no le pide alejarse del fallo ni bajar peso', () => {
    const opt = generateChallengeOptions(input({ mesocycles: [{ ...MESO, semanasDescarga: [2] } as Mesocycle] }))[0];
    const texto = `${opt.title} ${opt.description}`;
    expect(texto).toContain('menos series, con las mismas cargas');
    expect(texto).not.toMatch(/RIR|fallo|menos peso|baja/i);
  });

  it('F7c: semana puente — el reto es hacer las sesiones, nada de progresar', () => {
    const opts = generateChallengeOptions(input({ mesocycles: [{ ...MESO, semanasPivot: [2] } as Mesocycle] }));
    expect(opts[0]).toMatchObject({ kind: 'entrenos_completados', title: 'Semana puente: haz tu sesión', metric: { target: 1, mesocycleId: 'm1' } });
    expect(opts.some(o => DE_PROGRESAR.includes(o.kind))).toBe(false);
  });

  it('F7c: vuelta de parón — solo «RIR mínimo», nada de progresar', () => {
    const opts = generateChallengeOptions(input({ mesocycles: [{ ...MESO, vuelveDeParon: true, startDate: LUNES } as Mesocycle] }));
    expect(opts[0]).toMatchObject({ kind: 'rir_minimo', title: 'Vuelve con cabeza' });
    expect(opts.some(o => DE_PROGRESAR.includes(o.kind))).toBe(false);
  });

  it('F7c: en descarga, puente y vuelta de parón tampoco salen los retos de carga «a la antigua»', () => {
    const ANTIGUOS = ['carga_ejercicio', 'reps_ejercicio', 'series_grupo'];
    const hay = (m: Partial<Mesocycle>) => generateChallengeOptions(input({ mesocycles: [{ ...MESO, ...m } as Mesocycle] })).some(o => ANTIGUOS.includes(o.kind));
    expect(hay({})).toBe(true); // en una semana normal sí se proponen
    expect(hay({ semanasDescarga: [2] })).toBe(false);
    expect(hay({ semanasPivot: [2] })).toBe(false);
    expect(hay({ vuelveDeParon: true, startDate: LUNES })).toBe(false);
  });

  // «Toca subir» con el mismo criterio que la tarjeta (`veredictoDeSerie`).
  const conPrensa = (series: WorkoutSetLog[], reps = '8-12') => generateChallengeOptions(input({
    workoutLogs: [...HISTORIAL.slice(0, -1), log('2026-10-22', { prensa: series, muerto: [s(85, 8)] })],
    workouts: [{ ...PIERNA, exercises: [we('prensa', 0, reps), we('muerto', 4)] } as unknown as Workout, VIEJA],
  })).find(o => o.kind === 'doble_progresion');

  it('F7c: en el tope pero al fallo, o más justo de lo pautado, NO «toca subir» (la tarjeta tampoco sube)', () => {
    expect(conPrensa([s(120, 12, 1)])?.metric).toMatchObject({ exerciseId: 'prensa', subirDe: 120 });
    expect(conPrensa([s(120, 12, 0, true)])).toBeUndefined();
    expect(conPrensa([s(120, 12, 0)])).toBeUndefined();
  });

  it('D1a: con el RIR apuntado, «toca subir» se decide a RIR pautado, igual que la tarjeta', () => {
    const apuntada = (weight: number, repsDone: number, rir: number): WorkoutSetLog => ({ ...s(weight, repsDone, rir), rirApuntado: true });
    // 11 a RIR 3 con RIR 1 pautado son 13: pasa del tope (12) sin haberlo hecho.
    const sube = conPrensa([apuntada(120, 11, 3)])!;
    expect(sube.metric).toMatchObject({ exerciseId: 'prensa', subirDe: 120 });
    expect(sube.description).toContain('120 kg × 11, y te sobraban repeticiones para el tope');
    // 12 a RIR 0 con RIR 1 pautado son 11: en el tope, pero apretando de más.
    expect(conPrensa([apuntada(120, 12, 0)])).toBeUndefined();
  });

  it('F7c: en el tope con un salto de carga grande, el reto pide abrir el rango, como la tarjeta', () => {
    // Historial de la prensa: 110 y 120 kg → salto real de 10 kg (8 %): con un
    // rango de 2 repeticiones hacen falta 2 más antes de subir.
    const opt = conPrensa([s(120, 12, 1)], '10-12')!;
    expect(opt.metric).toMatchObject({ exerciseId: 'prensa', atWeight: 120, target: 14 });
    expect(opt.metric.subirDe).toBeUndefined();
    expect(opt.description).toContain('Antes de subir, saca 14 repeticiones con 120 kg');
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

describe('fuera de su gimnasio (17-11-2026)', () => {
  const l = (id: string, date: string, weight: number, repsDone: number, fuera = false): WorkoutLog => ({
    id, athleteId: 'a', workoutId: 'w', assignmentId: id, date, completedAt: '',
    entries: [{ exerciseId: 'ex1', sets: [{ weight, repsDone, rir: 2, ...(fuera ? { fuera: true } : {}) }] }],
  });

  it('«la última vez» de los retos se salta las sesiones fuera', () => {
    const logs = [l('a', '2026-11-01', 80, 8), l('b', '2026-11-08', 30, 15, true)];
    expect(ultimaVez(logs, 'ex1', '2026-11-17')).toMatchObject({ date: '2026-11-01', series: [{ weight: 80, reps: 8 }] });
  });

  it('los récords ni se baten ni se cuentan con sesiones fuera', () => {
    const logs = [l('a', '2026-11-01', 80, 8), l('b', '2026-11-08', 80, 15, true)];
    expect(recordDeReps(logs, 'ex1', 80, '2026-11-17')).toBe(8);
    expect(tablaDeRecords(logs, 'ex1', '2026-11-17')).toEqual([{ weight: 80, reps: 8 }]);
    expect(recordsBatidos(logs, '2026-11-05', '2026-11-17')).toBe(0);
  });
});

/* Retos ligados al objetivo del bloque (17-11-2026): con hipótesis, cada reto
   elige antes un ejercicio de las zonas con estrella y lo dice en su contexto.
   No cambia qué retos salen ni las semanas especiales. */
describe('retos ligados al objetivo del bloque (17-11-2026)', () => {
  const conEstrellas = (zonas: string[], extra: Partial<Mesocycle> = {}): Partial<AutoChallengeInput> => ({
    mesocycles: [{ ...MESO, hipotesis: Object.fromEntries(zonas.map(z => [z, { palanca: 'volumen' }])), ...extra } as Mesocycle],
  });
  const de = (o: Partial<AutoChallengeInput>, kind: WeeklyChallenge['kind']) =>
    generateChallengeOptions(input(o)).find(x => x.kind === kind);

  it('sin hipótesis todo queda como estaba: mismo ejercicio y sin marca', () => {
    const opt = de({}, 'doble_progresion')!;
    expect(opt.metric.exerciseId).toBe('prensa');
    expect(opt.contexto?.conObjetivo).toBeUndefined();
  });

  it('doble progresión: con estrella en isquios va al femoral que está a 2 del tope, no a la prensa', () => {
    const opt = de(conEstrellas(['isquios']), 'doble_progresion')!;
    expect(opt.metric.exerciseId).toBe('femoral2');
    expect(opt.contexto).toEqual({ bloque: 'Hipertrofia 1', semana: 2, semanas: 9, conObjetivo: true });
  });

  it('la estrella va por delante del ejercicio clave', () => {
    const opt = de(conEstrellas(['isquios'], { ejerciciosClave: ['w-pierna::prensa'] }), 'doble_progresion')!;
    expect(opt.metric.exerciseId).toBe('femoral2');
    // Y entre dos de fuera del objetivo, sigue mandando «clave».
    const sinEstrella = de({ mesocycles: [{ ...MESO, ejerciciosClave: ['w-pierna::femoral2'] } as Mesocycle] }, 'doble_progresion')!;
    expect(sinEstrella.metric.exerciseId).toBe('femoral2');
    expect(sinEstrella.contexto?.conObjetivo).toBeUndefined();
  });

  it('si la estrella ya era el ejercicio elegido, solo se añade la marca', () => {
    const opt = de(conEstrellas(['cuadriceps']), 'doble_progresion')!;
    expect(opt.metric).toMatchObject({ exerciseId: 'prensa', subirDe: 120 });
    expect(opt.contexto?.conObjetivo).toBe(true);
  });

  it('no inventa retos: si ningún candidato es del objetivo, sale el de siempre y sin marca', () => {
    // «Más reserva» solo tiene un candidato (la extensión, que fue al fallo).
    const opt = de(conEstrellas(['isquios']), 'mas_reserva')!;
    expect(opt.metric.exerciseId).toBe('ext');
    expect(opt.contexto?.conObjetivo).toBeUndefined();
    const tipos = (o: Partial<AutoChallengeInput>) => generateChallengeOptions(input(o)).map(x => x.kind).sort();
    expect(tipos(conEstrellas(['isquios']))).toEqual(tipos({}));
  });

  it('AMRAP: con ejercicios del objetivo entre los aptos, rota solo entre ellos (cualquier semana)', () => {
    // Cuatro semanas seguidas (la rotación cambia de ejercicio con la semana):
    // siempre un femoral, nunca la prensa ni la extensión.
    for (let i = 0; i < 4; i++) {
      const today = addDays(HOY, i * 7);
      const asignaciones = [asig('a-pierna', addDays('2026-10-30', i * 7), 'w-pierna', 'm1')];
      const opt = de({ ...conEstrellas(['isquios']), today, assignments: asignaciones }, 'amrap_serie')!;
      expect(['femoral', 'femoral2']).toContain(opt.metric.exerciseId);
      expect(opt.contexto?.conObjetivo).toBe(true);
    }
    // Sin estrellas, la rotación de siempre.
    expect(de({}, 'amrap_serie')!.contexto?.conObjetivo).toBeUndefined();
  });

  it('récord de repeticiones: la marca solo si el ejercicio elegido es del objetivo', () => {
    // Solo la extensión tiene dos marcas vigentes: sale con cualquier estrella.
    expect(de(conEstrellas(['isquios']), 'record_reps')).toMatchObject({ metric: { exerciseId: 'ext' } });
    expect(de(conEstrellas(['isquios']), 'record_reps')!.contexto?.conObjetivo).toBeUndefined();
    expect(de(conEstrellas(['cuadriceps']), 'record_reps')!.contexto?.conObjetivo).toBe(true);
    expect(de(conEstrellas(['cuadriceps']), 'mas_reserva')!.contexto?.conObjetivo).toBe(true);
  });

  it('grupo estancado: el grupo lo deciden los parones; la marca, la estrella', () => {
    const suyo = de(conEstrellas(['isquios']), 'grupo_estancado')!;
    expect(suyo.metric.muscleGroup).toBe('isquios');
    expect(suyo.contexto?.conObjetivo).toBe(true);
    const ajeno = de(conEstrellas(['cuadriceps']), 'grupo_estancado')!;
    expect(ajeno.metric.muscleGroup).toBe('isquios');
    expect(ajeno.contexto?.conObjetivo).toBeUndefined();
  });

  it('una zona de varios grupos (deltoides) cubre todos los suyos', () => {
    const hombro: Workout = { ...PIERNA, exercises: [...PIERNA.exercises, we('lat', 5, '10-12', 'deltoide_lat')] } as Workout;
    const logs = [...HISTORIAL, log('2026-10-23', { lat: [s(10, 11)] })];
    const opt = de({
      ...conEstrellas(['deltoides']), workouts: [hombro, VIEJA], workoutLogs: logs,
      exercises: [...EJERCICIOS, ex('lat', 'Elevaciones laterales en polea', 'deltoide_lat')],
    }, 'doble_progresion')!;
    expect(opt.metric.exerciseId).toBe('lat');
    expect(opt.contexto?.conObjetivo).toBe(true);
  });

  it('descarga, puente y vuelta de parón no cambian ni llevan la marca', () => {
    const descarga = generateChallengeOptions(input(conEstrellas(['isquios'], { semanasDescarga: [2] })));
    const sinEstrellas = generateChallengeOptions(input({ mesocycles: [{ ...MESO, semanasDescarga: [2] } as Mesocycle] }));
    expect(descarga.map(o => [o.kind, o.title])).toEqual(sinEstrellas.map(o => [o.kind, o.title]));
    expect(descarga.some(o => o.contexto?.conObjetivo)).toBe(false);
    for (const extra of [{ semanasPivot: [2] }, { vuelveDeParon: true, startDate: LUNES }] as Partial<Mesocycle>[]) {
      const opts = generateChallengeOptions(input(conEstrellas(['isquios'], extra)));
      expect(opts.some(o => o.contexto?.conObjetivo)).toBe(false);
    }
  });

  it('el reto que se guarda conserva la marca', () => {
    const ch = generateAutoChallenge(input(conEstrellas(['isquios'])));
    expect(ch).toMatchObject({ kind: 'doble_progresion', metric: { exerciseId: 'femoral2' } });
    expect(ch.contexto).toEqual({ bloque: 'Hipertrofia 1', semana: 2, semanas: 9, conObjetivo: true });
  });
});
