import { useMemo } from 'react';
import { WeightCheckIn } from '../types';
import { getWorkoutAssignments } from '../dbService';
import { computeAdherenceScore, AdherenceResult } from '../utils/adherence';
import { useResourceCache } from './useResourceCache';

// Single source of truth for adherence — replaces the independent
// getWorkoutAssignments() + computeAdherenceScore() call pairs in ClientsScreen
// (the athlete grid) and ClientHub (the Hub header badge), which had silently
// diverged: ClientsScreen queried assignments by athlete.email while
// createWorkoutAssignment actually writes athleteId: athlete.userId — so the
// grid's adherence score was always computed against an empty assignment list.
// Keying this hook by userId (matching the write path) fixes that for both callers.
export function useAdherence(athleteUserId: string | undefined, checkins: WeightCheckIn[]): AdherenceResult {
  const key = athleteUserId ? `assignments:${athleteUserId}` : null;
  const { data } = useResourceCache(key, () => getWorkoutAssignments(athleteUserId!));

  return useMemo(
    () => computeAdherenceScore(data ?? [], checkins),
    [data, checkins]
  );
}
