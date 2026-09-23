import { describe, it, expect } from 'vitest';
import { NutritionProgram } from '../types';
import { historialDeObjetivos } from './historialObjetivos';

const pesosDiarios = (desde: string, n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + i);
  return { date: d.toISOString().slice(0, 10), weight: f(i) };
});

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
