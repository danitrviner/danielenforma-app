// Progreso de la fase actual del plan. La app solo INFORMA del avance de las
// métricas objetivo — el paso de fase lo decide el coach (fases por progresión,
// no por tiempo, según la metodología del asesoramiento).

import { PlanPhase, PhaseMetricTarget, DietCompletionLog, Diet } from '../types';
import { addDays } from './trainingWeek';
import { LadderData } from './levelLadder';
import { lastBodyweight, firstBodyweight, bestSet, exerciseIdsMatching, avgSteps, dailyDietPcts } from './athleteMetrics';

export interface PhaseData extends LadderData {
  completionLogs: DietCompletionLog[];
  coachDiets: Diet[];
}

export interface PhaseMetricStatus {
  metric: PhaseMetricTarget;
  currentValue?: number;
  pct: number;      // 0-100
  done: boolean;
}

export interface PhaseProgress {
  metrics: PhaseMetricStatus[];
  overallPct: number;   // media de las métricas (0-100)
}

function evaluatePhaseMetric(m: PhaseMetricTarget, data: PhaseData): PhaseMetricStatus {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const target = m.targetValue ?? 0;
  switch (m.kind) {
    case 'peso': {
      // Objetivo de llegar a X kg: la barra mide el tramo peso inicial → target.
      const start = data.initialWeight ?? firstBodyweight(data.bodyweightLogs)?.weight;
      const last = lastBodyweight(data.bodyweightLogs)?.weight;
      if (start == null || last == null || target <= 0) return { metric: m, currentValue: last, pct: 0, done: false };
      const losing = target <= start;
      const done = losing ? last <= target : last >= target;
      const span = Math.abs(start - target);
      const moved = losing ? start - last : last - start;
      return { metric: m, currentValue: last, pct: span > 0 ? clamp((moved / span) * 100) : (done ? 100 : 0), done };
    }
    case 'peso_perdido': {
      const start = data.initialWeight ?? firstBodyweight(data.bodyweightLogs)?.weight;
      const last = lastBodyweight(data.bodyweightLogs)?.weight;
      const lost = start != null && last != null ? start - last : 0;
      return { metric: m, currentValue: Math.round(lost * 10) / 10, pct: target > 0 ? clamp((lost / target) * 100) : 0, done: target > 0 && lost >= target };
    }
    case 'sentadilla_xbw': {
      const ids = exerciseIdsMatching(data.exercises, 'sentadilla');
      const best = bestSet(data.workoutLogs, { exerciseIds: ids });
      const bw = lastBodyweight(data.bodyweightLogs)?.weight;
      const ratio = best && bw ? best.e1rm / bw : 0;
      return { metric: m, currentValue: Math.round(ratio * 100) / 100, pct: target > 0 ? clamp((ratio / target) * 100) : 0, done: target > 0 && ratio >= target };
    }
    case 'pasos_media': {
      const { avg } = avgSteps(data.stepLogs, addDays(data.today, -28), data.today);
      return { metric: m, currentValue: Math.round(avg), pct: target > 0 ? clamp((avg / target) * 100) : 0, done: target > 0 && avg >= target };
    }
    case 'adherencia': {
      const { avg } = dailyDietPcts(data.completionLogs, data.coachDiets, addDays(data.today, -28), data.today);
      return { metric: m, currentValue: Math.round(avg), pct: target > 0 ? clamp((avg / target) * 100) : 0, done: target > 0 && avg >= target };
    }
    case 'manual':
      return { metric: m, pct: m.manualDone ? 100 : 0, done: m.manualDone === true };
  }
}

export function computePhaseProgress(phase: PlanPhase, data: PhaseData): PhaseProgress {
  const metrics = phase.metrics.map(m => evaluatePhaseMetric(m, data));
  const overallPct = metrics.length === 0
    ? 0
    : Math.round(metrics.reduce((s, m) => s + m.pct, 0) / metrics.length);
  return { metrics, overallPct };
}

export function currentPhase(phases: PlanPhase[] | undefined): PlanPhase | null {
  if (!phases || phases.length === 0) return null;
  return phases.find(p => p.status === 'actual')
    ?? [...phases].sort((a, b) => a.order - b.order).find(p => p.status !== 'completada')
    ?? null;
}
