import { WorkoutLog } from '../types';

const WINDOW_DAYS = 28; // misma ventana que computeAdherenceScore (adherence.ts)

/**
 * RIR medio de las series recientes del atleta — la cifra "RIR MED." del Hub
 * del atleta (F3.13b). Series al fallo no leen `rir` (ver WorkoutSetLog.
 * alFallo en types.ts) y se excluyen del promedio, no se cuentan como 0.
 */
export function computeAverageRir(logs: WorkoutLog[], today: Date = new Date()): number | null {
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  const values: number[] = [];
  for (const log of logs) {
    const d = new Date(log.date);
    if (d < windowStart || d > today) continue;
    for (const entry of log.entries) {
      for (const set of entry.sets) {
        if (set.alFallo) continue;
        if (typeof set.rir === 'number' && !isNaN(set.rir)) values.push(set.rir);
      }
    }
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
