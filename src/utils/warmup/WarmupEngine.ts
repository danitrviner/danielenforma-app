import { WarmupSet, WorkoutSetLog } from '../../types';
import { epley } from '../oneRepMax';
import { calculateWarmupSets } from './WarmupCalculator';
import { FALLBACK_RAMP, MAX_STEPS, MAX_TOP_FRACTION, MIN_START_FRACTION, MIN_STEPS } from './constants';
import { RampParams, WarmupFactor, WarmupResolvedContext } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Parses a WorkoutExercise.reps string ("8-10", "12", "AMRAP") down to a single number to
// anchor the warm-up rep baseline on — takes the low end of a range, a sane default for
// non-numeric prescriptions.
export function parseTargetReps(reps: string): number {
  const match = reps.match(/\d+/);
  return match ? parseInt(match[0], 10) : 8;
}

function resolveContext(targetWeight: number, targetReps: number, previousSets?: WorkoutSetLog[]): WarmupResolvedContext {
  const previousTop = (previousSets ?? []).reduce<WorkoutSetLog | null>((best, s) => {
    if (!s.weight) return best;
    return !best || s.weight > best.weight ? s : best;
  }, null);

  const estimatedE1RM = previousTop ? epley(previousTop.weight, previousTop.repsDone) || null : null;

  return {
    targetWeight,
    targetReps,
    previousTopWeight: previousTop?.weight ?? null,
    previousTopReps: previousTop?.repsDone ?? null,
    previousRir: previousTop?.rir ?? null,
    estimatedE1RM,
  };
}

// ── Factors ──────────────────────────────────────────────────────────────────────────
// Each factor nudges the ramp shape from one independent signal. Adding a new input to
// the algorithm (fatigue, time of day, exercise type...) means adding a new factor to
// FACTORS below — the calculator and the rest of the pipeline never need to change.

// How hard is today's target relative to the athlete's estimated capacity? A near-max
// day warrants a longer, more gradual ramp (more neuromuscular preparation); a clearly
// sub-maximal day needs less of it.
const intensityFactor: WarmupFactor = (params, ctx) => {
  if (!ctx.estimatedE1RM) return params;
  const intensityRatio = ctx.targetWeight / ctx.estimatedE1RM;
  if (intensityRatio >= 0.9) {
    return { ...params, numSteps: params.numSteps + 1, topFraction: Math.min(MAX_TOP_FRACTION, params.topFraction + 0.03) };
  }
  if (intensityRatio <= 0.65) {
    return { ...params, numSteps: params.numSteps - 1, topFraction: params.topFraction - 0.05 };
  }
  return params;
};

// Explicit product requirement: a meaningfully heavier target than last session needs an
// extra intermediate step; a lighter target needs one fewer — the ramp should track
// today's actual load, not repeat the same shape every time.
const loadChangeFactor: WarmupFactor = (params, ctx) => {
  if (!ctx.previousTopWeight) return params;
  const changeRatio = ctx.targetWeight / ctx.previousTopWeight;
  if (changeRatio >= 1.05) return { ...params, numSteps: params.numSteps + 1 };
  if (changeRatio <= 0.95) return { ...params, numSteps: params.numSteps - 1 };
  return params;
};

// How the athlete actually performed last time (RIR achieved on their previous top set)
// is a distinct signal from the raw weight change: grinding out a near-failure set last
// time means today deserves a slightly more careful approach even if the load is similar.
const previousPerformanceFactor: WarmupFactor = (params, ctx) => {
  if (ctx.previousRir == null) return params;
  if (ctx.previousRir <= 1) return { ...params, topFraction: Math.min(MAX_TOP_FRACTION, params.topFraction + 0.03) };
  if (ctx.previousRir >= 4) return { ...params, topFraction: params.topFraction - 0.03 };
  return params;
};

const FACTORS: WarmupFactor[] = [intensityFactor, loadChangeFactor, previousPerformanceFactor];

function clampRamp(params: RampParams): RampParams {
  return {
    ...params,
    numSteps: clamp(Math.round(params.numSteps), MIN_STEPS, MAX_STEPS),
    startFraction: clamp(params.startFraction, MIN_START_FRACTION, params.topFraction - 0.1),
    topFraction: clamp(params.topFraction, params.startFraction + 0.1, MAX_TOP_FRACTION),
  };
}

export function buildWarmupPlan(
  targetWeight: number,
  targetReps: number,
  previousSets: WorkoutSetLog[] | undefined,
  plateIncrementKg: number,
): WarmupSet[] {
  if (targetWeight <= 0) return [];

  const ctx = resolveContext(targetWeight, targetReps, previousSets);

  // No history for this exercise at all — the only deliberately fixed case, since there's
  // no data yet to adapt to. Every other path is data-driven.
  if (!ctx.estimatedE1RM) {
    return calculateWarmupSets({ ...FALLBACK_RAMP, baseReps: Math.max(targetReps + 2, FALLBACK_RAMP.baseReps) }, targetWeight, plateIncrementKg);
  }

  let params: RampParams = { numSteps: 3, startFraction: 0.5, topFraction: 0.87, gamma: 1.6, baseReps: Math.max(targetReps + 2, 8) };
  for (const factor of FACTORS) params = factor(params, ctx);
  params = clampRamp(params);

  return calculateWarmupSets(params, targetWeight, plateIncrementKg);
}
