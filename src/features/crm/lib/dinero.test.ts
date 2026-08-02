import { describe, it, expect } from 'vitest';
import { parseEurosACents, centsAInputEuros, formatEuros, sumaCents, repartirEnCuotas } from './dinero';

describe('parseEurosACents', () => {
  it('acepta coma y punto decimal', () => {
    expect(parseEurosACents('49,90')).toBe(4990);
    expect(parseEurosACents('49.90')).toBe(4990);
  });

  it('acepta separador de miles con decimal', () => {
    expect(parseEurosACents('1.234,56')).toBe(123456);
    expect(parseEurosACents('1,234.56')).toBe(123456);
  });

  it('tolera el símbolo de euro y espacios', () => {
    expect(parseEurosACents(' 149,90 € ')).toBe(14990);
  });

  it('no pierde el céntimo por el error de coma flotante', () => {
    // 49.90 * 100 en JS da 4989.999999999999; sin Math.round esto sería 4989.
    expect(parseEurosACents('49,90')).toBe(4990);
    expect(parseEurosACents('0,29')).toBe(29);
    expect(parseEurosACents('1,15')).toBe(115);
  });

  it('devuelve null cuando no hay número', () => {
    expect(parseEurosACents('')).toBeNull();
    expect(parseEurosACents('gratis')).toBeNull();
  });

  it('ida y vuelta estable', () => {
    for (const cents of [0, 29, 4990, 123456, 999999]) {
      expect(parseEurosACents(centsAInputEuros(cents))).toBe(cents);
    }
  });
});

describe('formatEuros', () => {
  it('siempre con dos decimales', () => {
    expect(formatEuros(4990)).toContain('49,90');
    expect(formatEuros(0)).toContain('0,00');
  });
});

describe('sumaCents', () => {
  it('suma sin error de precisión', () => {
    const pagos = Array.from({ length: 30 }, () => ({ importeCents: 4990 }));
    expect(sumaCents(pagos)).toBe(149700);
  });
});

describe('repartirEnCuotas', () => {
  it('reparte exacto cuando la división es entera', () => {
    expect(repartirEnCuotas(98700, 3)).toEqual([32900, 32900, 32900]);
  });

  it('nunca pierde ni gana un céntimo — la última cuota absorbe el resto', () => {
    // 100 entre 3 = 33,33... — sin esto se perdería 1 céntimo o se inventaría uno.
    const cuotas = repartirEnCuotas(100, 3);
    expect(cuotas).toEqual([33, 33, 34]);
    expect(cuotas.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('un caso real: 987€ en 3 cuotas', () => {
    const cuotas = repartirEnCuotas(98700, 3);
    expect(cuotas.reduce((a, b) => a + b, 0)).toBe(98700);
  });

  it('1 cuota devuelve el importe completo', () => {
    expect(repartirEnCuotas(4990, 1)).toEqual([4990]);
  });

  it('cuotas <= 0 se trata como 1', () => {
    expect(repartirEnCuotas(4990, 0)).toEqual([4990]);
  });
});
