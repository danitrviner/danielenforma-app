import { describe, expect, it } from 'vitest';
import {
  Exercise, Mesocycle, MuscleGroup, MuscleGroupConfig, Questionnaire, QuestionnaireResponse,
  WorkoutAssignment, WorkoutLog, MUSCLE_ORDER,
} from '../types';
import { leerFeedback, buildVolumeHistoryFrom } from './volumeHistory';
import { adherenciaDeMesociclo } from './adherence';

const grupos = (parcial: Partial<Record<MuscleGroup, number>>): Record<MuscleGroup, MuscleGroupConfig> =>
  Object.fromEntries(MUSCLE_ORDER.map(g => [g, { series: parcial[g] ?? 0, priority: 'media' as const }])) as Record<MuscleGroup, MuscleGroupConfig>;

const meso = (over: Partial<Mesocycle> = {}): Mesocycle => ({
  id: 'm1', athleteId: 'a@b.c', number: 1, weeks: 4, startDate: '2026-05-01',
  objective: '', daysPerWeek: 4, groups: grupos({ pecho: 10 }),
  ...over,
});

const asig = (id: string, mesocycleId: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({
  id, workoutId: 'w', athleteId: 'uid', date: '2026-05-02', status, mesocycleId,
});

const pregunta = (id: string, signalKey?: string) => ({
  id, label: id, type: 'scale' as const, required: false, ...(signalKey ? { signalKey } : {}),
});

const cuestionario = (questions: ReturnType<typeof pregunta>[]): Questionnaire => ({
  id: 'q1', ownerId: 'coach', title: 'Fin de mesociclo', questions,
});

const respuesta = (submittedAt: string, answers: { questionId: string; value: string | number }[]): QuestionnaireResponse => ({
  id: `r-${submittedAt}`, questionnaireId: 'q1', assignmentId: 'qa1', athleteId: 'a@b.c', submittedAt, answers,
});

describe('adherenciaDeMesociclo', () => {
  it('cuenta solo las asignaciones de ese mesociclo', () => {
    const a = [asig('1', 'm1', 'completed'), asig('2', 'm1', 'pending'), asig('3', 'm2', 'completed')];
    expect(adherenciaDeMesociclo(a, 'm1')).toBe(50);
  });

  it('sin asignaciones devuelve null, no 0%', () => {
    expect(adherenciaDeMesociclo([], 'm1')).toBeNull();
    expect(adherenciaDeMesociclo([asig('1', 'otro', 'completed')], 'm1')).toBeNull();
  });
});

describe('leerFeedback', () => {
  it('sin preguntas etiquetadas no hay feedback que leer', () => {
    const q = cuestionario([pregunta('p1')]);
    expect(leerFeedback([respuesta('2026-06-01', [{ questionId: 'p1', value: 8 }])], [q])).toBeUndefined();
  });

  it('lee las escalas del cierre de bloque', () => {
    const q = cuestionario([
      pregunta('p1', 'meso_end.rating'),
      pregunta('p2', 'meso_end.recovery'),
      pregunta('p3', 'meso_end.effort'),
    ]);
    const fb = leerFeedback([respuesta('2026-06-01', [
      { questionId: 'p1', value: 8 }, { questionId: 'p2', value: 3 }, { questionId: 'p3', value: 9 },
    ])], [q]);
    expect(fb).toMatchObject({ rating: 8, recovery: 3, effort: 9 });
  });

  it('traduce las etiquetas de la multi-opción a grupos musculares', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.priority_groups'), pregunta('p2', 'meso_end.overload_groups')]);
    const fb = leerFeedback([respuesta('2026-06-01', [
      { questionId: 'p1', value: 'Pecho,Deltoides lat.' },
      { questionId: 'p2', value: 'Isquiotibiales' },
    ])], [q])!;
    expect(fb.priorityGroups).toEqual(['pecho', 'deltoide_lat']);
    expect(fb.overloadGroups).toEqual(['isquios']);
  });

  it('ignora opciones que no corresponden a ningún grupo', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.priority_groups')]);
    const fb = leerFeedback([respuesta('2026-06-01', [{ questionId: 'p1', value: 'Pecho,Inventado' }])], [q])!;
    expect(fb.priorityGroups).toEqual(['pecho']);
  });

  it('cuando dos zonas de agujetas caen en el mismo grupo se queda con la peor', () => {
    const q = cuestionario([pregunta('p1', 'doms.core'), pregunta('p2', 'doms.core')]);
    const fb = leerFeedback([respuesta('2026-06-01', [
      { questionId: 'p1', value: 4 }, { questionId: 'p2', value: 9 },
    ])], [q])!;
    expect(fb.doms.core).toBe(9);
  });

  it('de dos respuestas del mismo cuestionario manda la más reciente', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.recovery')]);
    const fb = leerFeedback([
      respuesta('2026-05-01T10:00:00Z', [{ questionId: 'p1', value: 2 }]),
      respuesta('2026-06-01T10:00:00Z', [{ questionId: 'p1', value: 9 }]),
    ], [q])!;
    expect(fb.recovery).toBe(9);
  });
});

describe('leerFeedback — agujetas', () => {
  /* 17-11-2026. Las agujetas se quedaban con el MÁXIMO de todas las respuestas
     de la vida del atleta, y solo se leía el DOM's antiguo (`doms.<grupo>`,
     0-10), no el módulo oficial de «Tu semana» (`agujetas.<zona>`, 1-5). */
  it('manda la lectura más reciente de cada grupo, no el máximo histórico', () => {
    const q = cuestionario([pregunta('p1', 'doms.isquios'), pregunta('p2', 'doms.pecho')]);
    const fb = leerFeedback([
      respuesta('2026-01-10T10:00:00Z', [{ questionId: 'p1', value: 9 }, { questionId: 'p2', value: 7 }]),
      respuesta('2026-05-20T10:00:00Z', [{ questionId: 'p1', value: 3 }]),
    ], [q])!;
    expect(fb.doms.isquios).toBe(3);
    // De pecho no hay lectura más nueva: vale la que hay.
    expect(fb.doms.pecho).toBe(7);
  });

  it('solo cuenta las respuestas enviadas dentro de la ventana', () => {
    const q = cuestionario([pregunta('p1', 'doms.isquios')]);
    const respuestas = [
      respuesta('2026-04-20T10:00:00Z', [{ questionId: 'p1', value: 9 }]), // antes del bloque
      respuesta('2026-05-10T10:00:00Z', [{ questionId: 'p1', value: 4 }]),
      respuesta('2026-06-15T10:00:00Z', [{ questionId: 'p1', value: 10 }]), // ya en el bloque siguiente
    ];
    const fb = leerFeedback(respuestas, [q], { desde: '2026-05-01', hasta: '2026-05-28' })!;
    expect(fb.doms.isquios).toBe(4);
    expect(leerFeedback(respuestas, [q], { desde: '2026-07-01', hasta: '2026-07-28' })).toBeUndefined();
  });

  it('lee el módulo oficial (agujetas.<zona>, 1-5) y lo lleva a la escala 0-10', () => {
    const q = cuestionario([pregunta('p1', 'agujetas.isquios'), pregunta('p2', 'agujetas.pectoral')]);
    const fb = leerFeedback([respuesta('2026-05-10T10:00:00Z', [
      { questionId: 'p1', value: 4 }, { questionId: 'p2', value: 1 },
    ])], [q])!;
    // El 4 del curso («te pasas») es el 8 que recorta el sugeridor.
    expect(fb.doms.isquios).toBe(8);
    expect(fb.doms.pecho).toBe(2);
  });

  it('una zona que cubre varios grupos vale para todos', () => {
    const q = cuestionario([pregunta('p1', 'agujetas.deltoides')]);
    const fb = leerFeedback([respuesta('2026-05-10T10:00:00Z', [{ questionId: 'p1', value: 5 }])], [q])!;
    expect(fb.doms).toEqual({ deltoide_ant: 10, deltoide_lat: 10, deltoide_post: 10 });
  });

  it('una zona que no existe o una respuesta vacía no inventan lectura', () => {
    const q = cuestionario([pregunta('p1', 'agujetas.inventada'), pregunta('p2', 'agujetas.gluteo')]);
    expect(leerFeedback([respuesta('2026-05-10T10:00:00Z', [
      { questionId: 'p1', value: 5 }, { questionId: 'p2', value: '' },
    ])], [q])).toBeUndefined();
  });

  it('el DOM\'s antiguo y el módulo oficial en la misma respuesta: manda el peor', () => {
    const q = cuestionario([pregunta('p1', 'doms.gluteo'), pregunta('p2', 'agujetas.gluteo')]);
    const fb = leerFeedback([respuesta('2026-05-10T10:00:00Z', [
      { questionId: 'p1', value: 5 }, { questionId: 'p2', value: 4 },
    ])], [q])!;
    expect(fb.doms.gluteo).toBe(8);
  });
});

describe('buildVolumeHistoryFrom', () => {
  const ex: Exercise[] = [{
    id: 'press', ownerId: 'c', name: 'Press banca', primaryFocus: '', muscleGroup: 'pecho',
    type: 'fuerza', isCustom: false,
  }];

  const log = (date: string, series: number): WorkoutLog => ({
    id: `l-${date}`, athleteId: 'a@b.c', workoutId: 'w', assignmentId: 'as', date,
    completedAt: `${date}T10:00:00.000Z`,
    entries: [{ exerciseId: 'press', sets: Array.from({ length: series }, () => ({ weight: 80, repsDone: 8, rir: 2 })) }],
  });

  it('sin mesociclo anterior devuelve un historial vacío en vez de romperse', () => {
    const h = buildVolumeHistoryFrom({
      mesocycles: [meso()], currentId: 'm1', logs: [], exercises: ex, assignments: [],
    });
    expect(h.previous).toBeUndefined();
    expect(h.adherencePct).toBeNull();
    expect(h.groups).toEqual({});
  });

  it('convierte las series del bloque anterior a series SEMANALES', () => {
    const previo = meso({ id: 'm1', number: 1, weeks: 4, startDate: '2026-05-01', groups: grupos({ pecho: 10 }) });
    const actual = meso({ id: 'm2', number: 2, startDate: '2026-06-01' });
    // 4 sesiones × 8 series = 32 series de pecho en 4 semanas → 8/semana
    const logs = ['2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23'].map(d => log(d, 8));
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs, exercises: ex, assignments: [],
    });
    expect(h.previous?.id).toBe('m1');
    expect(h.groups.pecho).toMatchObject({ planned: 10, performed: 8 });
  });

  it('un grupo programado del que no hay ni una serie sale con performed 0', () => {
    const previo = meso({ id: 'm1', number: 1, groups: grupos({ pecho: 10, dorsal: 12 }) });
    const actual = meso({ id: 'm2', number: 2, startDate: '2026-06-01' });
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs: [log('2026-05-02', 8)], exercises: ex, assignments: [],
    });
    expect(h.groups.dorsal).toEqual({ planned: 12, performed: 0, deltaPct: -100 });
  });

  it('coge la adherencia del mesociclo ANTERIOR, no la del que se está montando', () => {
    const previo = meso({ id: 'm1', number: 1 });
    const actual = meso({ id: 'm2', number: 2, startDate: '2026-06-01' });
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs: [], exercises: ex,
      assignments: [
        asig('1', 'm1', 'completed'), asig('2', 'm1', 'completed'), asig('3', 'm1', 'perdido'), asig('4', 'm1', 'pending'),
        asig('5', 'm2', 'pending'),
      ],
    });
    expect(h.adherencePct).toBe(50);
  });

  it('el feedback se lee aunque no haya mesociclo anterior', () => {
    const q = cuestionario([pregunta('p1', 'meso_end.recovery')]);
    const h = buildVolumeHistoryFrom({
      mesocycles: [meso()], currentId: 'm1', logs: [], exercises: ex, assignments: [],
      questionnaires: [q], responses: [respuesta('2026-06-01', [{ questionId: 'p1', value: 3 }])],
    });
    expect(h.feedback?.recovery).toBe(3);
  });

  // ── 17-11-2026: todo lo que decide sale del bloque anterior ─────────────
  const previo = meso({ id: 'm1', number: 1, weeks: 4, startDate: '2026-05-04', groups: grupos({ pecho: 8 }) });
  const actual = meso({ id: 'm2', number: 2, weeks: 4, startDate: '2026-06-01' });
  const logConRir = (date: string, series: number, rir: number, mesocycleId?: string): WorkoutLog => ({
    ...log(date, series), ...(mesocycleId ? { mesocycleId } : {}),
    entries: [{ exerciseId: 'press', sets: Array.from({ length: series }, () => ({ weight: 80, repsDone: 8, rir })) }],
  });

  it('el RIR medio es el del bloque anterior, no el de los últimos 28 días', () => {
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', exercises: ex, assignments: [],
      logs: [
        logConRir('2026-05-05', 4, 1), logConRir('2026-05-12', 4, 2), // bloque anterior
        logConRir('2026-06-02', 4, 4), logConRir('2026-06-09', 4, 4), // bloque en curso
      ],
    });
    expect(h.meanRir).toBe(1.5);
  });

  it('el RIR no depende de la fecha de hoy: un bloque que acabó hace meses lo conserva', () => {
    // Antes salía null en cuanto pasaban 28 días del último registro.
    const h = buildVolumeHistoryFrom({
      mesocycles: [meso({ ...previo, startDate: '2025-01-06' }), actual], currentId: 'm2', exercises: ex, assignments: [],
      logs: [logConRir('2025-01-07', 4, 2)],
    });
    expect(h.meanRir).toBe(2);
  });

  it('las agujetas son las del bloque anterior (con dos días de gracia para la última semana)', () => {
    const q = cuestionario([pregunta('p1', 'doms.pecho'), pregunta('p2', 'doms.dorsal'), pregunta('p3', 'doms.gluteo')]);
    const h = buildVolumeHistoryFrom({
      mesocycles: [previo, actual], currentId: 'm2', logs: [], exercises: ex, assignments: [],
      questionnaires: [q],
      responses: [
        respuesta('2026-03-01T10:00:00Z', [{ questionId: 'p1', value: 10 }]), // un bloque antes del anterior
        respuesta('2026-05-15T10:00:00Z', [{ questionId: 'p2', value: 6 }]),
        // El bloque acaba el domingo 31-05: la respuesta del martes 02-06 es de su última semana.
        respuesta('2026-06-02T10:00:00Z', [{ questionId: 'p2', value: 8 }]),
        respuesta('2026-06-12T10:00:00Z', [{ questionId: 'p3', value: 9 }]), // ya del bloque nuevo
      ],
    });
    expect(h.feedback?.doms).toEqual({ dorsal: 8 });
  });

  it('las semanas de descarga no cuentan en la media de series hechas', () => {
    // 3 semanas a 8 series y la 4.ª, de descarga, a 4: cumplió el plan entero.
    const conDescarga = meso({ ...previo, semanasDescarga: [4], deloadWeek: 4 });
    const logs = [logConRir('2026-05-05', 8, 2), logConRir('2026-05-12', 8, 2), logConRir('2026-05-19', 8, 2), logConRir('2026-05-26', 4, 2)];
    const h = buildVolumeHistoryFrom({ mesocycles: [conDescarga, actual], currentId: 'm2', logs, exercises: ex, assignments: [] });
    expect(h.groups.pecho).toEqual({ planned: 8, performed: 8, deltaPct: 0 });
    expect(h.semanasContadas).toBe(3);
    // Sin excluirla salía 7 (28 ÷ 4): un −12 % que no existió.
    const sin = buildVolumeHistoryFrom({ mesocycles: [previo, actual], currentId: 'm2', logs, exercises: ex, assignments: [] });
    expect(sin.groups.pecho?.performed).toBe(7);
  });

  it('la marca deloadWeek sola no recortó nada, así que esa semana sí cuenta', () => {
    const soloMarca = meso({ ...previo, deloadWeek: 4 });
    const logs = ['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26'].map(d => logConRir(d, 8, 2));
    const h = buildVolumeHistoryFrom({ mesocycles: [soloMarca, actual], currentId: 'm2', logs, exercises: ex, assignments: [] });
    expect(h.groups.pecho?.performed).toBe(8);
    expect(h.semanasContadas).toBe(4);
  });

  it('con un ciclo de 14 días, una vuelta de descarga son dos semanas fuera', () => {
    // 8 semanas = 4 vueltas; la vuelta 4 (semanas 7 y 8) es de descarga.
    const largo = meso({ ...previo, weeks: 8, cycleDays: 14, semanasDescarga: [4], deloadWeek: 7 });
    const trabajo = ['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26', '2026-06-02', '2026-06-09'].map(d => logConRir(d, 8, 2));
    const descarga = ['2026-06-16', '2026-06-23'].map(d => logConRir(d, 4, 2));
    const h = buildVolumeHistoryFrom({
      mesocycles: [largo, meso({ ...actual, startDate: '2026-06-29' })], currentId: 'm2',
      logs: [...trabajo, ...descarga], exercises: ex, assignments: [],
    });
    expect(h.semanasContadas).toBe(6);
    expect(h.groups.pecho?.performed).toBe(8);
  });

  describe('sin bloque nuevo todavía (el asistente, currentId null)', () => {
    it('el bloque anterior es el que está en curso, contado solo en sus semanas terminadas', () => {
      // Hoy es miércoles de la 3.ª semana de m2: dos semanas terminadas.
      const asigEn = (id: string, date: string, status: WorkoutAssignment['status']): WorkoutAssignment => ({ ...asig(id, 'm2', status), date });
      const h = buildVolumeHistoryFrom({
        mesocycles: [previo, meso({ ...actual, groups: grupos({ pecho: 8 }) })], currentId: null, hoy: '2026-06-17', exercises: ex,
        logs: [
          logConRir('2026-05-05', 2, 4, 'm1'),
          logConRir('2026-06-02', 8, 1, 'm2'), logConRir('2026-06-09', 8, 1, 'm2'),
          logConRir('2026-06-16', 3, 3, 'm2'), // semana a medias: no cuenta
        ],
        assignments: [
          asigEn('1', '2026-06-02', 'completed'), asigEn('2', '2026-06-09', 'completed'),
          asigEn('3', '2026-06-16', 'completed'), asigEn('4', '2026-06-23', 'pending'), asigEn('5', '2026-06-25', 'pending'),
        ],
      });
      expect(h.previous?.id).toBe('m2');
      expect(h.enCurso).toBe(true);
      expect(h.semanasContadas).toBe(2);
      expect(h.groups.pecho).toEqual({ planned: 8, performed: 8, deltaPct: 0 });
      expect(h.meanRir).toBe(1);
      // Las sesiones que aún no tocan no cuentan como no hechas.
      expect(h.adherencePct).toBe(100);
    });

    it('un bloque recién empezado, o uno creado con fecha futura, no es «el anterior»', () => {
      const futuro = meso({ id: 'm3', number: 3, startDate: '2026-07-06' });
      const h = buildVolumeHistoryFrom({
        mesocycles: [previo, actual, futuro], currentId: null, hoy: '2026-06-03', // tercer día de m2
        logs: [logConRir('2026-05-05', 8, 2, 'm1')], exercises: ex, assignments: [],
      });
      expect(h.previous?.id).toBe('m1');
      expect(h.enCurso).toBe(false);
    });

    it('un cliente sin ningún bloque con historial devuelve el historial vacío', () => {
      const h = buildVolumeHistoryFrom({
        mesocycles: [meso({ startDate: '2026-06-15' })], currentId: null, hoy: '2026-06-17',
        logs: [], exercises: ex, assignments: [],
      });
      expect(h.previous).toBeUndefined();
      expect(h.groups).toEqual({});
    });
  });
});
