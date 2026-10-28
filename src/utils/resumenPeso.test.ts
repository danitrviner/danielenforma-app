import { describe, it, expect } from 'vitest';
import { resumenPeso, cambiosPorTramo } from './resumenPeso';

const p = (date: string, value: number, avg?: number) => ({ date, value, avg });

describe('resumenPeso', () => {
  it('cambio, ritmo semanal, media y extremos del rango', () => {
    const r = resumenPeso([p('2026-10-15', 83.4), p('2026-10-22', 82.9), p('2026-10-29', 82.3)])!;
    expect(r).toMatchObject({ cambio: -1.1, dias: 14, ritmoSemana: -0.55, media: 82.9, min: 82.3, max: 83.4 });
  });
  it('sin ritmo con menos de una semana, y nada con un solo punto', () => {
    expect(resumenPeso([p('2026-10-27', 83), p('2026-10-29', 82.5)])!.ritmoSemana).toBeNull();
    expect(resumenPeso([p('2026-10-27', 83)])).toBeNull();
  });
});

describe('cambiosPorTramo', () => {
  it('por semana: cierre de la media contra el cierre de la semana anterior', () => {
    const c = cambiosPorTramo([
      p('2026-10-13', 84, 84), p('2026-10-18', 83.6, 83.5),   // semana del 12
      p('2026-10-21', 83.4, 83.3), p('2026-10-25', 83, 83.1), // semana del 19 → −0,4
      p('2026-10-28', 82.6, 82.8),                            // semana del 26 → −0,3
    ], 'semana');
    expect(c).toEqual([
      { etiqueta: '12 oct', cambio: -0.5 },
      { etiqueta: '19 oct', cambio: -0.4 },
      { etiqueta: '26 oct', cambio: -0.3 },
    ]);
  });
  it('por mes', () => {
    const c = cambiosPorTramo([p('2026-09-02', 80, 80), p('2026-09-30', 81, 81), p('2026-10-28', 82.5, 82.5)], 'mes');
    expect(c).toEqual([{ etiqueta: 'sep', cambio: 1 }, { etiqueta: 'oct', cambio: 1.5 }]);
  });
});
