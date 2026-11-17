import { describe, it, expect } from 'vitest';
import { fueraDeTemporada, mesDe, textoDeTemporada } from './temporadaDeFruta';

describe('temporada de la fruta', () => {
  it('la sandía es de verano', () => {
    expect(fueraDeTemporada('Sandía', 1)).toBe(true);
    expect(fueraDeTemporada('Sandía', 7)).toBe(false);
  });
  it('los cítricos y el kiwi son de invierno, aunque el rango cruce el año', () => {
    expect(fueraDeTemporada('Naranja', 12)).toBe(false);
    expect(fueraDeTemporada('Naranja', 2)).toBe(false);
    expect(fueraDeTemporada('Naranja', 8)).toBe(true);
    expect(fueraDeTemporada('Mandarina', 1)).toBe(false);
    expect(fueraDeTemporada('Kiwi verde', 7)).toBe(true);
  });
  it('lo que hay todo el año nunca queda fuera', () => {
    for (const mes of [1, 5, 8, 11]) {
      expect(fueraDeTemporada('Plátano', mes)).toBe(false);
      expect(fueraDeTemporada('Manzana golden', mes)).toBe(false);
      expect(fueraDeTemporada('Yogur natural', mes)).toBe(false);
    }
  });
  it('lee el nombre como se escriba', () => {
    expect(fueraDeTemporada('MELOCOTON en almibar', 1)).toBe(true);
    expect(fueraDeTemporada('melocotón', 6)).toBe(false);
  });
  it('dice la temporada en palabras', () => {
    expect(textoDeTemporada('Sandía')).toBe('De junio a septiembre');
    expect(textoDeTemporada('Naranja')).toBe('De noviembre a abril');
    expect(textoDeTemporada('Plátano')).toBe('Todo el año');
  });
  it('el mes va de 1 a 12', () => {
    expect(mesDe(new Date('2026-01-15T10:00:00'))).toBe(1);
    expect(mesDe(new Date('2026-12-01T10:00:00'))).toBe(12);
  });
});
