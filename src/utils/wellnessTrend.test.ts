import { describe, expect, it } from 'vitest';
import { Questionnaire, QuestionnaireResponse } from '../types';
import { ewmaDeSeñal } from './wellnessTrend';

const q = (id: string, questions: { id: string; signalKey?: string }[]): Questionnaire => ({
  id, ownerId: 'coach', title: 't', questions: questions.map(p => ({ ...p, label: '', type: 'numeric', required: false })),
});
const resp = (submittedAt: string, questionId: string, value: number): QuestionnaireResponse => ({
  id: `r-${submittedAt}`, questionnaireId: 'q1', assignmentId: 'as', athleteId: 'a@b.c', submittedAt,
  answers: [{ questionId, value }],
});

describe('ewmaDeSeñal', () => {
  it('compone historialDeSeñal + computeEWMA', () => {
    const questionnaires = [q('q1', [{ id: 'x', signalKey: 'wellness.sleep_hours_weekly' }])];
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'x', 8),
      resp('2026-08-08T10:00:00.000Z', 'x', 8),
      resp('2026-08-15T10:00:00.000Z', 'x', 4), // mala semana suelta
    ];
    const ewma = ewmaDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires, 0.3);
    expect(ewma.map(p => p.value)).toEqual([8, 8, 6.8]); // 0.3*4+0.7*8 = 6.8
  });

  it('señal sin respuestas da serie vacía', () => {
    expect(ewmaDeSeñal('wellness.stress_weekly', [], [])).toEqual([]);
  });
});
