import { describe, expect, it } from 'vitest';
import { Questionnaire, QuestionnaireResponse } from '../types';
import { computeIRP } from './readinessIndex';

const q = (): Questionnaire => ({
  id: 'q1', ownerId: 'coach', title: 't',
  questions: [
    { id: 'sleep', label: '', type: 'numeric', required: false, signalKey: 'wellness.sleep_hours_weekly' },
    { id: 'stress', label: '', type: 'scale', required: false, signalKey: 'wellness.stress_weekly' },
    { id: 'd_pecho', label: '', type: 'scale', required: false, signalKey: 'doms.pecho' },
  ],
});
const resp = (submittedAt: string, questionId: string, value: number): QuestionnaireResponse => ({
  id: `r-${submittedAt}-${questionId}`, questionnaireId: 'q1', assignmentId: 'as', athleteId: 'a@b.c', submittedAt,
  answers: [{ questionId, value }],
});

describe('computeIRP', () => {
  it('caso feliz: los 3 componentes presentes', () => {
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'sleep', 7),
      resp('2026-08-01T10:00:00.000Z', 'stress', 3),
      resp('2026-08-01T10:00:00.000Z', 'd_pecho', 2),
      resp('2026-08-15T10:00:00.000Z', 'd_pecho', 2),
      resp('2026-08-29T10:00:00.000Z', 'd_pecho', 2),
    ];
    const r = computeIRP({ responses, questionnaires: [q()] });
    expect(r.horasSueño).toBe(7);
    expect(r.estres).toBe(3);
    expect(r.domsCronico).toBe(2);
    expect(r.valor).toBe(3.5); // 7 * (10-3-2)/10 = 7*0.5
  });

  it('sin sueño registrado, valor null', () => {
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'stress', 3),
      resp('2026-08-01T10:00:00.000Z', 'd_pecho', 2),
      resp('2026-08-15T10:00:00.000Z', 'd_pecho', 2),
      resp('2026-08-29T10:00:00.000Z', 'd_pecho', 2),
    ];
    const r = computeIRP({ responses, questionnaires: [q()] });
    expect(r.horasSueño).toBeNull();
    expect(r.valor).toBeNull();
  });

  it('sin DOMS crónico suficiente (menos de 3 lecturas), valor null', () => {
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'sleep', 7),
      resp('2026-08-01T10:00:00.000Z', 'stress', 3),
    ];
    const r = computeIRP({ responses, questionnaires: [q()] });
    expect(r.domsCronico).toBeNull();
    expect(r.valor).toBeNull();
  });

  it('un IRP negativo no se clampa a 0 — es información', () => {
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'sleep', 8),
      resp('2026-08-01T10:00:00.000Z', 'stress', 9),
      resp('2026-08-01T10:00:00.000Z', 'd_pecho', 9),
      resp('2026-08-15T10:00:00.000Z', 'd_pecho', 9),
      resp('2026-08-29T10:00:00.000Z', 'd_pecho', 9),
    ];
    const r = computeIRP({ responses, questionnaires: [q()] });
    expect(r.valor).not.toBeNull();
    expect(r.valor!).toBeLessThan(0);
  });
});
