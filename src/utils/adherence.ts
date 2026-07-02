import { WorkoutAssignment, WeightCheckIn } from '../types';

const ADVAL: Record<string, number> = { 'Sí': 1, 'Parcial': 0.5, 'No': 0 };

export interface AdherenceResult {
  score: number;           // 0-100
  trainingScore: number | null;  // null = sin datos de entreno
  checkinScore: number;
}

export function computeAdherenceScore(
  assignments: WorkoutAssignment[],
  checkins: WeightCheckIn[],
): AdherenceResult {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 28);

  // ── Training adherence ──
  const wa = assignments.filter(a => {
    const d = new Date(a.date);
    return d >= windowStart && d <= today;
  });
  const trainingScore = wa.length === 0
    ? null
    : (wa.filter(a => a.status === 'completed').length / wa.length) * 100;

  // ── Check-in adherence ──
  const wc = checkins.filter(c => {
    const ts = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp as unknown as string);
    return ts >= windowStart && ts <= today;
  });
  const frequency   = Math.min(wc.length / 4, 1);   // 4 check-ins expected over 4 weeks
  const selfAdh     = wc.length === 0
    ? 0
    : wc.reduce((s, c) => s + (ADVAL[c.adherence] ?? 0.5), 0) / wc.length;
  const checkinScore = frequency * selfAdh * 100;

  // ── Combined ──
  const score = trainingScore === null
    ? Math.round(checkinScore)
    : Math.round(trainingScore * 0.5 + checkinScore * 0.5);

  return { score, trainingScore, checkinScore };
}

export interface ScoreStyle {
  text:  string;
  bg:    string;
  label: string;
}

export function scoreStyle(score: number): ScoreStyle {
  if (score >= 75) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Buena adherencia' };
  if (score >= 50) return { text: 'text-orange-400',  bg: 'bg-orange-500/10  border-orange-500/20',  label: 'Irregular'        };
  return              { text: 'text-red-400',          bg: 'bg-red-500/10     border-red-500/20',     label: 'En riesgo'        };
}
