import { describe, it, expect } from 'vitest';
import { addDays } from './trainingWeek';
import { NutritionProgram } from '../types';
import { historialDeObjetivos } from './historialObjetivos';

const pesosDiarios = (desde: string, n: number, f: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(desde, i), weight: f(i) }));

describe('historialDeObjetivos', () => {
  const program: NutritionProgram = {
    athleteId: 'a', startDate: '2026-06-01',
    phases: [
      { id: 'a', name: 'Déficit', weeks: 8, dietId: '', objetivo: 'deficit' },
      { id: 'b', name: 'Mantener', weeks: 4, dietId: '', objetivo: 'mantenimiento' },
      { id: 'c', name: 'Bloque 3', weeks: 8, dietId: '' },
      { id: 'd', name: 'Futura', weeks: 4, dietId: '', objetivo: 'volumen' },
    ],
  };
  const hoy = '2026-09-02'; // semana 2 de «Volumen» (empieza 24-08)
  const r = historialDeObjetivos({ program, hoy, pesos: pesosDiarios('2026-06-01', 94, i => 80 - i * 0.05) });

  it('un tramo por fase empezada, la futura fuera, solo la última en curso', () => {
    expect(r.tramos.map(t => t.nombre)).toEqual(['Déficit', 'Mantener', 'Bloque 3']);
    expect(r.tramos.map(t => t.enCurso)).toEqual([false, false, true]);
  });
  it('fechas únicas y ordenadas, sin puntos de la semana siguiente en fases cerradas', () => {
    const fechas = r.puntos.map(p => p.fecha);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect([...fechas].sort()).toEqual(fechas);
    expect(r.puntos.filter(p => p.faseIdx === 0).every(p => p.fecha <= '2026-07-26')).toBe(true);
  });
  it('fase sin objetivo marcado ni kcal: peso sí, franja no', () => {
    const volumen = r.puntos.filter(p => p.faseIdx === 2);
    expect(volumen.some(p => p.real != null)).toBe(true);
    expect(volumen.every(p => p.franja == null)).toBe(true);
    expect(r.tramos[2].objetivo).toBeNull();
  });
  it('recorta a las últimas N semanas', () => {
    const corto = historialDeObjetivos({ program, hoy, pesos: pesosDiarios('2026-06-01', 94, () => 80), semanas: 4 });
    expect(corto.tramos.map(t => t.nombre)).toEqual(['Mantener', 'Bloque 3']);
  });
});

describe('plan fijo de la fase (maqueta D)', () => {
  it('va del peso de inicio al objetivo del coach, no persigue al peso', () => {
    const program: NutritionProgram = {
      athleteId: 'a', startDate: '2026-09-01',
      phases: [{ id: 'a', name: 'Definición', weeks: 12, dietId: '', objetivo: 'deficit', targetWeight: 76.5 }],
    };
    // Sube de peso en plena definición: antes la franja subía con él.
    const r = historialDeObjetivos({ program, hoy: '2026-10-13', pesos: pesosDiarios('2026-09-01', 43, i => 81 + i * 0.07) });
    const planes = r.puntos.map(p => p.plan).filter((n): n is number => n != null);
    expect(planes[0]).toBeGreaterThan(80.5);
    expect(planes.every((v, i) => i === 0 || v <= planes[i - 1])).toBe(true);
    expect(r.puntos.at(-1)!.fecha).toBe('2026-11-23');
    expect(r.puntos.at(-1)!.plan).toBe(76.5);
    expect(r.tramos[0].pesoObjetivo).toBe(76.5);
    const ultimaLectura = [...r.puntos].reverse().find(p => p.tendencia != null)!;
    expect(ultimaLectura.tendencia!).toBeGreaterThan(ultimaLectura.franjaPlan![1]);
  });
});
