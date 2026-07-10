import { WorkoutExercise, WorkoutSetGroup } from '../types';

export interface ExpandedSet {
  reps: string;
  rir: number;
  label?: string;
  groupIdx: number; // which setGroup this row came from (0 for uniform exercises with a single implicit group)
}

// Flattens an exercise's prescription into one row per set — from `setGroups` when
// present, or `sets` uniform copies of `reps`/`rir` otherwise. This is the single place
// that knows how to read "how many sets, and what's each one's target" so the athlete
// player, the coach editors and the warm-up engine never have to branch on setGroups
// themselves.
export function expandSetGroups(we: Pick<WorkoutExercise, 'sets' | 'reps' | 'rir' | 'setGroups'>): ExpandedSet[] {
  if (we.setGroups && we.setGroups.length > 0) {
    return we.setGroups.flatMap((g, groupIdx) =>
      Array.from({ length: Math.max(1, g.sets) }, () => ({ reps: g.reps, rir: g.rir, label: g.label, groupIdx }))
    );
  }
  return Array.from({ length: Math.max(1, we.sets) }, () => ({ reps: we.reps, rir: we.rir, groupIdx: 0 }));
}

// Recomputes the legacy uniform fields from `setGroups` so anything that only reads
// `sets`/`reps`/`rir` (exercise counts, "X series" totals, list previews) keeps working
// without being rewritten for groups. Call this after any edit to `setGroups`.
export function syncAggregateFromGroups(we: WorkoutExercise): WorkoutExercise {
  if (!we.setGroups || we.setGroups.length === 0) return we;
  const totalSets = we.setGroups.reduce((s, g) => s + Math.max(1, g.sets), 0);
  const reps = we.setGroups.map(g => g.reps).join(' / ');
  const rir = we.setGroups[0].rir;
  return { ...we, sets: totalSets, reps, rir };
}

export function newSetGroup(reps = '8-10', rir = 2): WorkoutSetGroup {
  return { sets: 2, reps, rir };
}
