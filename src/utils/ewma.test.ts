import { describe, expect, it } from 'vitest';
import { computeEWMA } from './ewma';

describe('computeEWMA', () => {
  it('serie vacía devuelve vacío', () => {
    expect(computeEWMA([])).toEqual([]);
  });

  it('serie constante da EWMA constante', () => {
    const pts = [{ date: '2026-08-01', value: 5 }, { date: '2026-08-08', value: 5 }, { date: '2026-08-15', value: 5 }];
    expect(computeEWMA(pts).map(p => p.value)).toEqual([5, 5, 5]);
  });

  it('lambda=1 devuelve la serie original sin suavizar', () => {
    const pts = [{ date: '2026-08-01', value: 5 }, { date: '2026-08-08', value: 9 }];
    expect(computeEWMA(pts, 1).map(p => p.value)).toEqual([5, 9]);
  });

  it('amortigua un outlier sin seguirlo al 100%', () => {
    const pts = [
      { date: '2026-08-01', value: 100 },
      { date: '2026-08-08', value: 100 },
      { date: '2026-08-15', value: 40 }, // mal día aislado
    ];
    const ewma = computeEWMA(pts, 0.3);
    // EWMA_3 = 0.3*40 + 0.7*100 = 82 — cae, pero mucho menos que el dato crudo (40)
    expect(ewma[2].value).toBe(82);
    expect(ewma[2].value).toBeGreaterThan(pts[2].value);
  });

  it('conserva la fecha de cada punto', () => {
    const pts = [{ date: '2026-08-01', value: 1 }, { date: '2026-08-08', value: 2 }];
    expect(computeEWMA(pts).map(p => p.date)).toEqual(['2026-08-01', '2026-08-08']);
  });
});
