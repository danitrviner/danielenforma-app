import { describe, it, expect } from 'vitest';
import { CardioZones } from '../types';
import { getZoneForBpm, pctOfMaxHR, getZoneAlertDirection } from './cardioZones';

// Zonas reales de la sesión de Dani analizada en docs/FITIV-analisis-y-plan.md
// §4bis.4 (FCmax 190, Haskell & Fox): sirven de caso de referencia verificado.
const ZONES: CardioZones = {
  z1: { min: 95, max: 113 }, z2: { min: 114, max: 132 }, z3: { min: 133, max: 151 },
  z4: { min: 152, max: 170 }, z5: { min: 171, max: 999 },
};

describe('getZoneForBpm', () => {
  it('clasifica dentro de cada banda', () => {
    expect(getZoneForBpm(120, ZONES)).toBe('z2');
    expect(getZoneForBpm(180, ZONES)).toBe('z5');
  });

  it('por debajo de Z1 es null ("fuera de zona"), no un error', () => {
    expect(getZoneForBpm(70, ZONES)).toBeNull();
  });
});

describe('pctOfMaxHR', () => {
  it('trunca como FITIV, no redondea — verificado contra la captura real (131bpm/190 → 68%, no 69%)', () => {
    expect(pctOfMaxHR(131, 190)).toBe(68);
    expect(pctOfMaxHR(171, 190)).toBe(90);
  });

  it('sin FCmax configurada, no inventa un porcentaje', () => {
    expect(pctOfMaxHR(150, undefined)).toBeNull();
  });
});

describe('getZoneAlertDirection', () => {
  const targetZ2 = ZONES.z2;

  it('avisa "high" por encima del techo de la zona objetivo', () => {
    expect(getZoneAlertDirection(140, targetZ2)).toBe('high');
  });

  it('avisa "low" por debajo del suelo de la zona objetivo', () => {
    expect(getZoneAlertDirection(100, targetZ2)).toBe('low');
  });

  it('sin aviso dentro de la banda, incluidos los bordes', () => {
    expect(getZoneAlertDirection(120, targetZ2)).toBe('in');
    expect(getZoneAlertDirection(114, targetZ2)).toBe('in');
    expect(getZoneAlertDirection(132, targetZ2)).toBe('in');
  });
});
