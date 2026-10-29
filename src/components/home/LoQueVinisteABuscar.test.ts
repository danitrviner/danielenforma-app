import { describe, it, expect } from 'vitest';
import { antesAhora } from './LoQueVinisteABuscar';

const HOY = '2026-10-29';
const pesos = (desde: string, n: number, inicial: number, paso: number) =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${desde}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10), weight: Math.round((inicial + i * paso) * 10) / 10 }));

describe('antesAhora', () => {
  it('empezaste = primer pesaje, ahora = mediana de los últimos 7 días, faltan hasta la meta', () => {
    const r = antesAhora(pesos('2026-09-30', 30, 84, -0.1), 79, 'deficit', HOY);
    expect(r.empezaste).toBe(84);
    expect(r.ahora).toBe(81.4);
    expect(r.cambio).toBe(-2.6);
    expect(r.faltan).toBe(2.4);
  });
  it('en volumen lo que falta es hacia arriba, y sin pesos no hay nada', () => {
    expect(antesAhora(pesos('2026-10-20', 10, 70, 0.05), 72, 'volumen', HOY).faltan).toBe(1.7);
    expect(antesAhora([], 72, 'volumen', HOY)).toEqual({ empezaste: null, ahora: null, meta: 72, faltan: null, cambio: null });
  });
});
