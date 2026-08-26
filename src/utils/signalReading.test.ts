import { describe, expect, it } from 'vitest';
import { Questionnaire, QuestionnaireResponse } from '../types';
import { historialDeSeñal, ultimoValorDeSeñal } from './signalReading';

const q = (id: string, questions: { id: string; signalKey?: string }[]): Questionnaire => ({
  id, ownerId: 'coach', title: 't', questions: questions.map(p => ({ ...p, label: '', type: 'numeric', required: false })),
});

const resp = (id: string, submittedAt: string, answers: { questionId: string; value: string | number | boolean }[]): QuestionnaireResponse => ({
  id, questionnaireId: 'q1', assignmentId: 'as', athleteId: 'a@b.c', submittedAt, answers,
});

describe('historialDeSeñal', () => {
  it('devuelve la serie ascendente por fecha de una señal, descartando valores no numéricos', () => {
    const questionnaires = [q('q1', [{ id: 'x1', signalKey: 'wellness.sleep_hours_weekly' }])];
    const responses = [
      resp('r2', '2026-08-10T10:00:00.000Z', [{ questionId: 'x1', value: 8 }]),
      resp('r1', '2026-08-03T10:00:00.000Z', [{ questionId: 'x1', value: 6.5 }]),
      resp('r3', '2026-08-17T10:00:00.000Z', [{ questionId: 'x1', value: 'no sé' }]), // descartado
    ];
    const serie = historialDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires);
    expect(serie).toEqual([
      { date: '2026-08-03', value: 6.5 },
      { date: '2026-08-10', value: 8 },
    ]);
  });

  it('cruza señales de distintos cuestionarios sin pisarse', () => {
    const questionnaires = [
      q('q1', [{ id: 'a', signalKey: 'wellness.sleep_hours_weekly' }]),
      q('q2', [{ id: 'b', signalKey: 'wellness.stress_weekly' }]),
    ];
    const responses = [resp('r1', '2026-08-10T10:00:00.000Z', [{ questionId: 'a', value: 7 }, { questionId: 'b', value: 4 }])];
    expect(historialDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires)).toEqual([{ date: '2026-08-10', value: 7 }]);
    expect(historialDeSeñal('wellness.stress_weekly', responses, questionnaires)).toEqual([{ date: '2026-08-10', value: 4 }]);
  });

  it('devuelve vacío si la señal no existe en ningún cuestionario', () => {
    expect(historialDeSeñal('perfil.sexo_biologico', [], [])).toEqual([]);
  });
});

describe('ultimoValorDeSeñal', () => {
  it('devuelve el valor crudo (no numérico) de la respuesta más reciente', () => {
    const questionnaires = [q('q1', [{ id: 'x1', signalKey: 'perfil.sexo_biologico' }])];
    const responses = [
      resp('r1', '2026-01-01T10:00:00.000Z', [{ questionId: 'x1', value: 'Mujer' }]),
      resp('r2', '2026-06-01T10:00:00.000Z', [{ questionId: 'x1', value: 'Hombre' }]),
    ];
    expect(ultimoValorDeSeñal('perfil.sexo_biologico', responses, questionnaires)).toBe('Hombre');
  });

  it('devuelve undefined si nunca se respondió esa señal', () => {
    expect(ultimoValorDeSeñal('perfil.sexo_biologico', [], [])).toBeUndefined();
  });
});
