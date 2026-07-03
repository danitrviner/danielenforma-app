// Estimated one-rep max (Epley formula), rounded to 1 decimal.
// Single source of truth — reused by LoadHistoryPanel, CorrelationPanel and the
// training report engine so the "1RM est." figure is identical everywhere.
export function epley(weight: number | string, reps: number | string): number {
  const w = Number(weight);
  const r = Number(reps);
  if (!r || !w) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}
