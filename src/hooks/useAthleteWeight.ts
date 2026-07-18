import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete } from '../dbService';

export interface AthleteWeight {
  logs: BodyweightLog[]; // ascending by date
  initial: number | null; // earliest logged weight
  current: number | null; // most recent logged weight
  loading: boolean;
}

// Shared react-query key for an athlete's bodyweight log — BodyweightPanel
// (the writer) uses the same key so its mutations update exactly what this
// hook's read-only consumers (CoachRoadmapView, NutritionPerformanceDashboard)
// see, without either side needing to know about the other.
export function bodyweightForAthleteKey(athleteEmail: string) {
  return ['bodyweightForAthlete', athleteEmail] as const;
}

// Single source of truth for "what does this athlete weigh" — replaces the
// independent getBodyweightForAthlete() calls in CoachRoadmapView and
// NutritionPerformanceDashboard (read-only consumers), which could each show a
// slightly different snapshot depending on load timing.
export function useAthleteWeight(athleteEmail: string | undefined): AthleteWeight {
  const { data, isPending } = useQuery({
    queryKey: bodyweightForAthleteKey(athleteEmail ?? ''),
    queryFn: () => getBodyweightForAthlete(athleteEmail!),
    enabled: !!athleteEmail,
  });

  return useMemo(() => {
    const logs = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return {
      logs,
      initial: logs.length > 0 ? logs[0].weight : null,
      current: logs.length > 0 ? logs[logs.length - 1].weight : null,
      loading: athleteEmail ? isPending : false,
    };
  }, [data, isPending, athleteEmail]);
}
