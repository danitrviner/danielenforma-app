import { describe, expect, it } from 'vitest';
import { chispaDe, resumirSerie } from './progressSummary';

const pts = (...vals: [string, number][]) => vals.map(([date, value]) => ({ date, value }));

describe('resumirSerie', () => {
  it('con menos de 2 puntos no hay progreso que enseñar', () => {
    expect(resumirSerie({ id: 'x', label: 'X', points: [], mejorSiSube: true })).toBeNull();
    expect(resumirSerie({ id: 'x', label: 'X', points: pts(['2026-01-01', 80]), mejorSiSube: true })).toBeNull();
  });

  it('calcula primero/último/delta/% sobre la serie ordenada por fecha', () => {
    const r = resumirSerie({
      id: 'bw', label: 'Peso', unit: 'kg', mejorSiSube: null,
      points: pts(['2026-03-01', 78], ['2026-01-01', 80], ['2026-02-01', 79]), // desordenada a propósito
    })!;
    expect(r.primero).toBe(80);
    expect(r.ultimo).toBe(78);
    expect(r.delta).toBe(-2);
    expect(r.deltaPct).toBe(-2.5);
    expect(r.desde).toBe('2026-01-01');
    expect(r.puntos).toBe(3);
  });

  it('mejorSiSube=false: bajar es mejorar (grasa, cintura)', () => {
    const r = resumirSerie({
      id: 'grasa', label: '% Grasa', mejorSiSube: false,
      points: pts(['2026-01-01', 22], ['2026-03-01', 19]),
    })!;
    expect(r.direccion).toBe('mejora');
  });

  it('mejorSiSube=true: bajar es empeorar (masa magra, adherencia)', () => {
    const r = resumirSerie({
      id: 'magra', label: 'Masa magra', mejorSiSube: true,
      points: pts(['2026-01-01', 60], ['2026-03-01', 58]),
    })!;
    expect(r.direccion).toBe('empeora');
  });

  it('mejorSiSube=null nunca juzga, aunque el cambio sea grande', () => {
    const r = resumirSerie({
      id: 'bw', label: 'Peso', mejorSiSube: null,
      points: pts(['2026-01-01', 80], ['2026-03-01', 70]),
    })!;
    expect(r.direccion).toBe('neutro');
    expect(r.delta).toBe(-10); // el cambio sí se muestra, solo no se colorea
  });

  it('un cambio por debajo del umbral de ruido es neutro', () => {
    const r = resumirSerie({
      id: 'cintura', label: 'Cintura', mejorSiSube: false, umbralRuido: 1.5,
      points: pts(['2026-01-01', 85], ['2026-03-01', 84.2]),
    })!;
    expect(r.direccion).toBe('neutro');

    const real = resumirSerie({
      id: 'cintura', label: 'Cintura', mejorSiSube: false, umbralRuido: 1.5,
      points: pts(['2026-01-01', 85], ['2026-03-01', 82]),
    })!;
    expect(real.direccion).toBe('mejora');
  });

  it('sin cambio es neutro aunque haya dirección definida', () => {
    const r = resumirSerie({
      id: 'x', label: 'X', mejorSiSube: true,
      points: pts(['2026-01-01', 50], ['2026-03-01', 50]),
    })!;
    expect(r.direccion).toBe('neutro');
    expect(r.deltaPct).toBe(0);
  });

  it('un primer valor de 0 no produce un % infinito', () => {
    const r = resumirSerie({
      id: 'x', label: 'X', mejorSiSube: true,
      points: pts(['2026-01-01', 0], ['2026-03-01', 5]),
    })!;
    expect(r.deltaPct).toBeNull();
    expect(r.delta).toBe(5);
  });

  it('el % se calcula sobre el valor absoluto del primero (IRP puede ser negativo)', () => {
    const r = resumirSerie({
      id: 'irp', label: 'IRP', mejorSiSube: true,
      points: pts(['2026-01-01', -2], ['2026-03-01', 0]),
    })!;
    expect(r.delta).toBe(2);
    expect(r.deltaPct).toBe(100); // no -100
  });
});

describe('chispaDe', () => {
  it('coge los últimos N valores, más antiguo primero', () => {
    const serie = Array.from({ length: 12 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, value: i }));
    expect(chispaDe(serie)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('con menos de N valores devuelve todos', () => {
    expect(chispaDe([{ date: '2026-01-01', value: 3 }, { date: '2026-01-02', value: 4 }])).toEqual([3, 4]);
  });
});
