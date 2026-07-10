import { WarmupSet } from '../../types';
import { RampParams } from './types';

function roundToIncrement(weight: number, incrementKg: number): number {
  return Math.round(weight / incrementKg) * incrementKg;
}

// Turns an abstract ramp shape (fractions of target weight) into concrete kg/reps steps.
// Pure function — no history lookups, no I/O — so it's trivial to unit test in isolation
// from the factor pipeline that produced `params`.
//
// Rationale for the curve (not a fixed % table): warm-up guidance for strength training
// (NSCA Essentials of Strength Training and Conditioning; general consensus in
// specific-warm-up literature) converges on a graduated ramp — increasing load, decreasing
// reps, with the load jumps shrinking as the lifter approaches the work set (to avoid
// pre-fatigue right before the effective set while still priming the nervous system).
// Here that "shrinking jumps near the top" behaviour comes from `t^(1/gamma)` with
// gamma > 1: the curve rises fast early (first steps close a lot of the gap to
// topFraction) and flattens near the end (later steps add progressively less).
export function calculateWarmupSets(
  params: RampParams,
  targetWeight: number,
  plateIncrementKg: number,
): WarmupSet[] {
  if (targetWeight <= 0 || params.numSteps <= 0) return [];

  const exponent = 1 / params.gamma;
  const steps: WarmupSet[] = [];

  for (let i = 1; i <= params.numSteps; i++) {
    const t = i / params.numSteps;
    const fraction = params.startFraction + (params.topFraction - params.startFraction) * Math.pow(t, exponent);

    let weight = roundToIncrement(targetWeight * fraction, plateIncrementKg);
    // Never reach or exceed the work set — leave at least one increment of headroom.
    weight = Math.min(weight, targetWeight - plateIncrementKg);
    weight = Math.max(weight, plateIncrementKg);

    // Reps decay as load rises — lightest step near baseReps, heaviest step roughly halved.
    const reps = Math.max(1, Math.round(params.baseReps * (1 - fraction * 0.55)));

    steps.push({ weight, reps });
  }

  // Rounding to the plate increment can collapse two planned steps onto the same weight
  // (common with light targets / coarse increments) — keep the ramp strictly ascending.
  const deduped: WarmupSet[] = [];
  for (const s of steps) {
    const last = deduped[deduped.length - 1];
    if (last && s.weight <= last.weight) continue;
    deduped.push(s);
  }
  return deduped;
}
