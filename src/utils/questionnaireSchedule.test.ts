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

describe('isOverdue falls back to isDueToday for the untouched legacy types', () => {
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
