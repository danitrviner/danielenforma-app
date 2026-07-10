import { describe, expect, it } from 'vitest';
import { WorkoutSetLog } from '../../types';
import { buildWarmupPlan, parseTargetReps } from './WarmupEngine';

describe('parseTargetReps', () => {
  it('takes the low end of a rep range', () => {
    expect(parseTargetReps('8-12')).toBe(8);
  });
  it('parses a plain number', () => {
    expect(parseTargetReps('12')).toBe(12);
  });
  it('falls back to a default for non-numeric prescriptions', () => {
    expect(parseTargetReps('AMRAP')).toBe(8);
  });
});

describe('buildWarmupPlan', () => {
  it('returns nothing without a target weight', () => {
    expect(buildWarmupPlan(0, 8, undefined, 2.5)).toEqual([]);
  });

  it('uses a fixed conservative ramp the first time an exercise has no history', () => {
    const sets = buildWarmupPlan(100, 8, undefined, 2.5);
    expect(sets.length).toBeGreaterThanOrEqual(2);
    expect(sets[sets.length - 1].weight).toBeLessThan(100);
  });

  it('adds an intermediate step when today\'s target clearly exceeds last session\'s top weight', () => {
    const prev: WorkoutSetLog[] = [{ weight: 80, repsDone: 8, rir: 2 }];
    const samePlan = buildWarmupPlan(80, 8, prev, 2.5);
    const heavierPlan = buildWarmupPlan(95, 8, prev, 2.5);
    expect(heavierPlan.length).toBeGreaterThan(samePlan.length);
  });

  it('removes steps when today\'s target is a clear reduction from last session', () => {
    const prev: WorkoutSetLog[] = [{ weight: 100, repsDone: 8, rir: 2 }];
    const samePlan = buildWarmupPlan(100, 8, prev, 2.5);
    const lighterPlan = buildWarmupPlan(80, 8, prev, 2.5);
    expect(lighterPlan.length).toBeLessThan(samePlan.length);
  });

  it('ramps more gradually when today is a near-max effort relative to estimated capacity', () => {
    const prev: WorkoutSetLog[] = [{ weight: 100, repsDone: 5, rir: 3 }]; // e1RM ~ 116.7
    const nearMax = buildWarmupPlan(112, 5, prev, 2.5);   // ratio ~0.96
    const moderate = buildWarmupPlan(80, 5, prev, 2.5);   // ratio ~0.69
    expect(nearMax.length).toBeGreaterThanOrEqual(moderate.length);
  });

  it('reacts to previous performance: grinding near failure last time nudges the ramp higher', () => {
    const prevGrinding: WorkoutSetLog[] = [{ weight: 90, repsDone: 8, rir: 0 }];
    const prevEasy: WorkoutSetLog[] = [{ weight: 90, repsDone: 8, rir: 5 }];
    const afterGrind = buildWarmupPlan(90, 8, prevGrinding, 2.5);
    const afterEasy = buildWarmupPlan(90, 8, prevEasy, 2.5);
    const lastWeight = (sets: { weight: number }[]) => sets[sets.length - 1]?.weight ?? 0;
    expect(lastWeight(afterGrind)).toBeGreaterThanOrEqual(lastWeight(afterEasy));
  });

  it('never produces a warm-up set at or above the target weight', () => {
    const prev: WorkoutSetLog[] = [{ weight: 60, repsDone: 10, rir: 2 }];
    const sets = buildWarmupPlan(62.5, 10, prev, 2.5);
    for (const s of sets) expect(s.weight).toBeLessThan(62.5);
  });
});
