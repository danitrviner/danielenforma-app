import { WorkoutAssignment, WeightCheckIn } from '../types';

const ADVAL: Record<string, number> = { 'Sí': 1, 'Parcial': 0.5, 'No': 0 };

export interface AdherenceResult {
  score: number;           // 0-100
  trainingScore: number | null;  // null = sin datos de entreno
  checkinScore: number;
  // false = ni entrenos ni check-ins en las últimas 4 semanas. `score` da 0 en
  // ese caso por ausencia de datos, NO por mal desempeño — un atleta recién
  // invitado no debería verse "0% · En riesgo" en rojo (F3.13f, panel "datos
  // insuficientes": nunca una gráfica/indicador que finja saber algo que no sabe).
  hasData: boolean;
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

  return { score, trainingScore, checkinScore, hasData: wa.length > 0 || wc.length > 0 };
}

export interface ScoreStyle {
  text:  string;
  bg:    string;
  label: string;
}

// Estilo neutro para cuando `AdherenceResult.hasData` es false — mismo shape
// que devuelve `scoreStyle`, para que el llamante no tenga que ramificar el
// className, solo qué función/constante usar.
export const SIN_DATOS_ADHERENCIA: ScoreStyle = {
  text: 'text-ink-3', bg: 'bg-white/4 border-hairline', label: 'Sin datos aún',
};

export function scoreStyle(score: number): ScoreStyle {
  if (score >= 75) return { text: 'text-success', bg: 'bg-success/10 border-success/20', label: 'Buena adherencia' };
  if (score >= 50) return { text: 'text-warning', bg: 'bg-warning/10 border-warning/20', label: 'Irregular'        };
  return              { text: 'text-danger',  bg: 'bg-danger/10  border-danger/20',  label: 'En riesgo'        };
}
