import { WarmupMode, WarmupSet, WorkoutSetLog } from '../../types';
import { DEFAULT_PLATE_INCREMENT_KG } from './constants';
import { calculateReadiness } from './ReadinessCalculator';
import { buildWarmupPlan } from './WarmupEngine';
import { WarmupPlan } from './types';

interface GenerateWarmupInput {
  mode: WarmupMode | undefined;    // undefined behaves as 'none'
  manualSets?: WarmupSet[];
  targetWeight: number;            // kg the athlete is currently typing/planning for set 1
  targetReps: number;              // prescribed reps for set 1 (already parsed to a number)
  previousSets?: WorkoutSetLog[];  // most recent logged sets for this exercise, if any
  plateIncrementKg?: number;
}

// Single entry point the UI calls — hides whether the plan came from the adaptive engine
// or the coach's manual sets, and always attaches a Readiness score to whatever list of
// sets ends up on screen (manual warm-ups get scored too, not just generated ones).
export function generateWarmup(input: GenerateWarmupInput): WarmupPlan {
  const plateIncrementKg = input.plateIncrementKg ?? DEFAULT_PLATE_INCREMENT_KG;

  if (input.mode === 'manual') {
    const sets = input.manualSets ?? [];
    return { sets, readiness: calculateReadiness(sets, input.targetWeight) };
  }

  if (input.mode !== 'auto') return { sets: [], readiness: null };

  const sets = buildWarmupPlan(input.targetWeight, input.targetReps, input.previousSets, plateIncrementKg);
  return { sets, readiness: calculateReadiness(sets, input.targetWeight) };
}
