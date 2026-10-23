import { describe, it, expect } from 'vitest';
import { pasosDeCuestionario } from './pasosDeCuestionario';
import type { QuestionnaireQuestion } from '../types';

const q = (type: QuestionnaireQuestion['type']): QuestionnaireQuestion => ({ id: Math.random().toString(), label: 'x', type, required: false });

describe('pasosDeCuestionario', () => {
  it('escalas, texto y opciones van de una en una', () => {
    expect(pasosDeCuestionario([q('scale'), q('text'), q('choice'), q('boolean'), q('media')])).toEqual([[0], [1], [2], [3], [4]]);
  });
  it('agrupa numéricas y medidas contiguas de hasta tres', () => {
    const p = [q('scale'), q('metric'), q('metric'), q('numeric'), q('metric'), q('text')];
    expect(pasosDeCuestionario(p)).toEqual([[0], [1, 2, 3], [4], [5]]);
  });
  it('una sencilla entre dos de otro tipo no se junta con nada', () => {
    expect(pasosDeCuestionario([q('scale'), q('numeric'), q('scale')])).toEqual([[0], [1], [2]]);
  });
  it('sin preguntas no hay pantallas', () => {
    expect(pasosDeCuestionario([])).toEqual([]);
  });
});
