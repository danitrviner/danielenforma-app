import { describe, expect, it } from 'vitest';
import { BodyweightLog, WorkoutLog, Exercise, LevelLadder } from '../types';
import { computeLadderStatus, LadderData } from './levelLadder';
import { DEFAULT_LEVEL_LADDER } from '../data/defaultLevelLadder';

const TODAY = '2026-07-08';

function bw(date: string, weight: number): BodyweightLog {
  return { id: `b-${date}`, athleteId: 'a@x.com', date, weight, createdAt: date };
}

function emptyData(overrides: Partial<LadderData> = {}): LadderData {
  return { bodyweightLogs: [], stepLogs: [], workoutLogs: [], exercises: [], today: TODAY, ...overrides };
}

const SQUAT: Exercise = { id: 'sq', ownerId: 'c', name: 'Sentadilla con barra', primaryFocus: 'pierna', type: 'fuerza', isCustom: false };

function squatLog(date: string, weight: number, reps: number): WorkoutLog {
  return {
    id: `w-${date}`, athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
    date, completedAt: date,
    entries: [{ exerciseId: 'sq', sets: [{ weight, repsDone: reps, rir: 1 }] }],
  };
}

describe('computeLadderStatus', () => {
  it('reports no level and the base level as next when there is no progress', () => {
    const res = computeLadderStatus(DEFAULT_LEVEL_LADDER, emptyData());
    expect(res.currentLevel).toBeNull();
    expect(res.nextLevel?.id).toBe('lvl-club');
    expect(res.newlyAchieved).toHaveLength(0);
  });

  it('grants Club after losing 5 kg (peso_perdido_kg from first weigh-in)', () => {
    const data = emptyData({ bodyweightLogs: [bw('2026-01-01', 95), bw('2026-07-01', 89.5)] });
    const res = computeLadderStatus(DEFAULT_LEVEL_LADDER, data);
    expect(res.currentLevel?.id).toBe('lvl-club');
    expect(res.nextLevel?.id).toBe('lvl-hombre-sano');
    expect(res.newlyAchieved.map(l => l.id)).toEqual(['lvl-club']);
  });

  it('requires ALL criteria: 10 kg lost but push-ups unverified keeps Hombre Sano pending', () => {
    const data = emptyData({ bodyweightLogs: [bw('2026-01-01', 95), bw('2026-07-01', 84)] });
    const res = computeLadderStatus(DEFAULT_LEVEL_LADDER, data);
    expect(res.currentLevel?.id).toBe('lvl-club');
    const flex = res.nextLevelCriteria.find(c => c.criterion.kind === 'manual');
    expect(flex?.done).toBe(false);
    const peso = res.nextLevelCriteria.find(c => c.criterion.kind === 'peso_perdido_kg');
    expect(peso?.done).toBe(true);
  });

  it('evaluates squat xBW from the best e1RM and current bodyweight', () => {
    const ladder: LevelLadder = {
      levels: [{
        id: 'l1', order: 0, name: 'Fuerte', icon: 'bolt',
        criteria: [{ id: 'c1', kind: 'sentadilla_xbw', label: '1.5xBW', targetValue: 1.5, exerciseNameMatch: 'sentadilla' }],
      }],
    };
    // e1RM = epley(120, 5) = 140 → 140 / 80 = 1.75 xBW ≥ 1.5
    const data = emptyData({
      bodyweightLogs: [bw('2026-07-01', 80)],
      exercises: [SQUAT],
      workoutLogs: [squatLog('2026-06-20', 120, 5)],
    });
    const res = computeLadderStatus(ladder, data);
    expect(res.currentLevel?.id).toBe('l1');
  });

  it('never un-levels: an achieved level persists even if data regresses', () => {
    const ladder: LevelLadder = {
      ...DEFAULT_LEVEL_LADDER,
      achievedLevelIds: { 'lvl-club': '2026-05-01' },
    };
    // Rebote: ya no cumple los 5 kg perdidos, pero el nivel se conserva.
    const data = emptyData({ bodyweightLogs: [bw('2026-01-01', 95), bw('2026-07-01', 93)] });
    const res = computeLadderStatus(ladder, data);
    expect(res.currentLevel?.id).toBe('lvl-club');
    expect(res.newlyAchieved).toHaveLength(0);
  });
});
