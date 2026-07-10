import { describe, expect, it } from 'vitest';
import { WarmupSet } from '../../types';
import { calculateReadiness } from './ReadinessCalculator';

describe('calculateReadiness', () => {
  it('returns null when there are no warm-up sets', () => {
    expect(calculateReadiness([], 100)).toBeNull();
  });

  it('scores a smooth, well-spaced ramp highly', () => {
    const sets: WarmupSet[] = [
      { weight: 40, reps: 10 },
      { weight: 60, reps: 6 },
      { weight: 80, reps: 3 },
    ];
    const result = calculateReadiness(sets, 100);
    expect(result?.score).toBeGreaterThanOrEqual(75);
    expect(result?.message).toMatch(/óptima/i);
  });

  it('flags a warm-up that stops too far below the work set as insufficient', () => {
    const sets: WarmupSet[] = [{ weight: 30, reps: 10 }];
    const result = calculateReadiness(sets, 100);
    expect(result?.message).toMatch(/insuficiente/i);
  });

  it('flags an excessive number of high-volume sets as potentially fatiguing', () => {
    const sets: WarmupSet[] = [
      { weight: 20, reps: 12 },
      { weight: 30, reps: 12 },
      { weight: 40, reps: 12 },
      { weight: 50, reps: 12 },
      { weight: 60, reps: 12 },
      { weight: 70, reps: 12 },
    ];
    const result = calculateReadiness(sets, 100);
    expect(result?.message).toMatch(/fatiga/i);
  });

  it('flags a big single jump as irregular progression', () => {
    const sets: WarmupSet[] = [{ weight: 90, reps: 3 }];
    const result = calculateReadiness(sets, 100);
    expect(result?.score).toBeLessThan(100);
  });
});
