import { describe, expect, it } from 'vitest';
import { lineaDeContexto } from './WeeklyChallengeCard';

describe('línea de contexto del reto', () => {
  const base = { bloque: 'Hipertrofia 1', semana: 2, semanas: 9 };

  it('sin contexto no hay línea', () => {
    expect(lineaDeContexto({})).toBeNull();
  });

  it('bloque y semana, y el tipo de semana si lo hay', () => {
    expect(lineaDeContexto({ contexto: base })).toBe('Hipertrofia 1 · semana 2 de 9');
    expect(lineaDeContexto({ contexto: { ...base, tipoSemana: 'puente' } })).toBe('Hipertrofia 1 · semana 2 de 9 · semana puente');
  });

  it('17-11-2026: un reto de una zona con estrella dice que va con el objetivo del bloque', () => {
    expect(lineaDeContexto({ contexto: { ...base, conObjetivo: true } }))
      .toBe('Hipertrofia 1 · semana 2 de 9 · va con tu objetivo del bloque');
  });
});
