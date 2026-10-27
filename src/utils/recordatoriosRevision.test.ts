import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordatoriosDeRevision } from './recordatoriosRevision';
import type { QuestionnaireAssignment, QuestionnaireResponse } from '../types';

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
