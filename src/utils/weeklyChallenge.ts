// Motor del reto semanal. La regla de negocio es que el atleta SIEMPRE tenga un
// reto activo: si el coach no elige una opción, se auto-genera a partir de sus
// datos (generate-on-read, sin backend — ver ensureWeeklyChallenge.ts para la
// regla del martes). El doc ID determinista `${email}_${isoWeek}` hace la
// generación idempotente aunque compitan pestañas.
//
// La generación de candidatos y su score viven en challengeOptions.ts; este
// módulo re-exporta lo que ya usaban sus consumidores y añade la evaluación de
// progreso (que no depende del origen del reto).

import { WeeklyChallenge } from '../types';
import { avgSteps, totalSteps, bestSet, dailyDietPcts, lastBodyweight } from './athleteMetrics';
import { ChallengeData, AutoChallengeInput, generateChallengeOptions, genericStepsOption, buildChallengeFromOption } from './challengeOptions';

export type { ChallengeData, AutoChallengeInput, ChallengeOption } from './challengeOptions';
export {
  isoWeekKey, isoWeekBounds, isCoachGraceDay, BASIC_LIFT_KEYWORDS, GENERIC_STEP_TARGET,
  eligibleLiftIds, nextRoundMilestone, generateChallengeOptions, buildChallengeFromOption,
} from './challengeOptions';

// Elige la opción de mayor score (o el fallback genérico de pasos si no hay
// ninguna viable) y la materializa como WeeklyChallenge con origin 'auto'.
export function generateAutoChallenge(input: AutoChallengeInput): WeeklyChallenge {
  const options = generateChallengeOptions(input);
  const best = options[0] ?? genericStepsOption();
  return buildChallengeFromOption(best, { athleteId: input.athleteId, today: input.today, origin: 'auto' });
}

// ── Evaluación de progreso ────────────────────────────────────────────────────

export interface ChallengeProgress {
  progressValue: number;   // valor actual en la unidad del reto
  pct: number;             // 0-100 respecto al target (para barras)
  achieved: boolean;
}

// Progreso 100% derivado de los datos ya registrados (pasos, series, pesajes,
// comidas) — el atleta no marca nada a mano. Para métricas de media (pasos,
// adherencia) el "conseguido" en mitad de semana exige un mínimo de días
// registrados; al cerrar la semana basta con superar el objetivo.
export function evaluateChallengeProgress(
  ch: WeeklyChallenge,
  data: ChallengeData,
  today: string,
): ChallengeProgress {
  const to = today < ch.weekEnd ? today : ch.weekEnd;
  const weekOver = today > ch.weekEnd;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  switch (ch.kind) {
    case 'pasos_media': {
      const { avg, days } = avgSteps(data.stepLogs, ch.weekStart, to);
      const achieved = avg >= ch.metric.target && (weekOver || days >= 5);
      return { progressValue: Math.round(avg), pct: clamp((avg / ch.metric.target) * 100), achieved };
    }
    case 'pasos_total': {
      const total = totalSteps(data.stepLogs, ch.weekStart, to);
      return { progressValue: total, pct: clamp((total / ch.metric.target) * 100), achieved: total >= ch.metric.target };
    }
    case 'carga_ejercicio': {
      const ids = ch.metric.exerciseId ? new Set([ch.metric.exerciseId]) : undefined;
      const best = bestSet(data.workoutLogs, { exerciseIds: ids, from: ch.weekStart, to });
      const value = best?.e1rm ?? 0;
      const baseline = ch.metric.baseline ?? 0;
      // La barra mide el tramo baseline→target, no desde 0 (sería siempre ~100%).
      const span = ch.metric.target - baseline;
      const pct = span > 0 ? clamp(((value - baseline) / span) * 100) : (value >= ch.metric.target ? 100 : 0);
      return { progressValue: value, pct, achieved: value >= ch.metric.target };
    }
    case 'peso_objetivo': {
      const logs = data.bodyweightLogs.filter(l => l.date >= ch.weekStart && l.date <= to);
      const last = lastBodyweight(logs);
      const baseline = ch.metric.baseline ?? ch.metric.target;
      const losing = ch.metric.target <= baseline;
      if (!last) return { progressValue: baseline, pct: 0, achieved: false };
      const achieved = losing ? last.weight <= ch.metric.target : last.weight >= ch.metric.target;
      const span = Math.abs(baseline - ch.metric.target);
      const moved = losing ? baseline - last.weight : last.weight - baseline;
      const pct = span > 0 ? clamp((moved / span) * 100) : (achieved ? 100 : 0);
      return { progressValue: last.weight, pct, achieved };
    }
    case 'adherencia_dieta': {
      const { avg, days } = dailyDietPcts(data.completionLogs, data.coachDiets, ch.weekStart, to);
      const achieved = avg >= ch.metric.target && (weekOver || days >= 5);
      return { progressValue: Math.round(avg), pct: clamp((avg / ch.metric.target) * 100), achieved };
    }
    case 'entrenos_completados': {
      const done = data.assignments.filter(
        a => a.date >= ch.weekStart && a.date <= ch.weekEnd && a.status === 'completed',
      ).length;
      return { progressValue: done, pct: clamp((done / ch.metric.target) * 100), achieved: done >= ch.metric.target };
    }
    case 'custom':
      // Sin métrica automática: lo resuelve el coach cambiando el status a mano.
      return { progressValue: ch.progressValue ?? 0, pct: ch.status === 'conseguido' ? 100 : 0, achieved: ch.status === 'conseguido' };
  }
}
