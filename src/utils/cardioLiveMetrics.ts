import { CardioZones } from '../types';
import { ZONE_LABEL, BELOW_ZONE_LABEL, pctOfMaxHR } from './cardioZones';

/* Catálogo de métricas del layout Avanzado (F9 del plan de réplica FITIV,
   §4.7 del análisis). Solo entran las que hoy se pueden calcular sin GPS,
   cadencia o pasos — el resto del catálogo real de FITIV (Ritmo, Velocidad,
   Cadencia, Elevación, Pasos) queda fuera hasta que exista esa fuente de
   datos, no se inventa un valor a medias. */

export interface CardioLiveMetricCtx {
  bpm: number | null;
  avgHR?: number;
  maxHRSoFar?: number;
  maxHR?: number;
  currentZone: keyof CardioZones | null;
  elapsedSec: number;
  caloriesKcal?: number;
  caloriesActiveKcal?: number;
  mets?: number;
}

export interface CardioLiveMetric {
  key: string;
  label: string;
  format: (ctx: CardioLiveMetricCtx) => string;
}

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function fmtNum(v: number | undefined, digits = 0): string {
  if (v === undefined) return '--';
  return digits > 0 ? v.toFixed(digits).replace('.', ',') : String(Math.round(v));
}

export const CARDIO_LIVE_METRICS: CardioLiveMetric[] = [
  { key: 'bpm', label: 'FC actual', format: ctx => (ctx.bpm !== null ? String(ctx.bpm) : '--') },
  { key: 'avgHR', label: 'FC media', format: ctx => fmtNum(ctx.avgHR) },
  { key: 'maxHR', label: 'FC máxima', format: ctx => fmtNum(ctx.maxHRSoFar) },
  { key: 'zone', label: 'Zona de FC', format: ctx => (ctx.currentZone ? ZONE_LABEL[ctx.currentZone] : BELOW_ZONE_LABEL) },
  { key: 'intensity', label: 'Intensidad', format: ctx => {
    const pct = ctx.bpm !== null ? pctOfMaxHR(ctx.bpm, ctx.maxHR) : null;
    return pct !== null ? `${pct}%` : '--';
  } },
  { key: 'caloriesActive', label: 'Calorías activas', format: ctx => fmtNum(ctx.caloriesActiveKcal) },
  { key: 'caloriesTotal', label: 'Calorías totales', format: ctx => fmtNum(ctx.caloriesKcal) },
  { key: 'mets', label: 'METs', format: ctx => fmtNum(ctx.mets, 1) },
  { key: 'duration', label: 'Duración', format: ctx => fmtClock(ctx.elapsedSec) },
];

export const CARDIO_LIVE_METRIC_MAP: Record<string, CardioLiveMetric> = Object.fromEntries(
  CARDIO_LIVE_METRICS.map(m => [m.key, m])
);

export function metricByKey(key: string): CardioLiveMetric {
  return CARDIO_LIVE_METRIC_MAP[key] ?? CARDIO_LIVE_METRICS[0];
}
