import { WarmupSet, WorkoutSetLog } from '../../types';

// Shape of an in-progress ramp, mutated step by step by the factor pipeline in
// WarmupEngine.ts before WarmupCalculator.ts turns it into concrete kg/reps.
export interface RampParams {
  numSteps: number;       // how many warm-up sets to generate
  startFraction: number;  // fraction of target weight for the lightest step (0-1)
  topFraction: number;    // fraction of target weight for the heaviest step (< 1, never touches the work set)
  gamma: number;          // >1 compresses steps toward topFraction as they approach the work set
  baseReps: number;       // reps at the lightest step; decays as load rises
}

// Everything a factor might need to make a decision — resolved once up front from raw
// inputs (previous logged sets, live target) so factors stay pure and easy to test.
export interface WarmupResolvedContext {
  targetWeight: number;
  targetReps: number;
  previousTopWeight: number | null;
  previousTopReps: number | null;
  previousRir: number | null;      // RIR achieved on that previous top set, if logged
  estimatedE1RM: number | null;    // epley(previousTopWeight, previousTopReps), null if no history
}

export type WarmupFactor = (params: RampParams, ctx: WarmupResolvedContext) => RampParams;

export interface ReadinessResult {
  score: number;       // 0-100
  message: string;
}

export interface WarmupInput {
  targetWeight: number;             // kg the athlete is typing/planning for set 1
  targetReps: number;               // prescribed reps for set 1 (parsed from WorkoutExercise.reps)
  previousSets?: WorkoutSetLog[];   // most recent logged sets for this exercise, if any
  plateIncrementKg?: number;
}

export interface WarmupPlan {
  sets: WarmupSet[];
  readiness: ReadinessResult | null; // null when there's nothing to score (no sets generated)
}
