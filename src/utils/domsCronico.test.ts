import { describe, expect, it } from 'vitest';
import { Questionnaire, QuestionnaireResponse } from '../types';
import { domsCronicoDeGrupo, domsCronicoGlobal, esDomsCronico } from './domsCronico';

const q = (): Questionnaire => ({
  id: 'q1', ownerId: 'coach', title: 'DOMS',
  questions: [
    { id: 'q_pecho', label: '', type: 'scale', required: false, signalKey: 'doms.pecho' },
    { id: 'q_dorsal', label: '', type: 'scale', required: false, signalKey: 'doms.dorsal' },
  ],
});
const resp = (submittedAt: string, questionId: string, value: number): QuestionnaireResponse => ({
  id: `r-${submittedAt}-${questionId}`, questionnaireId: 'q1', assignmentId: 'as', athleteId: 'a@b.c', submittedAt,
  answers: [{ questionId, value }],
});

describe('domsCronicoDeGrupo', () => {
  it('con menos de 3 lecturas, null (dato insuficiente)', () => {
    const responses = [resp('2026-08-01T10:00:00.000Z', 'q_pecho', 8), resp('2026-08-15T10:00:00.000Z', 'q_pecho', 7)];
    expect(domsCronicoDeGrupo('pecho', responses, [q()])).toBeNull();
  });

  it('con exactamente 3 lecturas, media de las últimas 3', () => {
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'q_pecho', 2), // fuera de la ventana de las últimas 3
      resp('2026-08-15T10:00:00.000Z', 'q_pecho', 8),
      resp('2026-08-29T10:00:00.000Z', 'q_pecho', 7),
      resp('2026-09-12T10:00:00.000Z', 'q_pecho', 6),
    ];
    expect(domsCronicoDeGrupo('pecho', responses, [q()])).toBe(7); // (8+7+6)/3
  });

  it('un grupo sin ninguna lectura da null', () => {
    expect(domsCronicoDeGrupo('gemelo', [], [q()])).toBeNull();
  });
});

describe('esDomsCronico', () => {
  it('true a partir de 6/10 sostenido, false por debajo, null pasa a false', () => {
    expect(esDomsCronico(6)).toBe(true);
    expect(esDomsCronico(5.9)).toBe(false);
    expect(esDomsCronico(null)).toBe(false);
  });
});

describe('domsCronicoGlobal', () => {
  it('media solo sobre los grupos que sí tienen N lecturas', () => {
    const responses = [
      resp('2026-08-01T10:00:00.000Z', 'q_pecho', 8),
      resp('2026-08-15T10:00:00.000Z', 'q_pecho', 8),
      resp('2026-08-29T10:00:00.000Z', 'q_pecho', 8),
      // dorsal solo tiene 1 lectura, no cuenta
      resp('2026-08-29T10:00:00.000Z', 'q_dorsal', 2),
    ];
    expect(domsCronicoGlobal(responses, [q()])).toBe(8);
  });

  it('sin ningún grupo con datos suficientes, null', () => {
    expect(domsCronicoGlobal([], [q()])).toBeNull();
  });
});
