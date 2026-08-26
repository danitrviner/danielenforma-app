import { describe, it, expect } from 'vitest';
import { CardioZones } from '../types';
import { getZoneForBpm, pctOfMaxHR, getZoneAlertDirection, maxHREstimada, zonesFromLthr, ZONE_ORDER } from './cardioZones';
import { defaultZonesFromAge } from '../db/cardio';

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

describe('maxHREstimada — Tanaka en vez de 220 − edad', () => {
  it('aplica 208 − 0,7 × edad', () => {
    expect(maxHREstimada(20)).toBe(194);
    expect(maxHREstimada(40)).toBe(180);
  });

  it('se separa de 220 − edad justo donde esa fórmula falla: en los mayores', () => {
    // A los 50, Haskell & Fox daba 170 y Tanaka da 173: 3 ppm que mueven las
    // cinco bandas hacia arriba. La diferencia crece con la edad.
    expect(maxHREstimada(50)).toBeGreaterThan(220 - 50);
    expect(maxHREstimada(20)).toBeLessThan(220 - 20);
  });
});

describe('zonesFromLthr — Friel', () => {
  it('reparte las bandas por porcentaje del LTHR sin solaparlas', () => {
    const z = zonesFromLthr(160);
    for (const [bajo, alto] of [[z.z1, z.z2], [z.z2, z.z3], [z.z3, z.z4], [z.z4, z.z5]]) {
      expect(bajo.max).toBeLessThan(alto.min);
    }
  });

  it('Z1 tiene suelo: con este método también existe el "fuera de zona"', () => {
    const z = zonesFromLthr(160);
    expect(z.z1.min).toBeGreaterThan(0);
    expect(getZoneForBpm(z.z1.min - 5, z)).toBeNull();
  });
});

describe('defaultZonesFromAge — Karvonen', () => {
  const z = defaultZonesFromAge(60, 190);

  it('no solapa las bandas: cada pulso pertenece a una sola zona', () => {
    for (const [bajo, alto] of [[z.z1, z.z2], [z.z2, z.z3], [z.z3, z.z4], [z.z4, z.z5]]) {
      expect(bajo.max).toBe(alto.min - 1);
    }
  });

  it('cubre de la mitad de la FC de reserva hasta la FCmax', () => {
    expect(z.z1.min).toBe(125); // 60 + 0,5 × 130
    expect(z.z5.max).toBe(190);
  });

  it('el borde exacto entre zonas cae en la zona alta, no en la baja', () => {
    expect(getZoneForBpm(z.z2.min, z)).toBe('z2');
    expect(getZoneForBpm(z.z2.max, z)).toBe('z2');
  });

  it('con FC de reposo y FCmax muy cerca, ninguna banda se invierte (min <= max)', () => {
    // 70/75: los cortes en pct 0.5-0.9 redondean casi todos al mismo ppm.
    const cercano = defaultZonesFromAge(70, 75);
    for (const zona of ZONE_ORDER) {
      expect(cercano[zona].min).toBeLessThanOrEqual(cercano[zona].max);
    }
    // Y las cinco siguen sin solaparse ni dejar huecos.
    for (const [bajo, alto] of [[cercano.z1, cercano.z2], [cercano.z2, cercano.z3], [cercano.z3, cercano.z4], [cercano.z4, cercano.z5]]) {
      expect(bajo.max).toBe(alto.min - 1);
    }
  });
});
