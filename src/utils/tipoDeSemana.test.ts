import { describe, expect, it } from 'vitest';
import { tipoDeSemana, esSemanaPuente, esVueltaDeParon } from './tipoDeSemana';

describe('tipoDeSemana', () => {
  it('semana normal o sin mesociclo: null', () => {
    expect(tipoDeSemana(undefined, 3)).toBeNull();
    expect(tipoDeSemana({}, 3)).toBeNull();
    expect(tipoDeSemana({ semanasDescarga: [5], semanasPivot: [4], vuelveDeParon: true }, 3)).toBeNull();
  });

  it('descarga, puente y vuelta de parón, cada una en su semana', () => {
    const meso = { semanasDescarga: [5], semanasPivot: [4], vuelveDeParon: true };
    expect(tipoDeSemana(meso, 5)).toBe('descarga');
    expect(tipoDeSemana(meso, 4)).toBe('puente');
    expect(tipoDeSemana(meso, 1)).toBe('paron');
  });

  it('el parón solo es la semana 1, y solo si el bloque vuelve de un parón', () => {
    expect(esVueltaDeParon({ vuelveDeParon: true }, 2)).toBe(false);
    expect(esVueltaDeParon({}, 1)).toBe(false);
  });

  it('si coinciden, manda la que más recorta: descarga, luego puente, luego parón', () => {
    expect(tipoDeSemana({ semanasDescarga: [4], semanasPivot: [4] }, 4)).toBe('descarga');
    expect(esSemanaPuente({ semanasDescarga: [4], semanasPivot: [4] }, 4)).toBe(false);
    expect(tipoDeSemana({ semanasPivot: [1], vuelveDeParon: true }, 1)).toBe('puente');
  });
});
