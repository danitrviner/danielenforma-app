import { describe, expect, it } from 'vitest';
import { Questionnaire, QuestionnaireAssignment, QuestionnaireQuestion } from '../types';
import { resolveQuestions } from './questionnaireResolve';

function q(id: string, label: string): QuestionnaireQuestion {
  return { id, label, type: 'text', required: false };
}

const TEMPLATE: Questionnaire = {
  id: 'q1', ownerId: 'coach', title: 'Plantilla',
  questions: [q('a', 'Pregunta A'), q('b', 'Pregunta B'), q('c', 'Pregunta C')],
};

const BASE_ASSIGNMENT: QuestionnaireAssignment = {
  id: 'as1', questionnaireId: 'q1', athleteId: 'x@x.com',
  schedule: { type: 'once' }, startDate: '2026-01-01', active: true, createdAt: '2026-01-01T00:00:00Z',
};

describe('resolveQuestions', () => {
  it('returns the template intact when the assignment has no overrides', () => {
    expect(resolveQuestions(TEMPLATE, BASE_ASSIGNMENT)).toEqual(TEMPLATE.questions);
  });

  it('hides, relabels and overrides required per-question without changing questionId', () => {
    const assignment: QuestionnaireAssignment = {
      ...BASE_ASSIGNMENT,
      overrides: { hidden: ['b'], relabeled: { a: 'Pregunta A (para ti)' }, required: { c: true } },
    };
    const result = resolveQuestions(TEMPLATE, assignment);
    expect(result.map(r => r.id)).toEqual(['a', 'c']);
    expect(result.find(r => r.id === 'a')?.label).toBe('Pregunta A (para ti)');
    expect(result.find(r => r.id === 'a')?.required).toBe(false); // sin override propio, se queda como en la plantilla
    expect(result.find(r => r.id === 'c')?.required).toBe(true);
  });

  it('appends extra client-only questions after the template ones', () => {
    const extra = q('x_1', 'Pregunta solo tuya');
    const assignment: QuestionnaireAssignment = { ...BASE_ASSIGNMENT, overrides: { extra: [extra] } };
    const result = resolveQuestions(TEMPLATE, assignment);
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual(extra);
  });

  it('reorders per the order override and appends any unlisted question at the end', () => {
    const assignment: QuestionnaireAssignment = { ...BASE_ASSIGNMENT, overrides: { order: ['c', 'a'] } };
    const result = resolveQuestions(TEMPLATE, assignment);
    // 'b' no aparece en `order` (p.ej. se añadió a la plantilla después de fijar
    // el orden) — no debe perderse, se añade al final.
    expect(result.map(r => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('combines hidden + relabeled + extra + order together', () => {
    const extra = q('x_1', 'Extra');
    const assignment: QuestionnaireAssignment = {
      ...BASE_ASSIGNMENT,
      overrides: { hidden: ['b'], extra: [extra], order: ['x_1', 'c', 'a'] },
    };
    const result = resolveQuestions(TEMPLATE, assignment);
    expect(result.map(r => r.id)).toEqual(['x_1', 'c', 'a']);
  });
});
