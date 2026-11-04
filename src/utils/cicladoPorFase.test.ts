import { describe, it, expect } from 'vitest';
import type { NutritionPhase, NutritionProgram } from '../types';
import { diaAltoYBajo, gramosDelCiclado, entrenosDeLaSemana, usaCiclado } from './semanasNutricion';

const fase = (extra: Partial<NutritionPhase> = {}): NutritionPhase => ({ id: 'f1', name: 'Definición', weeks: 4, dietId: 'd', ...extra });
const programa = (fases: NutritionPhase[], extra: Partial<NutritionProgram> = {}) =>
  ({ id: 'p', athleteId: 'a', startDate: '2026-11-02', phases: fases, ...extra }) as unknown as NutritionProgram;

describe('días altos y bajos de hidratos por fase', () => {
  it('la media de la semana no cambia', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const d = diaAltoYBajo(60, n)!;
      expect(Math.abs(d.altoG * n + d.bajoG * (7 - n))).toBeLessThanOrEqual(3); // solo el redondeo del gramo
    }
    expect(diaAltoYBajo(60, 4)).toEqual({ altoG: 60, bajoG: -80 });
  });

  it('sin entrenos o entrenando los siete días no hay ciclado', () => {
    expect(diaAltoYBajo(60, 0)).toBeNull();
    expect(diaAltoYBajo(60, 7)).toBeNull();
  });

  it('usa los entrenos reales de la semana; sin ellos, los previstos', () => {
    const p = programa([fase({ ciclado: { altoG: 60, diasEntreno: 4 } })]);
    expect(gramosDelCiclado(p, 1, true)).toBe(60);
    expect(gramosDelCiclado(p, 1, false)).toBe(-80);
    expect(gramosDelCiclado(p, 1, false, 3)).toBe(-45);
    expect(gramosDelCiclado(p, 1, undefined)).toBe(0);
  });

  it('solo en las semanas de su fase, y gana al ciclado del programa', () => {
    const p = programa([fase({ weeks: 2, ciclado: { altoG: 60, diasEntreno: 4 } }), fase({ id: 'f2', weeks: 2 })],
      { ciclado: { desde: 1, entreno: 0, descanso: 0, entrenoG: 25, descansoG: -10 } });
    expect(gramosDelCiclado(p, 2, true)).toBe(60);
    expect(gramosDelCiclado(p, 3, true)).toBe(25);
    expect(usaCiclado(programa([fase()]))).toBe(false);
    expect(usaCiclado(p)).toBe(true);
  });

  it('cuenta los entrenos de la semana del programa', () => {
    const p = programa([fase()]);
    const con = new Set(['2026-11-02', '2026-11-04', '2026-11-06']);
    expect(entrenosDeLaSemana(p, '2026-11-05', f => con.has(f))).toBe(3);
    expect(entrenosDeLaSemana(p, '2026-11-05', () => undefined)).toBeUndefined();
  });
});
