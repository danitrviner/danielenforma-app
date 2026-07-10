import { describe, expect, it } from 'vitest';
import { WorkoutExercise } from '../types';
import { expandSetGroups, syncAggregateFromGroups } from './setGroups';

const BASE: WorkoutExercise = {
  exerciseId: 'ex1', order: 0, sets: 4, reps: '8-10', restSeconds: 90, rir: 2,
};

describe('expandSetGroups', () => {
  it('expands a uniform exercise into `sets` identical rows', () => {
    const rows = expandSetGroups(BASE);
    expect(rows).toHaveLength(4);
    expect(rows.every(r => r.reps === '8-10' && r.rir === 2)).toBe(true);
  });

  it('expands top sets + back-off sets into their own labelled rows', () => {
    const we: WorkoutExercise = {
      ...BASE,
      setGroups: [
        { label: 'Top set', sets: 2, reps: '10-12', rir: 1 },
        { label: 'Back-off', sets: 2, reps: '14-19', rir: 3 },
      ],
    };
    const rows = expandSetGroups(we);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ reps: '10-12', rir: 1, label: 'Top set' });
    expect(rows[2]).toMatchObject({ reps: '14-19', rir: 3, label: 'Back-off' });
  });
});

describe('syncAggregateFromGroups', () => {
  it('leaves the exercise untouched when there are no groups', () => {
    expect(syncAggregateFromGroups(BASE)).toEqual(BASE);
  });

  it('recomputes total sets, joined reps and first group RIR', () => {
    const we: WorkoutExercise = {
      ...BASE,
      setGroups: [
        { label: 'Top set', sets: 2, reps: '10-12', rir: 1 },
        { label: 'Back-off', sets: 2, reps: '14-19', rir: 3 },
      ],
    };
    const synced = syncAggregateFromGroups(we);
    expect(synced.sets).toBe(4);
    expect(synced.reps).toBe('10-12 / 14-19');
    expect(synced.rir).toBe(1);
  });
});
