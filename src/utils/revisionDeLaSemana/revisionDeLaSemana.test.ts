import { describe, it, expect } from 'vitest';
import type {
  BodyweightLog, Mesocycle, NutritionProgram, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse,
  StepLog, WeightCheckIn, Workout, WorkoutLog, Exercise,
} from '../../types';
import {
  semanaDeRevision, sesionesDeLaSemana, pasosDeLaSemana, pesoDeLaSemana, comidaResumen, ritmoFueraDeFase,
  diasMencionados, fechaDelDia, datoDelDia, loQueMeContaste, hayAlgoQueContar,
  semanaQueViene, ejerciciosPrincipales, loQuePideDecision, textoDelRitmo,
  fraseDeCambio, hayMedidaNueva, num, fraseDelRitmo,
} from './index';
import { addDays } from '../trainingWeek';

const HOY = '2026-11-18'; // miércoles
const semana = semanaDeRevision(HOY);

function log(date: string, extra: Partial<WorkoutLog> = {}): WorkoutLog {
  return { id: `l_${date}_${Math.random()}`, athleteId: 'a', workoutId: 'w1', assignmentId: 'x', date, completedAt: `${date}T18:00:00Z`, entries: [], ...extra } as WorkoutLog;
}

describe('semanaDeRevision', () => {
  it('son los 7 días que acaban en `hasta` y los 7 de antes', () => {
    expect(semana).toEqual({ desde: '2026-11-12', hasta: HOY, anteriorDesde: '2026-11-05', anteriorHasta: '2026-11-11' });
  });
  it('num escribe a la española', () => {
    expect(num(1990, 0)).toBe('1.990');
    expect(num(7.25)).toBe('7,3');
    expect(num(-0.24, 2)).toBe('−0,24');
    expect(num(80, 1)).toBe('80');
  });
});

describe('vistazo de la semana', () => {
  it('sesiones: con asignaciones manda lo asignado; sin ellas, los días del bloque', () => {
    const logs = [log('2026-11-13'), log('2026-11-15'), log('2026-11-08')];
    const con = sesionesDeLaSemana({
      logs, semana,
      assignments: [{ date: '2026-11-13', status: 'completed' }, { date: '2026-11-15', status: 'completed' }, { date: '2026-11-17', status: 'skipped' }],
    });
    expect(con).toEqual({ hechas: 2, tocaban: 3, anterior: 1 });
    const sinAsignar = sesionesDeLaSemana({ logs, semana, meso: { daysPerWeek: 4, startDate: '2026-11-01', weeks: 5 } });
    expect(sinAsignar.tocaban).toBe(4);
    expect(sesionesDeLaSemana({ logs, semana }).tocaban).toBeNull();
  });

  it('pasos: sin registros no hay cifra; con ellos, media y la de la semana anterior', () => {
    expect(pasosDeLaSemana({ pasos: [], semana })).toBeNull();
    const pasos: Pick<StepLog, 'date' | 'steps'>[] = [
      { date: '2026-11-13', steps: 8000 }, { date: '2026-11-14', steps: 10000 }, { date: '2026-11-06', steps: 6000 },
    ];
    expect(pasosDeLaSemana({ pasos, objetivo: 9000, semana })).toEqual({ media: 9000, objetivo: 9000, dias: 2, mediaAnterior: 6000 });
  });

  it('comida: sin días registrados no sale', () => {
    expect(comidaResumen({ registros: [], dietas: [], semana })).toBeNull();
  });

  it('peso: media de la semana, la anterior y el ritmo frente a la fase', () => {
    // Baja 0,2 kg por semana durante 8 semanas en una fase de déficit (pide 0,4-0,6 %).
    const pesos: BodyweightLog[] = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`, athleteId: 'a', date: addDays(HOY, -(8 - i) * 7), weight: 82 - i * 0.2, createdAt: '',
    }));
    const programa: NutritionProgram = {
      athleteId: 'a', startDate: addDays(HOY, -70),
      phases: [{ id: 'f', name: 'Déficit', weeks: 16, dietId: 'd', targetKcal: 2000, objetivo: 'deficit' }],
    } as NutritionProgram;
    const p = pesoDeLaSemana({ pesos, programa, semana })!;
    expect(p.media).toBe(80.4);
    expect(p.anterior).toBe(80.6);
    expect(p.deltaKg).toBe(-0.2);
    expect(p.ritmo?.estado).toBe('lento');
    expect(p.ritmo?.kgSemana).toBeCloseTo(-0.2, 2);
    // Del ritmo suave al fuerte: −0,4 % y −0,6 % de unos 80,4 kg.
    expect(p.ritmo?.rangoKg).toEqual([-0.32, -0.48]);
    expect(ritmoFueraDeFase(p.ritmo)).toBe(true);
    expect(fraseDelRitmo(p.ritmo!)).toBe('Bajas 200 g a la semana; en esta fase buscamos de 320 a 480 g.');
    expect(fraseDelRitmo({ ...p.ritmo!, kgSemana: 0.01, rangoKg: null })).toBe('Te mantienes.');
    expect(textoDelRitmo(p.ritmo!)).toMatch(/^Baja 200 g a la semana; «Déficit» pide de −320 g a −480 g\. Unas \d+ kcal\/día menos/);
  });

  it('peso: sin pesos esta semana no hay cifra, y sin fase no hay ritmo', () => {
    expect(pesoDeLaSemana({ pesos: [], semana })).toBeNull();
    const p = pesoDeLaSemana({ pesos: [{ date: '2026-11-17', weight: 80 }], semana })!;
    expect(p).toEqual({ media: 80, anterior: null, deltaKg: null, ritmo: null });
  });
});

describe('lo que me contaste', () => {
  it('encuentra los días de la semana que dice, con o sin tilde', () => {
    expect(diasMencionados('El jueves salí reventado y el MIERCOLES bien')).toEqual([4, 3]);
    expect(diasMencionados('Semana redonda')).toEqual([]);
    // El jueves más reciente en o antes del miércoles 18 es el 12.
    expect(fechaDelDia(4, HOY)).toBe('2026-11-12');
    expect(fechaDelDia(3, HOY)).toBe(HOY);
  });

  it('pone al lado la sesión de ese día, o que no la hubo', () => {
    const logs = [log('2026-11-12', { cansancioAlSalir: 9, workoutId: 'pierna' })];
    const nombre = (id: string) => (id === 'pierna' ? 'Pierna A' : undefined);
    expect(datoDelDia({ texto: 'el jueves salí reventado', fecha: HOY, logs, nombreDeSesion: nombre })?.texto)
      .toBe('Jueves 12 nov: entrenó Pierna A, salió con 9/10 de cansancio');
    expect(datoDelDia({ texto: 'el martes no pude', fecha: HOY, logs })?.texto).toBe('Martes 17 nov: no hay sesión registrada');
    expect(datoDelDia({ texto: 'todo bien', fecha: HOY, logs })).toBeNull();
  });

  const Q: Questionnaire = {
    id: 'q', ownerId: 'c', title: 'Revisión semanal',
    questions: [
      { id: 'horas', label: 'Horas de sueño al día', type: 'numeric', required: true, signalKey: 'wellness.sleep_hours_weekly' },
      { id: 'calidad', label: '¿Qué tal has dormido?', type: 'scale', required: true, scaleMax: 10 },
      { id: 'energia', label: 'Energía en los entrenos', type: 'scale', required: true, scaleMax: 10 },
      { id: 'nota', label: '¿Algo que contarme?', type: 'text', required: false },
      { id: 'foto', label: 'Vídeo', type: 'media', required: false },
    ],
  };
  const resp = (id: string, submittedAt: string, answers: QuestionnaireResponse['answers']): QuestionnaireResponse =>
    ({ id, questionnaireId: 'q', assignmentId: 'as', athleteId: 'a', submittedAt, answers });

  it('las respuestas de la semana, con lo de la vez anterior y el dato al lado', () => {
    const responses = [
      resp('vieja', '2026-11-04T19:00:00', [{ questionId: 'calidad', value: 5 }, { questionId: 'energia', value: 6 }]),
      resp('previa', '2026-11-11T19:00:00', [{ questionId: 'calidad', value: 6 }, { questionId: 'energia', value: 8 }]),
      resp('esta', '2026-11-17T19:00:00', [
        { questionId: 'horas', value: 7.5 }, { questionId: 'calidad', value: 7 }, { questionId: 'energia', value: 8 },
        { questionId: 'nota', value: 'El jueves salí reventado' }, { questionId: 'foto', value: 'https://x' },
      ]),
    ];
    const logs = [log('2026-11-12', { cansancioAlSalir: 9, workoutId: 'pierna' }), log('2026-11-14', { cansancioAlSalir: 6 })];
    const r = loQueMeContaste({ hasta: HOY, responses, questionnaires: [Q], logs, nombreDeSesion: id => (id === 'pierna' ? 'Pierna A' : 'Torso') });
    // Las de la última semana (la de hace 7 días cuenta: es el día de corte).
    expect(r.cuestionarios.map(c => c.responseId)).toEqual(['esta', 'previa']);
    const esta = r.cuestionarios[0];
    expect(esta.respuestas.map(x => x.questionId)).toEqual(['horas', 'calidad', 'energia', 'nota']);
    expect(esta.respuestas[0].respuesta).toBe('7,5 h');
    const calidad = esta.respuestas.find(x => x.questionId === 'calidad')!;
    expect(calidad.respuesta).toBe('7/10');
    expect(calidad.anterior).toBe('6/10');
    expect(calidad.dato?.texto).toBe('Duerme 7,5 h de media');
    const energia = esta.respuestas.find(x => x.questionId === 'energia')!;
    // Igual que la vez anterior: no se repite.
    expect(energia.anterior).toBeNull();
    expect(energia.dato?.texto).toBe('Salió de sus 2 sesiones con un 7,5/10 de cansancio de media · la más dura fue la del jueves, Pierna A (9/10)');
    const nota = esta.respuestas.find(x => x.questionId === 'nota')!;
    expect(nota.esTexto).toBe(true);
    expect(nota.dato?.texto).toMatch(/^Jueves 12 nov: entrenó Pierna A/);
  });

  it('el check-in de la semana, con el día que nombra', () => {
    const checkins = [
      { id: 'c1', timestamp: new Date('2026-11-16T18:00:00'), weight: 80.4, mood: '😐', adherence: 'Parcial', notes: 'El martes no entrené' },
      { id: 'c0', timestamp: new Date('2026-11-01T18:00:00'), weight: 81, mood: '😊', adherence: 'Sí', notes: 'Antigua' },
    ] as unknown as WeightCheckIn[];
    const r = loQueMeContaste({ hasta: HOY, responses: [], questionnaires: [], checkins, logs: [] });
    expect(r.checkin).toMatchObject({ fecha: '2026-11-16', peso: 80.4, animo: '😐', adherencia: 'Parcial' });
    expect(r.checkin?.dato?.texto).toBe('Martes 10 nov: no hay sesión registrada');
    expect(hayAlgoQueContar(r)).toBe(true);
    expect(hayAlgoQueContar(loQueMeContaste({ hasta: HOY, responses: [], questionnaires: [], logs: [] }))).toBe(false);
  });
});

describe('la semana que viene', () => {
  // Bloque de 5 semanas que empezó hace 16 días: hoy es la semana 3.
  const meso = {
    id: 'm', athleteId: 'a', number: 2, name: 'Hipertrofia', weeks: 5, startDate: addDays(HOY, -16),
    daysPerWeek: 3, groups: {}, semanasDescarga: [5],
  } as unknown as Mesocycle;
  const ex: Pick<Exercise, 'id' | 'name'>[] = [{ id: 'press', name: 'Press banca' }, { id: 'sentadilla', name: 'Sentadilla' }];
  const rutinas = [
    { id: 'w1', ownerId: 'c', name: 'Torso', mesocycleId: 'm', dayIndex: 0, exercises: [
      { exerciseId: 'press', order: 0, sets: 3, reps: '6-8', rir: 2, restSeconds: 120 },
    ] },
    { id: 'w2', ownerId: 'c', name: 'Pierna', mesocycleId: 'm', dayIndex: 1, exercises: [
      { exerciseId: 'sentadilla', order: 0, sets: 3, reps: '8-10', rir: 2, restSeconds: 150,
        weeklyProgression: [{ atWeek: 4, cambios: { sets: 4 } }] },
    ] },
  ] as unknown as Workout[];
  const serie = (weight: number, repsDone: number) => ({ weight, repsDone, rir: 2 });
  const logs = [
    log(addDays(HOY, -14), { entries: [{ exerciseId: 'press', sets: [serie(68, 8), serie(68, 8), serie(68, 7)] }] }),
    log(addDays(HOY, -7), { entries: [{ exerciseId: 'press', sets: [serie(70, 8), serie(70, 8), serie(70, 8)] }] }),
    log(addDays(HOY, -5), { entries: [{ exerciseId: 'sentadilla', sets: [serie(90, 9), serie(90, 9), serie(90, 8)] }] }),
  ] as WorkoutLog[];

  it('los principales: los marcados por el coach o, si no hay, el primero de cada sesión', () => {
    expect(ejerciciosPrincipales(meso, rutinas).map(w => w.exerciseId)).toEqual(['press', 'sentadilla']);
    expect(ejerciciosPrincipales({ ejerciciosClave: ['d1::sentadilla'] }, rutinas).map(w => w.exerciseId)).toEqual(['sentadilla']);
  });

  it('semana normal con un cambio programado, la carga que toca y el cuestionario', () => {
    const asignacion = { id: 'as', questionnaireId: 'q', active: true, schedule: { type: 'weekly' } } as unknown as QuestionnaireAssignment;
    const s = semanaQueViene({
      hoy: HOY, mesocycles: [meso], workouts: rutinas, exercises: ex, logs,
      asignaciones: [asignacion], cuestionarios: [{ id: 'q', title: 'Revisión semanal' }],
      proximaDe: () => '2026-11-20',
    })!;
    expect(s).toMatchObject({ bloque: 'Hipertrofia', semana: 4, semanas: 5, tipo: 'normal', bloqueNuevo: false });
    expect(s.desde).toBe(addDays(meso.startDate, 21));
    expect(s.cambios).toEqual([{ dia: 'Pierna', ejercicio: 'Sentadilla', cambios: ['3 → 4 series'] }]);
    expect(s.cuestionarios).toEqual([{ titulo: 'Revisión semanal', fecha: '2026-11-20' }]);
    // Press: llegó a 8 de 6-8 en todas a RIR 2 → sube (salto real 2 kg).
    expect(s.cargas).toEqual([{ exerciseId: 'press', ejercicio: 'Press banca', que: 'subir', texto: 'Prueba con 72 kg' }]);
  });

  it('la de descarga se dice, y en ella no se sugiere subir', () => {
    const s = semanaQueViene({ hoy: addDays(HOY, 7), mesocycles: [meso], workouts: rutinas, exercises: ex, logs })!;
    expect(s.semana).toBe(5);
    expect(s.tipo).toBe('descarga');
    expect(s.cargas).toEqual([]);
  });

  it('sin nada real que decir, no sale', () => {
    const sinNada = { ...meso, semanasDescarga: [] } as Mesocycle;
    const llanas = rutinas.map(w => ({ ...w, exercises: w.exercises.map(e => ({ ...e, weeklyProgression: undefined })) }));
    expect(semanaQueViene({ hoy: HOY, mesocycles: [sinNada], workouts: llanas, exercises: ex, logs: [] })).toBeNull();
    expect(semanaQueViene({ hoy: HOY, mesocycles: [], workouts: [], exercises: [], logs: [] })).toBeNull();
  });

  it('la última semana del bloque: si el siguiente ya está creado, es su primera semana', () => {
    const hoy = addDays(meso.startDate, 30);
    const siguiente = { ...meso, id: 'm2', number: 3, name: 'Fuerza', startDate: addDays(meso.startDate, 35), semanasDescarga: [] } as Mesocycle;
    const s = semanaQueViene({ hoy, mesocycles: [meso, siguiente], workouts: [], exercises: ex, logs: [] })!;
    expect(s).toMatchObject({ bloque: 'Fuerza', semana: 1, bloqueNuevo: true, desde: siguiente.startDate });
  });
});

describe('lo que pide decisión', () => {
  const nombreDe = (id: string) => ({ press: 'Press banca', remo: 'Remo' }[id] ?? 'Ejercicio');
  const base = { estancados: [], descarga: { recomendada: false, senales: [], recortes: [] } };

  it('el ritmo fuera de la fase, las sesiones duras y lo estancado (no lo que solo se mantiene)', () => {
    const avisos = loQuePideDecision({
      hoy: HOY, nombreDe,
      ritmo: { kgSemana: -0.2, rangoKg: [-0.32, -0.48], estado: 'lento', fase: 'Déficit', ajusteKcal: -150 },
      revision: {
        ...base,
        descarga: { ...base.descarga, sesionesDuras: ['jue 12 · Pierna (9/10): no subas cuádriceps'] },
        estancados: [
          { exerciseId: 'press', semanas: 7, sesiones: 9, veredicto: 'cambiar_variante', accion: 'Cámbialo por una variante' },
          { exerciseId: 'remo', semanas: 6, sesiones: 6, veredicto: 'mantener', accion: 'Nada' },
        ],
      } as never,
    });
    expect(avisos.map(a => a.tipo)).toEqual(['ritmo', 'sesion_dura', 'estancado']);
    expect(avisos[0].titulo).toBe('El peso va más lento de lo que pide la fase');
    expect(avisos[0].detalle).toContain('Unas 150 kcal/día menos');
    expect(avisos[2].titulo).toBe('Press banca: 7 semanas sin mejorar');
  });

  it('con descarga recomendada no se repiten las sesiones duras sueltas', () => {
    const avisos = loQuePideDecision({
      hoy: HOY, nombreDe,
      revision: { estancados: [], descarga: { recomendada: true, senales: ['cansancio alto', 'agujetas'], recortes: [{ texto: 'quita una serie de curl' }], sesionesDuras: ['x'] } } as never,
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].detalle).toBe('cansancio alto; agujetas. Antes de una semana entera, recorta por aquí: quita una serie de curl.');
  });

  it('los cambios cuya fecha de mirar ha llegado, con su antes y después', () => {
    const avisos = loQuePideDecision({
      hoy: HOY, nombreDe, revision: base as never,
      hipotesis: [
        { id: 'c1', espero: 'que suba el press', exerciseId: 'press', desde: '2026-11-01', revisarEl: '2026-11-15' },
        { id: 'c2', espero: 'aún no', desde: '2026-11-10', revisarEl: '2026-11-30' },
        { id: 'c3', espero: 'ya cerrada', desde: '2026-10-01', revisarEl: '2026-10-15', cierre: { resultado: 'funciono', at: '' } },
      ],
      cambios: [{ id: 'c1', athleteId: 'a', area: 'entreno', objeto: 'rutina:w', titulo: 'Torso', lineas: [], at: '', autor: '' }],
      logs: [],
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toBe('Toca mirar «Torso» (desde el 15 nov)');
    expect(avisos[0].detalle).toBe('Esperabas: «que suba el press». Press banca · aún no hay sesiones a los dos lados del cambio.');
  });

  it('sin nada, nada', () => {
    expect(loQuePideDecision({ hoy: HOY, nombreDe, revision: base as never })).toEqual([]);
  });
});

describe('cómo vas', () => {
  it('dice el cambio en su idioma', () => {
    expect(fraseDeCambio(4.2)).toBe('mueves un 4,2 % más');
    expect(fraseDeCambio(-3)).toBe('mueves un 3 % menos');
    expect(fraseDeCambio(0)).toBeNull();
    expect(fraseDeCambio(null)).toBeNull();
  });
  it('medidas y fotos solo cuentan si son de esta semana (el peso no es una medida)', () => {
    expect(hayMedidaNueva({
      medidas: [{ date: '2026-11-15', metricKey: 'cintura' }, { date: '2026-11-16', metricKey: 'bodyweight' }],
      fotos: [{ date: '2026-10-01' }], semana,
    })).toEqual({ medidas: true, fotos: false });
    expect(hayMedidaNueva({ medidas: [{ date: '2026-11-16', metricKey: 'bodyweight' }], semana }).medidas).toBe(false);
  });
});
