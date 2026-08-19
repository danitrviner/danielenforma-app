import { describe, expect, it } from 'vitest';
import { weekKey, toWeeklyBuckets, pearsonOnPoints, pearsonAligned, DataPoint } from './seriesCorrelation';

// Lunes de referencia calculado en runtime (no se asume qué día de la semana
// cae una fecha concreta — se busca el primer lunes a partir de agosto 2026).
function referenceMonday(): Date {
  const d = new Date('2026-08-01T12:00:00');
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}
// Componentes locales, no toISOString() (UTC) — ver el comentario equivalente
// en scheduleEngine.test.ts. Aquí funcionaba "por suerte" al anclar todo a
// mediodía, pero es el mismo patrón frágil; se corrige por consistencia.
function offsetDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('weekKey', () => {
  it('maps every day of an ISO week to that week\'s Monday', () => {
    const monday = referenceMonday();
    const mondayStr = offsetDate(monday, 0);
    expect(weekKey(mondayStr)).toBe(mondayStr);
    expect(weekKey(offsetDate(monday, 2))).toBe(mondayStr);  // miércoles
    expect(weekKey(offsetDate(monday, 6))).toBe(mondayStr);  // domingo
  });
});

describe('toWeeklyBuckets', () => {
  it('sums for "sum" aggregation and averages for "avg", within the same week', () => {
    const monday = referenceMonday();
    const points: DataPoint[] = [
      { date: offsetDate(monday, 0), value: 10 },
      { date: offsetDate(monday, 1), value: 20 },
      { date: offsetDate(monday, 6), value: 30 },
    ];
    const summed = toWeeklyBuckets(points, 'sum');
    expect(summed).toHaveLength(1);
    expect(summed[0].value).toBe(60);

    const averaged = toWeeklyBuckets(points, 'avg');
    expect(averaged).toHaveLength(1);
    expect(averaged[0].value).toBe(20);
  });
});

describe('pearsonOnPoints', () => {
  it('requires at least 3 common dates', () => {
    const a: DataPoint[] = [{ date: '2026-08-01', value: 1 }, { date: '2026-08-02', value: 2 }];
    const b: DataPoint[] = [{ date: '2026-08-01', value: 10 }, { date: '2026-08-02', value: 20 }];
    expect(pearsonOnPoints(a, b)).toBeNull();
  });
});

describe('pearsonAligned — the exact-date-matching bug this module fixes', () => {
  it('a weekly questionnaire series and a daily training series correlate at week granularity but not at day granularity', () => {
    const monday = referenceMonday();

    // Cuestionario: 1 respuesta cada viernes (offset 4), sube cada semana.
    const weekly: DataPoint[] = [4, 11, 18, 25].map((off, i) => ({ date: offsetDate(monday, off), value: 3 + i }));

    // Entreno: tonelaje diario los lunes y miércoles (offset 0 y 2) — nunca
    // coincide en fecha exacta con el viernes del cuestionario — sube al mismo
    // ritmo semana a semana.
    const daily: DataPoint[] = [];
    [0, 7, 14, 21].forEach((weekOff, i) => {
      [0, 2].forEach(dayOff => daily.push({ date: offsetDate(monday, weekOff + dayOff), value: 1000 + i * 200 }));
    });

    // Antes del arreglo (comparación por fecha exacta): esto es exactamente
    // lo que hacía fallar el panel de correlaciones — "datos insuficientes".
    const dayResult = pearsonAligned(weekly, 'avg', daily, 'sum', 'day');
    expect(dayResult).toBeNull();

    // Después del arreglo (agregación semanal antes de correlacionar): sí hay
    // señal — ambas series suben al mismo ritmo cada semana.
    const weekResult = pearsonAligned(weekly, 'avg', daily, 'sum', 'week');
    expect(weekResult).not.toBeNull();
    expect(weekResult!.n).toBe(4);
    expect(weekResult!.r).toBeGreaterThan(0.99);
  });
});
