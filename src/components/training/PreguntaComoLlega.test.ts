import { describe, it, expect } from 'vitest';
import { tramoDeNota } from './PreguntaComoLlega';

describe('«¿cómo llegas hoy?» en escala de 1 a 10', () => {
  it('guarda el tramo que ya leen la revisión y el resto: 1-4 justo, 5-7 normal, 8-10 con energía', () => {
    expect([1, 2, 3, 4].map(tramoDeNota)).toEqual(['justo', 'justo', 'justo', 'justo']);
    expect([5, 6, 7].map(tramoDeNota)).toEqual(['normal', 'normal', 'normal']);
    expect([8, 9, 10].map(tramoDeNota)).toEqual(['bien', 'bien', 'bien']);
  });
});
