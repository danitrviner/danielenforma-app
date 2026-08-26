import { describe, expect, it } from 'vitest';
import { Questionnaire, QuestionnaireResponse } from '../types';
import { leerAntiguedadAnios, leerSexo, nivelExperienciaDe, umbralProgresoEsperadoPct } from './athleteProfileSignals';

const q = (id: string, questions: { id: string; signalKey?: string }[]): Questionnaire => ({
  id, ownerId: 'coach', title: 't', questions: questions.map(p => ({ ...p, label: '', type: 'choice', required: false })),
});
const resp = (submittedAt: string, answers: { questionId: string; value: string | number | boolean }[]): QuestionnaireResponse => ({
  id: `r-${submittedAt}`, questionnaireId: 'q1', assignmentId: 'as', athleteId: 'a@b.c', submittedAt, answers,
});

describe('leerSexo', () => {
  const questionnaires = [q('q1', [{ id: 'x', signalKey: 'perfil.sexo_biologico' }])];

  it('lee "Hombre"/"Mujer" y los normaliza a minúsculas', () => {
    expect(leerSexo([resp('2026-01-01T10:00:00.000Z', [{ questionId: 'x', value: 'Hombre' }])], questionnaires)).toBe('hombre');
    expect(leerSexo([resp('2026-01-01T10:00:00.000Z', [{ questionId: 'x', value: 'Mujer' }])], questionnaires)).toBe('mujer');
  });

  it('sin respuesta, null', () => {
    expect(leerSexo([], questionnaires)).toBeNull();
  });

  it('un valor inesperado (dato corrupto/otra opción) da null, no se adivina', () => {
    expect(leerSexo([resp('2026-01-01T10:00:00.000Z', [{ questionId: 'x', value: 'Otro' }])], questionnaires)).toBeNull();
  });
});

describe('leerAntiguedadAnios', () => {
  const questionnaires = [q('q1', [{ id: 'y', signalKey: 'perfil.antiguedad_entrenamiento_anios' }])];

  it('lee el número de años', () => {
    expect(leerAntiguedadAnios([resp('2026-01-01T10:00:00.000Z', [{ questionId: 'y', value: 4 }])], questionnaires)).toBe(4);
  });

  it('sin respuesta, null', () => {
    expect(leerAntiguedadAnios([], questionnaires)).toBeNull();
  });
});

describe('nivelExperienciaDe', () => {
  it('clasifica novato/intermedio/avanzado por antigüedad, con los bordes exactos', () => {
    expect(nivelExperienciaDe(0.5)).toBe('novato');
    expect(nivelExperienciaDe(0.99)).toBe('novato');
    expect(nivelExperienciaDe(1)).toBe('intermedio');
    expect(nivelExperienciaDe(3)).toBe('intermedio');
    expect(nivelExperienciaDe(3.01)).toBe('avanzado');
    expect(nivelExperienciaDe(10)).toBe('avanzado');
  });
});

describe('umbralProgresoEsperadoPct', () => {
  it('decrece con la experiencia', () => {
    expect(umbralProgresoEsperadoPct('novato')).toBe(5);
    expect(umbralProgresoEsperadoPct('intermedio')).toBe(2.5);
    expect(umbralProgresoEsperadoPct('avanzado')).toBe(1);
  });
});
