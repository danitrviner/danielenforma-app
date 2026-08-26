import { describe, expect, it } from 'vitest';
import { estadoMDC, mdcDeMetrica } from './mdc';

describe('mdcDeMetrica', () => {
  it('clasifica tronco y extremidad con sus umbrales', () => {
    expect(mdcDeMetrica('cintura')).toBe(1.5);
    expect(mdcDeMetrica('biceps_der_relajado')).toBe(1.0);
  });

  it('bodyweight/altura no tienen MDC (fuera del protocolo de perímetros)', () => {
    expect(mdcDeMetrica('bodyweight')).toBeNull();
    expect(mdcDeMetrica('altura')).toBeNull();
  });
});

describe('estadoMDC', () => {
  it('un delta por debajo del umbral es "estable", aunque no sea cero', () => {
    expect(estadoMDC(0.4, 'cintura')).toBe('estable'); // umbral 1.5
    expect(estadoMDC(-0.9, 'biceps_der_relajado')).toBe('estable'); // umbral 1.0
  });

  it('un delta que supera el umbral sube o baja según el signo', () => {
    expect(estadoMDC(2, 'cintura')).toBe('sube');
    expect(estadoMDC(-2, 'cintura')).toBe('baja');
  });

  it('exactamente en el umbral YA cuenta como cambio real (convención: estable solo por debajo)', () => {
    expect(estadoMDC(1.5, 'cintura')).toBe('sube');
    expect(estadoMDC(1.49, 'cintura')).toBe('estable');
  });

  it('sin categoría conocida (bodyweight) siempre es estable', () => {
    expect(estadoMDC(5, 'bodyweight')).toBe('estable');
  });
});
