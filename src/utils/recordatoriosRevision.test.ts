import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordatoriosDeRevision, avisoDeCuestionarioNuevo, claveCuestionarioNuevo } from './recordatoriosRevision';
import { seAbreHoy } from './questionnaireSchedule';
import type { Mesocycle, QuestionnaireAssignment, QuestionnaireResponse } from '../types';

const semanal: QuestionnaireAssignment = {
  id: 'a', questionnaireId: 'q', athleteId: 'x@x.com', active: true, createdAt: '2026-09-01',
  schedule: { type: 'weekdays', weekdays: [5] }, startDate: '2026-09-04',
};
const en = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso + 'T03:00:00')); return iso; };

describe('recordatoriosDeRevision', () => {
  afterEach(() => vi.useRealTimers());
  const perfil = { email: 'x@x.com' };

  it('el día que se abre (viernes) y la víspera de caducar (lunes)', () => {
    const vie = en('2026-10-30');
    expect(recordatoriosDeRevision({ hoy: vie, perfil, asignaciones: [semanal], respuestas: [] })[0].dedupeKey).toBe('rev_abre_x@x.com_2026-10-30');
    const lun = en('2026-11-02');
    expect(recordatoriosDeRevision({ hoy: lun, perfil, asignaciones: [semanal], respuestas: [] })[0].notificacion.title).toMatch(/caduca mañana/);
    const sab = en('2026-10-31');
    expect(recordatoriosDeRevision({ hoy: sab, perfil, asignaciones: [semanal], respuestas: [] })).toEqual([]);
  });

  it('respondida o en pausa: nada', () => {
    const lun = en('2026-11-02');
    const r = { assignmentId: 'a', submittedAt: '2026-10-31T10:00:00Z' } as QuestionnaireResponse;
    expect(recordatoriosDeRevision({ hoy: lun, perfil, asignaciones: [semanal], respuestas: [r] })).toEqual([]);
    expect(recordatoriosDeRevision({ hoy: lun, perfil: { ...perfil, pausaRevisiones: { desde: '2026-10-25', hasta: '2026-11-05' } }, asignaciones: [semanal], respuestas: [] })).toEqual([]);
  });

  it('con revisión el martes, se abre el sábado', () => {
    const sab = en('2026-10-31');
    expect(recordatoriosDeRevision({ hoy: sab, perfil: { ...perfil, diaRevision: 2 }, asignaciones: [semanal], respuestas: [] })).toHaveLength(1);
  });
});

describe('cuestionario nuevo (18-11-2026)', () => {
  afterEach(() => vi.useRealTimers());
  const perfil = { email: 'x@x.com' };
  const plantillas = [
    { id: 'q', title: 'Tu semana', questions: [] },
    { id: 'qc', title: 'Cierre de bloque', questions: [] },
    { id: 'qm', title: 'Mediciones del bloque', questions: [] },
    { id: 'qh', title: 'Revisión Mes 1 (4 semanas)', questions: [] },
  ];

  it('el aviso: tipo propio, a Revisión, con el título y la clave por asignación y día', () => {
    const r = avisoDeCuestionarioNuevo({ email: 'x@x.com', assignmentId: 'a', desde: '2026-11-18', titulo: 'Cierre de bloque', ahora: '2026-11-18T10:00:00Z' });
    expect(r.dedupeKey).toBe(claveCuestionarioNuevo('x@x.com', 'a', '2026-11-18'));
    expect(r.dedupeKey).toBe('cuestionario_nuevo_x@x.com_a_2026-11-18');
    expect(r.notificacion).toMatchObject({ recipientEmail: 'x@x.com', type: 'cuestionario_nuevo', link: 'checkin', read: false });
    expect(r.notificacion.body).toContain('«Cierre de bloque»');
    expect(avisoDeCuestionarioNuevo({ email: 'x@x.com', assignmentId: 'a', desde: '2026-11-18' }).notificacion.body).not.toContain('«');
  });

  it('«Mandar ahora» un miércoles: el latido de ese día avisa (misma clave que el botón)', () => {
    const mie = en('2026-11-04');
    const conExtra = { ...semanal, excepciones: [{ nuevaFecha: mie }] };
    const avisos = recordatoriosDeRevision({ hoy: mie, perfil, asignaciones: [conExtra], respuestas: [], plantillas });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].dedupeKey).toBe('cuestionario_nuevo_x@x.com_a_2026-11-04');
    expect(avisos[0].notificacion.body).toContain('Tu semana');
  });

  it('una fecha movida avisa el día nuevo, no el de siempre', () => {
    const conMovida = { ...semanal, excepciones: [{ ocurrencia: '2026-11-06', nuevaFecha: '2026-11-08' }] };
    const dom = en('2026-11-08');
    expect(recordatoriosDeRevision({ hoy: dom, perfil, asignaciones: [conMovida], respuestas: [], plantillas })[0].notificacion.type).toBe('cuestionario_nuevo');
    expect(seAbreHoy(conMovida, undefined, '2026-11-06')).toBe(false);
  });

  it('contestado ya: nada', () => {
    const mie = en('2026-11-04');
    const conExtra = { ...semanal, excepciones: [{ nuevaFecha: mie }] };
    const r = { assignmentId: 'a', submittedAt: '2026-11-04T08:00:00Z' } as QuestionnaireResponse;
    expect(recordatoriosDeRevision({ hoy: mie, perfil, asignaciones: [conExtra], respuestas: [r], plantillas })).toEqual([]);
  });

  it('el día de la revisión, un solo aviso que nombra lo que no es semanal (el cierre en su semana elegida)', () => {
    const meso = { id: 'm', startDate: '2026-09-07', weeks: 8, objective: 'Hipertrofia', semanaDeCierre: 6 } as Mesocycle;
    const deBloque = { athleteId: 'x@x.com', active: true, createdAt: '2026-09-01', startDate: '2026-09-01', schedule: { type: 'mesocycle_week' as const, semanaDelBloque: 'ultima' as const } };
    const cierre: QuestionnaireAssignment = { ...deBloque, id: 'ac', questionnaireId: 'qc' };
    const mediciones: QuestionnaireAssignment = { ...deBloque, id: 'am', questionnaireId: 'qm' };
    const plantillasConSenal = plantillas.map(p => p.id === 'qc' ? { ...p, title: 'Final', questions: [{ id: 'r', label: 'x', type: 'scale', required: true, signalKey: 'meso_end.rating' }] } : p) as never[];
    const vie = en('2026-10-16'); // semana 6
    const avisos = recordatoriosDeRevision({ hoy: vie, perfil, asignaciones: [semanal, cierre, mediciones], respuestas: [], mesociclos: [meso], plantillas: plantillasConSenal });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].dedupeKey).toBe('rev_abre_x@x.com_2026-10-16');
    expect(avisos[0].notificacion.body).toContain('Esta semana también: Final.');
    expect(avisos[0].notificacion.body).not.toContain('Mediciones');
    const vie8 = en('2026-10-30'); // semana 8: las mediciones
    expect(recordatoriosDeRevision({ hoy: vie8, perfil, asignaciones: [semanal, cierre, mediciones], respuestas: [], mesociclos: [meso], plantillas: plantillasConSenal })[0].notificacion.body)
      .toContain('Esta semana también: Mediciones del bloque.');
  });

  it('uno de una sola vez puesto para un miércoles avisa ese día', () => {
    const unaVez: QuestionnaireAssignment = { id: 'h', questionnaireId: 'qh', athleteId: 'x@x.com', active: true, createdAt: '2026-11-01', startDate: '2026-11-04', schedule: { type: 'once' } };
    const mie = en('2026-11-04');
    const avisos = recordatoriosDeRevision({ hoy: mie, perfil, asignaciones: [unaVez], respuestas: [], plantillas });
    expect(avisos.map(a => a.notificacion.type)).toEqual(['cuestionario_nuevo']);
    expect(avisos[0].notificacion.body).toContain('Revisión Mes 1');
    en('2026-11-05');
    expect(recordatoriosDeRevision({ hoy: '2026-11-05', perfil, asignaciones: [unaVez], respuestas: [], plantillas })).toEqual([]);
  });

  it('las cadencias de varias veces por semana no avisan cada día (sus «Mandar ahora» sí)', () => {
    const diario: QuestionnaireAssignment = { ...semanal, id: 'd', schedule: { type: 'interval', intervalDays: 1 }, startDate: '2026-11-01' };
    expect(seAbreHoy(diario, undefined, '2026-11-04')).toBe(false);
    expect(seAbreHoy({ ...diario, excepciones: [{ nuevaFecha: '2026-11-04' }] }, undefined, '2026-11-04')).toBe(true);
  });
});
