import { describe, expect, it, vi, afterEach } from 'vitest';
import { QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { hasAnsweredThisOccurrence, isOverdue } from './questionnaireSchedule';

afterEach(() => { vi.useRealTimers(); });

// Regresión del bug real: antes, hasAnsweredThisOccurrence comparaba solo
// contra el día EXACTO del pulso de un 'interval' — si el atleta respondía un
// día tarde, la ocurrencia quedaba sin cerrar para siempre. El arreglo usa una
// ventana [último pulso, hoy] en vez de una fecha exacta.
describe("'interval' schedules: a late response still closes the occurrence", () => {
  const assignment: QuestionnaireAssignment = {
    id: 'as1', questionnaireId: 'q1', athleteId: 'x@x.com',
    schedule: { type: 'interval', intervalDays: 14 }, startDate: '2026-07-01',
    active: true, createdAt: '2026-07-01T00:00:00Z',
  };
  // Pulsos: 2026-07-01, 2026-07-15, 2026-07-29…

  it('stays overdue the day after the exact pulse if still unanswered', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00')); // pulso exacto
    expect(isOverdue(assignment)).toBe(true);
    vi.setSystemTime(new Date('2026-07-16T12:00:00')); // un día tarde
    expect(isOverdue(assignment)).toBe(true);
    expect(hasAnsweredThisOccurrence(assignment, [])).toBe(false);
  });

  it('a response submitted one day late still closes the occurrence', () => {
    const lateResponse: QuestionnaireResponse = {
      id: 'r1', questionnaireId: 'q1', assignmentId: 'as1', athleteId: 'x@x.com',
      submittedAt: '2026-07-16T09:00:00.000Z', answers: [],
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00'));
    expect(hasAnsweredThisOccurrence(assignment, [lateResponse])).toBe(true);
  });

  it('a response from the previous occurrence does not carry over into the next window', () => {
    const oldResponse: QuestionnaireResponse = {
      id: 'r0', questionnaireId: 'q1', assignmentId: 'as1', athleteId: 'x@x.com',
      submittedAt: '2026-07-01T09:00:00.000Z', answers: [],
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00')); // siguiente pulso, 14 días después
    expect(hasAnsweredThisOccurrence(assignment, [oldResponse])).toBe(false);
    expect(isOverdue(assignment)).toBe(true);
  });
});

describe('isOverdue falls back to isDueToday only for "once"', () => {
  it('a "once" assignment is only overdue on its exact startDate', () => {
    const once: QuestionnaireAssignment = {
      id: 'as2', questionnaireId: 'q1', athleteId: 'x@x.com',
      schedule: { type: 'once' }, startDate: '2026-07-10', active: true, createdAt: '2026-07-01T00:00:00Z',
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00'));
    expect(isOverdue(once)).toBe(true);
    vi.setSystemTime(new Date('2026-07-11T12:00:00'));
    expect(isOverdue(once)).toBe(false);
  });
});

// Bug real: 'monthly' y 'weekdays' solo se marcaban vencidos el día exacto —
// si el atleta no respondía ese mismo día (p.ej. "Mediciones" el día 26 o
// "Revisión Semanal" el viernes), desaparecía de "pendientes" hasta la
// próxima ocurrencia, a veces semanas después, sin que el coach lo viera.
describe("'monthly' schedules: stay overdue past the exact day until answered", () => {
  const mediciones: QuestionnaireAssignment = {
    id: 'as3', questionnaireId: 'q1', athleteId: 'x@x.com',
    schedule: { type: 'monthly', dayOfMonth: 26 }, startDate: '2026-01-01',
    active: true, createdAt: '2026-01-01T00:00:00Z',
  };

  it('is not overdue before the day of month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00'));
    expect(isOverdue(mediciones)).toBe(false);
  });

  it('stays overdue for the rest of the month if unanswered', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00'));
    expect(isOverdue(mediciones)).toBe(true);
    vi.setSystemTime(new Date('2026-08-30T12:00:00'));
    expect(isOverdue(mediciones)).toBe(true);
  });

  it('resets on the first of the next month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00'));
    expect(isOverdue(mediciones)).toBe(false);
  });

  it('a late response closes the occurrence for the rest of the month', () => {
    const late: QuestionnaireResponse = {
      id: 'r2', questionnaireId: 'q1', assignmentId: 'as3', athleteId: 'x@x.com',
      submittedAt: '2026-08-29T09:00:00.000Z', answers: [],
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00'));
    expect(hasAnsweredThisOccurrence(mediciones, [late])).toBe(true);
  });
});

describe("'weekdays' schedules: stay overdue past the exact day until answered", () => {
  const revisionSemanal: QuestionnaireAssignment = {
    id: 'as4', questionnaireId: 'q1', athleteId: 'x@x.com',
    schedule: { type: 'weekdays', weekdays: [5] }, startDate: '2026-01-01', // viernes
    active: true, createdAt: '2026-01-01T00:00:00Z',
  };

  it('stays overdue days after the missed Friday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00')); // viernes
    expect(isOverdue(revisionSemanal)).toBe(true);
    vi.setSystemTime(new Date('2026-08-30T12:00:00')); // domingo, sin responder
    expect(isOverdue(revisionSemanal)).toBe(true);
    expect(hasAnsweredThisOccurrence(revisionSemanal, [])).toBe(false);
  });

  it('a late response (Sunday, after missing Friday) closes the occurrence', () => {
    const late: QuestionnaireResponse = {
      id: 'r3', questionnaireId: 'q1', assignmentId: 'as4', athleteId: 'x@x.com',
      submittedAt: '2026-08-30T09:00:00.000Z', answers: [],
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00'));
    expect(hasAnsweredThisOccurrence(revisionSemanal, [late])).toBe(true);
  });

  it('a response from the previous week does not carry over into this week', () => {
    const oldResponse: QuestionnaireResponse = {
      id: 'r4', questionnaireId: 'q1', assignmentId: 'as4', athleteId: 'x@x.com',
      submittedAt: '2026-08-21T09:00:00.000Z', answers: [], // viernes anterior
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00')); // viernes siguiente
    expect(hasAnsweredThisOccurrence(revisionSemanal, [oldResponse])).toBe(false);
    expect(isOverdue(revisionSemanal)).toBe(true);
  });
});
