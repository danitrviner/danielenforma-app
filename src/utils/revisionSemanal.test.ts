import { describe, expect, it, vi, afterEach } from 'vitest';
import type { PhotoAssignment, ProgresoRevision, Questionnaire, QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { historialDeRevisiones, pasosQueFaltan, revisionDeLaSemana, revisionesSinLeerPorAtleta } from './revisionSemanal';

afterEach(() => { vi.useRealTimers(); });

// 2026-10-23 es viernes; el ciclo va hasta el lunes 26 y caduca el martes 27.
const VIERNES = '2026-10-23';

const asig = (id: string, qid: string, createdAt = '2026-10-01T00:00:00Z'): QuestionnaireAssignment => ({
  id, questionnaireId: qid, athleteId: 'a@a.com', schedule: { type: 'weekdays', weekdays: [5] },
  startDate: '2026-10-02', active: true, createdAt,
});
const plantilla = (id: string, title: string, n: number, extra: Partial<Questionnaire['questions'][number]>[] = []): Questionnaire => ({
  id, ownerId: 'c', title,
  questions: [
    ...Array.from({ length: n }, (_, i) => ({ id: `${id}_q${i}`, label: `P${i}`, type: 'scale' as const, required: true })),
    ...extra.map((x, i) => ({ id: `${id}_x${i}`, label: 'X', type: 'numeric' as const, required: false, ...x })),
  ],
});
const respuesta = (assignmentId: string, submittedAt: string, reviewedAt?: string): QuestionnaireResponse => ({
  id: `r_${assignmentId}_${submittedAt}`, questionnaireId: 'q', assignmentId, athleteId: 'a@a.com',
  submittedAt, answers: [], ...(reviewedAt ? { reviewedAt } : {}),
});

const templates = new Map([
  ['q1', plantilla('q1', 'Sensaciones', 8, [{ type: 'metric', metricKey: 'bodyweight' }])],
  ['q2', plantilla('q2', 'Agujetas', 6)],
]);

describe('revisionDeLaSemana', () => {
  it('sin nada vencido no hay revisión', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T12:00:00')); // miércoles, ya caducó
    const r = revisionDeLaSemana({ hoy: '2026-10-21', assignments: [asig('a1', 'q1')], responses: [], templates });
    expect(r.estado).toBe('sin_revision');
    expect(r.pasos).toEqual([]);
  });

  it('el viernes ordena peso → cuestionarios → fotos y dice cuándo caduca', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${VIERNES}T12:00:00`));
    const r = revisionDeLaSemana({
      hoy: VIERNES, assignments: [asig('a2', 'q2', '2026-10-02T00:00:00Z'), asig('a1', 'q1', '2026-10-01T00:00:00Z')],
      responses: [], templates,
    });
    expect(r.pasos.map(p => p.tipo)).toEqual(['peso', 'cuestionario', 'cuestionario', 'fotos']);
    expect(r.pasos.filter(p => p.tipo === 'cuestionario').map(p => p.titulo)).toEqual(['Sensaciones', 'Agujetas']);
    expect(r.ciclo).toBe(VIERNES);
    expect(r.caduca).toBe('2026-10-27');
    expect(r.estado).toBe('pendiente');
    expect(r.hechos).toBe(0);
    expect(r.siguiente?.tipo).toBe('peso');
  });

  it('cuenta lo hecho: peso del ciclo, cuestionario enviado y fotos subidas', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00'));
    const r = revisionDeLaSemana({
      hoy: '2026-10-24', assignments: [asig('a1', 'q1'), asig('a2', 'q2')],
      responses: [respuesta('a1', '2026-10-24T09:00:00Z')], templates,
      ultimoPeso: { date: '2026-10-24', weight: 80.4 },
      fotos: [{ date: '2026-10-24', view: 'front' }],
    });
    const peso = r.pasos.find(p => p.tipo === 'peso');
    expect(peso).toMatchObject({ hecho: true, detalle: '80,4 kg · hecho' });
    expect(r.pasos.find(p => p.assignmentId === 'a1')?.hecho).toBe(true);
    expect(r.pasos.find(p => p.assignmentId === 'a2')?.hecho).toBe(false);
    expect(r.pasos.find(p => p.tipo === 'fotos')?.vistasQueFaltan).toEqual(['side', 'back']);
    expect(r.hechos).toBe(2);
    expect(r.estado).toBe('en_curso');
    expect(r.siguiente?.assignmentId).toBe('a2');
  });

  it('un peso de la semana pasada no cuenta', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${VIERNES}T12:00:00`));
    const r = revisionDeLaSemana({
      hoy: VIERNES, assignments: [asig('a1', 'q1')], responses: [], templates,
      ultimoPeso: { date: '2026-10-16', weight: 81 },
    });
    expect(r.pasos[0]).toMatchObject({ tipo: 'peso', hecho: false });
  });

  it('el progreso en servidor cuenta las respondidas y marca «en curso»', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${VIERNES}T12:00:00`));
    const progreso: ProgresoRevision = {
      id: `a@a.com_${VIERNES}`, athleteId: 'a@a.com', ciclo: VIERNES, actualizadoEn: '2026-10-23T10:00:00Z',
      respuestas: { a1: { stepIdx: 3, answers: { q1_q0: 5, q1_q1: 6, q1_q2: 7 } } },
    };
    const r = revisionDeLaSemana({ hoy: VIERNES, assignments: [asig('a1', 'q1')], responses: [], templates, progreso });
    const c = r.pasos.find(p => p.assignmentId === 'a1');
    expect(c).toMatchObject({ respondidas: 3, total: 9, detalle: '9 preguntas · 3 respondidas' });
    expect(r.estado).toBe('en_curso');
  });

  it('un progreso de otro ciclo se ignora', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${VIERNES}T12:00:00`));
    const progreso: ProgresoRevision = {
      id: 'x', athleteId: 'a@a.com', ciclo: '2026-10-16', actualizadoEn: '2026-10-16T10:00:00Z',
      respuestas: { a1: { stepIdx: 3, answers: { q1_q0: 5 } } },
    };
    const r = revisionDeLaSemana({ hoy: VIERNES, assignments: [asig('a1', 'q1')], responses: [], templates, progreso });
    expect(r.pasos.find(p => p.assignmentId === 'a1')?.respondidas).toBe(0);
    expect(r.estado).toBe('pendiente');
  });

  it('enviada con algo sin hacer queda incompleta; con todo hecho, completa', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00'));
    const enviada: ProgresoRevision = { id: 'p', athleteId: 'a@a.com', ciclo: VIERNES, respuestas: {}, enviadaEn: '2026-10-25T10:00:00Z', incompleta: true, actualizadoEn: '2026-10-25T10:00:00Z' };
    const base = { hoy: '2026-10-25', assignments: [asig('a1', 'q1')], templates, ultimoPeso: { date: '2026-10-24', weight: 80 } };
    const incompleta = revisionDeLaSemana({ ...base, responses: [respuesta('a1', '2026-10-25T09:00:00Z')], progreso: enviada });
    expect(incompleta.estado).toBe('incompleta'); // faltan las fotos
    const completa = revisionDeLaSemana({
      ...base, responses: [respuesta('a1', '2026-10-25T09:00:00Z')], progreso: enviada,
      fotos: [{ date: '2026-10-25', view: 'front' }, { date: '2026-10-25', view: 'side' }, { date: '2026-10-25', view: 'back' }],
    });
    expect(completa.estado).toBe('completa');
    expect(completa.siguiente).toBeNull();
  });

  it('las fotos que pide el coach mandan sobre las tres de siempre', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${VIERNES}T12:00:00`));
    const fotoAsig: PhotoAssignment = {
      id: 'f1', athleteId: 'a@a.com', schedule: { type: 'weekdays', weekdays: [5] }, startDate: '2026-10-02',
      views: ['front'], active: true, createdAt: '2026-10-01T00:00:00Z',
    };
    const r = revisionDeLaSemana({ hoy: VIERNES, assignments: [asig('a1', 'q2')], responses: [], templates, photoAssignments: [fotoAsig] });
    expect(r.pasos.find(p => p.tipo === 'fotos')?.vistasQueFaltan).toEqual(['front']);
  });
});

describe('revisionDeLaSemana · entre martes y jueves', () => {
  it('un cuestionario que vence un jueves cuenta el peso de hoy, no el de la semana pasada', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00')); // jueves
    const mensual: QuestionnaireAssignment = { ...asig('m1', 'q1'), schedule: { type: 'monthly', dayOfMonth: 20 } };
    const base = { hoy: '2026-10-22', assignments: [mensual], responses: [], templates };
    const ayer = revisionDeLaSemana({ ...base, ultimoPeso: { date: '2026-10-16', weight: 81 } });
    expect(ayer.pasos.find(p => p.tipo === 'peso')?.hecho).toBe(false);
    const hoy = revisionDeLaSemana({ ...base, ultimoPeso: { date: '2026-10-22', weight: 80 } });
    expect(hoy.pasos.find(p => p.tipo === 'peso')?.hecho).toBe(true);
  });
});

describe('historialDeRevisiones', () => {
  it('agrupa por ciclo, de más reciente a más antiguo, con su estado', () => {
    const h = historialDeRevisiones([
      respuesta('a1', '2026-10-17T09:00:00Z', '2026-10-19T09:00:00Z'),
      respuesta('a2', '2026-10-18T09:00:00Z', '2026-10-19T09:00:00Z'),
      respuesta('a1', '2026-10-10T09:00:00Z'),
      respuesta('a1', '2026-10-03T09:00:00Z', '2026-10-05T09:00:00Z'),
    ], [{ ciclo: '2026-10-02', incompleta: true }]);
    expect(h).toEqual([
      { ciclo: '2026-10-16', cuestionarios: 2, estado: 'leida' },
      { ciclo: '2026-10-09', cuestionarios: 1, estado: 'enviada' },
      { ciclo: '2026-10-02', cuestionarios: 1, estado: 'incompleta' },
    ]);
  });
});

describe('revisionesSinLeerPorAtleta', () => {
  const r = (athleteId: string, submittedAt: string, reviewedAt?: string) => ({ athleteId, submittedAt, ...(reviewedAt ? { reviewedAt } : {}) });
  it('cuenta semanas, no cuestionarios, y deja fuera lo leído', () => {
    const m = revisionesSinLeerPorAtleta([
      r('Ana@a.com', '2026-10-23T09:00:00Z'), r('ana@a.com', '2026-10-24T09:00:00Z'), r('ana@a.com', '2026-10-25T09:00:00Z'), // misma semana
      r('ana@a.com', '2026-10-16T09:00:00Z'),                                                                              // otra semana
      r('ana@a.com', '2026-10-09T09:00:00Z', '2026-10-12T09:00:00Z'),                                                       // ya leída
      r('luis@a.com', '2026-10-24T09:00:00Z', '2026-10-26T09:00:00Z'),                                                      // leída
    ]);
    expect(m.get('ana@a.com')).toBe(2);
    expect(m.has('luis@a.com')).toBe(false);
  });
});

describe('pasosQueFaltan (contador del «+»)', () => {
  it('cuenta lo que falta mientras la revisión está sin empezar o en curso', () => {
    expect(pasosQueFaltan({ estado: 'pendiente', total: 3, hechos: 0 })).toBe(3);
    expect(pasosQueFaltan({ estado: 'en_curso', total: 3, hechos: 1 })).toBe(2);
  });
  it('no cuenta nada si ya está completa, enviada incompleta o no hay revisión', () => {
    expect(pasosQueFaltan({ estado: 'completa', total: 3, hechos: 3 })).toBe(0);
    expect(pasosQueFaltan({ estado: 'incompleta', total: 3, hechos: 1 })).toBe(0);
    expect(pasosQueFaltan({ estado: 'sin_revision', total: 0, hechos: 0 })).toBe(0);
  });
});
