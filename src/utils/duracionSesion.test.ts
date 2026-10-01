import { describe, expect, it } from 'vitest';
import { segundosTranscurridos, formatearDuracion } from './duracionSesion';

describe('segundosTranscurridos', () => {
  it('calcula lo transcurrido entre dos instantes', () => {
    expect(segundosTranscurridos(1_000, 1_000 + 65_000)).toBe(65);
  });

  it('nunca da negativo si "ahora" quedó antes del inicio (reloj desincronizado)', () => {
    expect(segundosTranscurridos(5_000, 1_000)).toBe(0);
  });

  it('redondea hacia abajo dentro del mismo segundo', () => {
    expect(segundosTranscurridos(0, 1_999)).toBe(1);
  });
});

describe('formatearDuracion', () => {
  it('usa m:ss por debajo de la hora', () => {
    expect(formatearDuracion(5)).toBe('0:05');
    expect(formatearDuracion(65)).toBe('1:05');
    expect(formatearDuracion(3_599)).toBe('59:59');
  });

  it('pasa a h:mm:ss a partir de la hora', () => {
    expect(formatearDuracion(3_600)).toBe('1:00:00');
    expect(formatearDuracion(3_725)).toBe('1:02:05');
    expect(formatearDuracion(2 * 3_600 + 5 * 60 + 9)).toBe('2:05:09');
  });

  it('nunca da negativo', () => {
    expect(formatearDuracion(-10)).toBe('0:00');
  });
});
