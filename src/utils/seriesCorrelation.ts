// Motor de correlaciones entre series de fecha/valor, extraído de
// CorrelationPanel.tsx (donde vivía inline) para poder testearlo y para
// arreglar un bug real: `pearson()` emparejaba SOLO por fecha exacta, así
// que una serie semanal (cuestionario) contra una diaria (tonelaje de
// entreno) casi siempre daba "datos insuficientes" — el panel de
// correlaciones era, en la práctica, inservible. La solución: agregar ambas
// series a la misma granularidad (normalmente semanal) antes de correlacionar.

export interface DataPoint { date: string; value: number }
export type Aggregation = 'sum' | 'avg';
export type Granularity = 'day' | 'week';

// Lunes de la semana ISO a la que pertenece dateStr — unificado (antes vivía
// duplicado en CorrelationPanel.tsx y QuestionnaireChartsPanel.tsx).
export function weekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().split('T')[0];
}

export function toWeeklyBuckets(points: DataPoint[], agg: Aggregation): DataPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const p of points) {
    const wk = weekKey(p.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(p.value);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      value: agg === 'sum'
        ? Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100
        : Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
    }));
}

export interface PearsonResult { r: number; n: number }

// Pearson entre dos series ya alineadas a la misma granularidad (mismo
// formato de `date` en ambas) — empareja por fecha exacta, que es correcto
// una vez ambas series están en la misma resolución.
export function pearsonOnPoints(a: DataPoint[], b: DataPoint[]): PearsonResult | null {
  const dateSet = new Set(a.map(p => p.date));
  const common = b.filter(p => dateSet.has(p.date));
  const aAligned = common.map(p => a.find(x => x.date === p.date)!.value);
  const bAligned = common.map(p => p.value);
  const n = aAligned.length;
  if (n < 3) return null;
  const meanA = aAligned.reduce((s, v) => s + v, 0) / n;
  const meanB = bAligned.reduce((s, v) => s + v, 0) / n;
  const num = aAligned.reduce((s, v, i) => s + (v - meanA) * (bAligned[i] - meanB), 0);
  const denA = Math.sqrt(aAligned.reduce((s, v) => s + (v - meanA) ** 2, 0));
  const denB = Math.sqrt(bAligned.reduce((s, v) => s + (v - meanB) ** 2, 0));
  if (denA === 0 || denB === 0) return null;
  return { r: num / (denA * denB), n };
}

// Punto de entrada de alto nivel: agrega ambas series (con su semántica de
// agregación propia — tonelaje/pasos suman, peso/escalas/1RM/medidas
// promedian) a la granularidad pedida y calcula Pearson. A granularidad
// 'day' no se agrega nada — se comporta como el pearson() original.
export function pearsonAligned(
  a: DataPoint[], aAgg: Aggregation,
  b: DataPoint[], bAgg: Aggregation,
  granularity: Granularity,
): PearsonResult | null {
  if (granularity === 'day') return pearsonOnPoints(a, b);
  return pearsonOnPoints(toWeeklyBuckets(a, aAgg), toWeeklyBuckets(b, bAgg));
}
