import { describe, expect, it } from 'vitest';
import { StepLog, WorkoutLog, Exercise } from '../types';
import {
  nextRoundMilestone, eligibleLiftIds, generateChallengeOptions, isCoachGraceDay,
  isoWeekBounds, AutoChallengeInput, ChallengeData,
} from './challengeOptions';
import { addDays } from '../utils/trainingWeek';

const EMPTY_DATA: ChallengeData = {
  stepLogs: [], bodyweightLogs: [], workoutLogs: [], exercises: [],
  completionLogs: [], coachDiets: [], assignments: [], projection: null,
};

// Miércoles 2026-07-08 → semana ISO 28 de 2026 (lunes 6 - domingo 12).
const TODAY = '2026-07-08';

function input(overrides: Partial<AutoChallengeInput> = {}): AutoChallengeInput {
  return { ...EMPTY_DATA, athleteId: 'a@x.com', today: TODAY, ...overrides };
}

function stepLog(date: string, steps: number): StepLog {
  return { id: `s-${date}`, athleteId: 'a@x.com', date, steps, source: 'manual', createdAt: date };
}

const BENCH: Exercise = { id: 'bench', ownerId: 'c', name: 'Press banca', primaryFocus: 'pecho', type: 'fuerza', isCustom: false };

function benchLog(date: string, weight: number, reps: number): WorkoutLog {
  return {
    id: `w-${date}`, athleteId: 'a@x.com', workoutId: 'wk', assignmentId: 'as',
    date, completedAt: date,
    entries: [{ exerciseId: 'bench', sets: [{ weight, repsDone: reps, rir: 1 }] }],
  };
}

describe('isCoachGraceDay', () => {
  it('is true only on Monday', () => {
    expect(isCoachGraceDay('2026-07-06')).toBe(true);  // lunes
    expect(isCoachGraceDay('2026-07-07')).toBe(false); // martes
    expect(isCoachGraceDay('2026-07-12')).toBe(false); // domingo
  });
});

describe('nextRoundMilestone', () => {
  it('proposes 100 when 2.5 kg away (classic bench press case)', () => {
    expect(nextRoundMilestone(97.5)).toEqual({ milestone: 100, distance: 2.5 });
  });

  it('returns null exactly on a round number — does not re-propose an already-hit milestone', () => {
    expect(nextRoundMilestone(100)).toBeNull();
  });

  it('proposes 150 when within the 3% threshold for large weights', () => {
    expect(nextRoundMilestone(147.5)).toEqual({ milestone: 150, distance: 2.5 });
    expect(nextRoundMilestone(146.5)).toEqual({ milestone: 150, distance: 3.5 });
  });

  it('returns null when too far from the next round number', () => {
    expect(nextRoundMilestone(96)).toBeNull();
  });

  it('uses a 5kg step for small weights', () => {
    expect(nextRoundMilestone(17.5)).toEqual({ milestone: 20, distance: 2.5 });
    expect(nextRoundMilestone(13)).toEqual({ milestone: 15, distance: 2 });
    expect(nextRoundMilestone(11)).toBeNull();
  });

  it('returns null for non-positive weights', () => {
    expect(nextRoundMilestone(0)).toBeNull();
    expect(nextRoundMilestone(-5)).toBeNull();
  });
});

describe('eligibleLiftIds', () => {
  const exercises: Exercise[] = [
    BENCH,
    { id: 'curl', ownerId: 'c', name: 'Curl con barra', primaryFocus: 'brazo', type: 'fuerza', isCustom: false },
  ];

  it('falls back to basic keywords when the coach has no config', () => {
    const ids = eligibleLiftIds(exercises, undefined);
    expect(ids.has('bench')).toBe(true);
    expect(ids.has('curl')).toBe(false);
  });

  it('uses the coach-configured list when present, even for a non-basic lift', () => {
    const ids = eligibleLiftIds(exercises, ['curl']);
    expect(ids.has('curl')).toBe(true);
    expect(ids.has('bench')).toBe(false);
  });
});

describe('generateChallengeOptions', () => {
  it('returns an empty array when there is no data at all', () => {
    expect(generateChallengeOptions(input())).toEqual([]);
  });

  it('scores a lift milestone at 100 and prioritizes it over a regular step-based option', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const stepLogs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) stepLogs.push(stepLog(addDays(weekStart, -i), 10000));
    const workoutLogs = [benchLog(addDays(weekStart, -3), 97.5, 5)];
    const opts = generateChallengeOptions(input({ stepLogs, workoutLogs, exercises: [BENCH] }));
    expect(opts[0].kind).toBe('carga_ejercicio');
    expect(opts[0].isMilestone).toBe(true);
    expect(opts[0].score).toBe(100);
    expect(opts[0].title).toContain('100 kg');
    expect(opts.some(o => o.kind === 'pasos_media')).toBe(true);
  });

  it('does not grant milestone exemption to a lift that is not close to a round number', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const workoutLogs = [benchLog(addDays(weekStart, -3), 80, 5)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH] }));
    const lift = opts.find(o => o.kind === 'carga_ejercicio');
    expect(lift?.isMilestone).toBeUndefined();
    expect(lift?.score).toBe(70);
  });

  it('only proposes lifts within the coach-configured eligible exercises', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const workoutLogs = [benchLog(addDays(weekStart, -3), 97.5, 5)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH], liftExerciseIds: ['other-ex'] }));
    expect(opts.some(o => o.kind === 'carga_ejercicio')).toBe(false);
  });

  it('penalizes repeating last week\'s kind, except for milestones', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const stepLogs: StepLog[] = [];
    for (let i = 1; i <= 20; i++) stepLogs.push(stepLog(addDays(weekStart, -i), 5000));
    const withoutPenalty = generateChallengeOptions(input({ stepLogs }));
    const withPenalty = generateChallengeOptions(input({ stepLogs, previousKind: 'pasos_media' }));
    const before = withoutPenalty.find(o => o.kind === 'pasos_media')!;
    const after = withPenalty.find(o => o.kind === 'pasos_media')!;
    expect(after.score).toBe(before.score - 25);
  });

  it('does not apply the rotation penalty to a milestone option', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const workoutLogs = [benchLog(addDays(weekStart, -3), 97.5, 5)];
    const opts = generateChallengeOptions(input({ workoutLogs, exercises: [BENCH], previousKind: 'carga_ejercicio' }));
    expect(opts[0].score).toBe(100);
  });

  it('boosts the steps option score when the average is low', () => {
    const { weekStart } = isoWeekBounds(TODAY);
    const lowSteps: StepLog[] = [];
    for (let i = 1; i <= 20; i++) lowSteps.push(stepLog(addDays(weekStart, -i), 5000));
    const highSteps: StepLog[] = [];
    for (let i = 1; i <= 20; i++) highSteps.push(stepLog(addDays(weekStart, -i), 9000));
    const low = generateChallengeOptions(input({ stepLogs: lowSteps })).find(o => o.kind === 'pasos_media')!;
    const high = generateChallengeOptions(input({ stepLogs: highSteps })).find(o => o.kind === 'pasos_media')!;
    expect(low.score).toBe(75); // 65 + 10
    expect(high.score).toBe(65);
  });
});
