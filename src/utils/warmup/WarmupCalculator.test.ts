import { describe, expect, it } from 'vitest';
import { calculateWarmupSets } from './WarmupCalculator';

const BASE = { numSteps: 3, startFraction: 0.5, topFraction: 0.87, gamma: 1.6, baseReps: 10 };

describe('calculateWarmupSets', () => {
  it('returns no sets when there is no target weight', () => {
    expect(calculateWarmupSets(BASE, 0, 2.5)).toEqual([]);
  });

  it('produces an ascending ramp that never reaches the target weight', () => {
    const sets = calculateWarmupSets(BASE, 100, 2.5);
    expect(sets.length).toBeGreaterThan(0);
    for (let i = 1; i < sets.length; i++) expect(sets[i].weight).toBeGreaterThan(sets[i - 1].weight);
    expect(sets[sets.length - 1].weight).toBeLessThan(100);
  });

  it('rounds every weight to the given plate increment', () => {
    const sets = calculateWarmupSets(BASE, 83, 2.5);
    for (const s of sets) expect(s.weight % 2.5).toBeCloseTo(0, 5);
  });

  it('decreases reps as the load rises', () => {
    const sets = calculateWarmupSets(BASE, 100, 2.5);
    for (let i = 1; i < sets.length; i++) expect(sets[i].reps).toBeLessThanOrEqual(sets[i - 1].reps);
  });

  it('shrinks the jump size as steps approach the work set', () => {
    const sets = calculateWarmupSets({ ...BASE, numSteps: 4 }, 100, 1);
    const jumps = sets.map((s, i) => s.weight - (i === 0 ? 0 : sets[i - 1].weight));
    // last jump between warm-up sets should not be larger than the first
    expect(jumps[jumps.length - 1]).toBeLessThanOrEqual(jumps[1]);
  });

  it('collapses duplicate steps caused by coarse rounding instead of returning flat/descending weights', () => {
    const sets = calculateWarmupSets(BASE, 6, 2.5);
    for (let i = 1; i < sets.length; i++) expect(sets[i].weight).toBeGreaterThan(sets[i - 1].weight);
  });
});
