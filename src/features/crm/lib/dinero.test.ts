import { describe, it, expect } from 'vitest';
import { parseEurosACents, centsAInputEuros, formatEuros, sumaCents, repartirEnCuotas, ingresosPorMes, variacionMensualPct } from './dinero';

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

// La única agregación mensual del CRM, y no tenía ni un test — pese a aceptar
// un `hoy` inyectable justo para poder escribirlos. Es de donde sale la cifra
// de facturación que Dani mira para saber cómo va el mes.
describe('ingresosPorMes', () => {
  const HOY = new Date(2026, 8, 10); // 10 de septiembre de 2026

  it('agrupa por la fecha de COBRO — una cuota de agosto cobrada en septiembre es de septiembre', () => {
    const serie = ingresosPorMes(
      [{ estado: 'pagado', fechaCobro: '2026-09-03', importeCents: 60000 }],
      3, HOY,
    );
    expect(serie).toEqual([
      { mes: '2026-07', totalCents: 0 },
      { mes: '2026-08', totalCents: 0 },
      { mes: '2026-09', totalCents: 60000 },
    ]);
  });

  it('un pago pendiente no es facturación, por vencido que esté', () => {
    const serie = ingresosPorMes([{ estado: 'pendiente', fechaCobro: '2026-09-01', importeCents: 60000 }], 2, HOY);
    expect(serie.at(-1)!.totalCents).toBe(0);
  });

  it('un pago cobrado sin fecha de cobro no se cuenta en ningún mes', () => {
    const serie = ingresosPorMes([{ estado: 'pagado', importeCents: 60000 }], 2, HOY);
    expect(serie.every(m => m.totalCents === 0)).toBe(true);
  });

  it('suma varios pagos del mismo mes', () => {
    const serie = ingresosPorMes([
      { estado: 'pagado', fechaCobro: '2026-09-01', importeCents: 30000 },
      { estado: 'pagado', fechaCobro: '2026-09-28', importeCents: 45000 },
    ], 2, HOY);
    expect(serie.at(-1)!.totalCents).toBe(75000);
  });

  it('un mes sin cobros sale con 0, no se omite', () => {
    expect(ingresosPorMes([], 4, HOY).map(m => m.mes))
      .toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('lo cobrado fuera de la ventana no se cuela en el primer mes', () => {
    // El histograma enseña 7 meses; lo de hace un año no puede aparecer
    // amontonado en el borde.
    const serie = ingresosPorMes([{ estado: 'pagado', fechaCobro: '2025-01-15', importeCents: 99900 }], 3, HOY);
    expect(serie.every(m => m.totalCents === 0)).toBe(true);
  });

  it('cruza el año hacia atrás sin saltarse diciembre', () => {
    const enero = new Date(2026, 0, 15);
    expect(ingresosPorMes([], 3, enero).map(m => m.mes)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('variacionMensualPct', () => {
  it('de 1.000 a 1.500 es un +50 %', () => {
    expect(variacionMensualPct([{ mes: '2026-08', totalCents: 100000 }, { mes: '2026-09', totalCents: 150000 }])).toBe(50);
  });

  it('una caída sale en negativo', () => {
    expect(variacionMensualPct([{ mes: '2026-08', totalCents: 100000 }, { mes: '2026-09', totalCents: 60000 }])).toBe(-40);
  });

  it('sin mes anterior con el que comparar, no hay porcentaje', () => {
    expect(variacionMensualPct([{ mes: '2026-09', totalCents: 100000 }])).toBeNull();
    expect(variacionMensualPct([{ mes: '2026-08', totalCents: 0 }, { mes: '2026-09', totalCents: 5000 }])).toBeNull();
  });
});
