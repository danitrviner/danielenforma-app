import { WarmupSet } from '../../types';
import { ReadinessResult } from './types';

// Scores how well-calibrated a warm-up ramp looks — not random, built from five objective
// signals read off the generated (or manually-entered) sets themselves:
//   1. continuidad  — how smooth the weight jumps are, step to step
//   2. cercanía      — how close the last warm-up set lands to the work set
//   3. volumen       — total warm-up tonnage-ish load (sets × reps as a proxy)
//   4. reps totales  — total reps across all warm-up sets
//   5. tamaño saltos — the single biggest jump, as a fraction of the work set
// Each contributes a penalty in one of two directions (too little prep vs too much),
// so the final message can say *why* — not just give a bare number.
export function calculateReadiness(sets: WarmupSet[], targetWeight: number): ReadinessResult | null {
  if (sets.length === 0 || targetWeight <= 0) return null;

  let insufficientPenalty = 0;
  let excessivePenalty = 0;
  let roughnessPenalty = 0;

  const totalReps = sets.reduce((s, w) => s + w.reps, 0);
  const totalSets = sets.length;
  const lastWeight = sets[sets.length - 1].weight;
  const gapRatio = (targetWeight - lastWeight) / targetWeight;

  // 1 & 5. Continuity — jump sizes between consecutive steps (including the first step
  // from zero, and the final jump into the work set).
  const weights = [0, ...sets.map(s => s.weight), targetWeight];
  const jumpRatios = weights.slice(1).map((w, i) => (w - weights[i]) / targetWeight);
  const maxJumpRatio = Math.max(...jumpRatios);
  const jumpVariance = jumpRatios.reduce((s, j) => s + Math.pow(j - jumpRatios.reduce((a, b) => a + b, 0) / jumpRatios.length, 2), 0) / jumpRatios.length;

  if (maxJumpRatio > 0.35) roughnessPenalty += Math.min(25, (maxJumpRatio - 0.35) * 100);
  if (jumpVariance > 0.02) roughnessPenalty += Math.min(15, (jumpVariance - 0.02) * 400);

  // 2. Closeness of the last approximation to the effective set.
  if (gapRatio > 0.20) insufficientPenalty += Math.min(30, (gapRatio - 0.20) * 150);
  if (gapRatio < 0.04) excessivePenalty += Math.min(15, (0.04 - gapRatio) * 300);

  // 3 & 4. Volume — total reps across the ramp is a simple, legible proxy for how much
  // fatigue the warm-up itself is costing.
  if (totalReps < 10) insufficientPenalty += Math.min(20, (10 - totalReps) * 4);
  if (totalReps > 28) excessivePenalty += Math.min(25, (totalReps - 28) * 2);
  if (totalSets > 5) excessivePenalty += Math.min(20, (totalSets - 5) * 10);
  if (totalSets === 1 && gapRatio > 0.15) insufficientPenalty += 10;

  const score = clampScore(100 - insufficientPenalty - excessivePenalty - roughnessPenalty);

  const message = pickMessage(score, insufficientPenalty, excessivePenalty, roughnessPenalty);
  return { score, message };
}

function clampScore(score: number): number {
  return Math.round(Math.min(100, Math.max(0, score)));
}

function pickMessage(score: number, insufficient: number, excessive: number, roughness: number): string {
  if (score >= 75) return 'Preparación óptima.';
  if (roughness >= insufficient && roughness >= excessive) return 'Progresión de cargas irregular — saltos poco uniformes.';
  if (insufficient > excessive) return 'Warm-up probablemente insuficiente.';
  return 'El calentamiento podría generar fatiga innecesaria.';
}
