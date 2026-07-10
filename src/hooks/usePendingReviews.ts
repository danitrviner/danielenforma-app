import { useMemo } from 'react';
import { WeightCheckIn } from '../types';

// Pure calc, safe to call directly inside a .map() (e.g. one count per athlete)
// where the hook form below can't be used (rules of hooks forbid calling a hook
// in a loop). Single source of truth — replaces the identical
// `.filter(c => !c.approved || !c.coachFeedback)` reimplemented in App.tsx's
// nav badge, ClientsScreen's "Revisiones Pendientes" card and ReviewsScreen's
// header, each over the same already-fetched checkins array.
export function getPendingReviews(checkins: WeightCheckIn[]): WeightCheckIn[] {
  return checkins.filter(c => !c.approved || !c.coachFeedback);
}

export function usePendingReviews(checkins: WeightCheckIn[]): WeightCheckIn[] {
  return useMemo(() => getPendingReviews(checkins), [checkins]);
}
