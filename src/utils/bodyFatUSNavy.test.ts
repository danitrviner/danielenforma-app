import { describe, expect, it } from 'vitest';
import { computeIRC, masaMagraEstimadaKg, pctGrasaUSNavy } from './bodyFatUSNavy';

describe('pctGrasaUSNavy', () => {
  it('hombre: valores de referencia típicos dan un %grasa razonable (~15-25% para esta talla)', () => {
    const pct = pctGrasaUSNavy({ sexo: 'hombre', cuelloCm: 38, cinturaCm: 90, alturaCm: 180 });
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(15);
    expect(pct!).toBeLessThan(25);
  });

  it('mujer: exige caderaCm, sin ella devuelve null', () => {
    expect(pctGrasaUSNavy({ sexo: 'mujer', cuelloCm: 32, cinturaCm: 70, alturaCm: 165 })).toBeNull();
  });

  it('mujer: con cadera calcula un %grasa razonable', () => {
    const pct = pctGrasaUSNavy({ sexo: 'mujer', cuelloCm: 32, cinturaCm: 70, caderaCm: 95, alturaCm: 165 });
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(15);
    expect(pct!).toBeLessThan(35);
  });

  it('hombre: cintura <= cuello está fuera de dominio del log10, devuelve null (no NaN)', () => {
    expect(pctGrasaUSNavy({ sexo: 'hombre', cuelloCm: 40, cinturaCm: 38, alturaCm: 180 })).toBeNull();
  });

  it('mujer: cintura+cadera <= cuello está fuera de dominio, devuelve null', () => {
    expect(pctGrasaUSNavy({ sexo: 'mujer', cuelloCm: 100, cinturaCm: 30, caderaCm: 30, alturaCm: 165 })).toBeNull();
  });

  it('medidas <= 0 devuelven null', () => {
    expect(pctGrasaUSNavy({ sexo: 'hombre', cuelloCm: 0, cinturaCm: 90, alturaCm: 180 })).toBeNull();
  });
});

describe('masaMagraEstimadaKg', () => {
  it('calcula masa magra a partir de peso y %grasa', () => {
    expect(masaMagraEstimadaKg(80, 20)).toBe(64); // 80 * 0.8
  });

  it('%grasa fuera de rango [0,100) devuelve null', () => {
    expect(masaMagraEstimadaKg(80, 100)).toBeNull();
    expect(masaMagraEstimadaKg(80, -1)).toBeNull();
  });

  it('peso <= 0 devuelve null', () => {
    expect(masaMagraEstimadaKg(0, 20)).toBeNull();
  });
});

describe('computeIRC', () => {
  it('divide masa magra entre WHtR', () => {
    expect(computeIRC(64, 0.5)).toBe(128);
  });

  it('valores <= 0 devuelven null', () => {
    expect(computeIRC(0, 0.5)).toBeNull();
    expect(computeIRC(64, 0)).toBeNull();
  });
});
