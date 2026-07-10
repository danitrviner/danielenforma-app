// Single global "smallest practical jump" — the user chose one app-wide value over a
// per-exercise setting (barbell plates / dumbbell steps / machine pins all differ, but
// modelling that per-exercise was ruled out as unnecessary for now). Lives here, not
// hardcoded inline, so it stays a single edit point if it becomes configurable later.
export const DEFAULT_PLATE_INCREMENT_KG = 2.5;

// Bootstrap ramp shape used only when there's no prior session for the exercise (see
// noHistoryFallback in WarmupEngine.ts) — the one deliberately fixed case, everything
// else adapts to the athlete's data.
export const FALLBACK_RAMP = { numSteps: 3, startFraction: 0.5, topFraction: 0.85, gamma: 1.6, baseReps: 10 };

// Ramp shape bounds — factors nudge within these, never outside.
export const MIN_STEPS = 1;
export const MAX_STEPS = 5;
export const MIN_START_FRACTION = 0.35;
export const MAX_TOP_FRACTION = 0.92;
