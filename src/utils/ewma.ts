import { DataPoint } from './seriesCorrelation';

// Media Móvil Exponencialmente Ponderada — suaviza series de cadencia alta
// (e1RM por sesión, sueño/estrés semanal) sin el retraso de una media móvil
// simple y sin necesitar el historial mínimo (15-25 puntos) que exigiría una
// carta de control I-MR. λ=0.3 por defecto: 30% de peso al dato de hoy, 70%
// de inercia del histórico — decisión de Dani tras comparar alternativas.
export function computeEWMA(points: DataPoint[], lambda = 0.3): DataPoint[] {
  if (points.length === 0) return [];
  const out: DataPoint[] = [{ date: points[0].date, value: points[0].value }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[i - 1].value;
    const value = Math.round((lambda * points[i].value + (1 - lambda) * prev) * 100) / 100;
    out.push({ date: points[i].date, value });
  }
  return out;
}
