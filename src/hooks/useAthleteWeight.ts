import { useMemo } from 'react';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete } from '../dbService';
import { useResourceCache } from './useResourceCache';

export interface AthleteWeight {
  logs: BodyweightLog[]; // ascending by date
  initial: number | null; // earliest logged weight
  current: number | null; // most recent logged weight
  loading: boolean;
}

// Single source of truth for "what does this athlete weigh" — replaces the
// independent getBodyweightForAthlete() calls in CoachRoadmapView and
// NutritionPerformanceDashboard (read-only consumers), which could each show a
// slightly different snapshot depending on load timing. BodyweightPanel itself
// keeps its own read-write state (it's the writer, not a duplicate reader) but
// calls invalidateResource() on every add/edit/delete so this hook's cache
// doesn't go stale after an edit made there.
export function useAthleteWeight(athleteEmail: string | undefined): AthleteWeight {
  const key = athleteEmail ? `weight:${athleteEmail}` : null;
  const { data, loading } = useResourceCache(key, () => getBodyweightForAthlete(athleteEmail!));

  return useMemo(() => {
    const logs = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return {
      logs,
      initial: logs.length > 0 ? logs[0].weight : null,
      current: logs.length > 0 ? logs[logs.length - 1].weight : null,
      loading,
    };
  }, [data, loading]);
}
