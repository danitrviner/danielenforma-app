import {
  BodyweightLog, WorkoutAssignment, DietCompletionLog, Diet, WeeklyChallenge,
  QuestionnaireResponse, QuestionnaireAssignment, Questionnaire,
} from '../types';
import { resolveQuestions } from './questionnaireResolve';

// Extra report sections beyond pure training performance (peso corporal,
// adherencia a sesiones, nutrición y retos). Same deterministic philosophy as
// trainingReport.ts: pure functions over the athlete's logs for a date window,
// snapshotted into CoachReportSection.data at generation time.

function round1(n: number): number { return Math.round(n * 10) / 10; }

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

// ── Peso corporal ─────────────────────────────────────────────────────────────

export interface BodyweightSectionData {
  startWeight: number | null;   // first log in the period (or latest before it)
  endWeight: number | null;     // last log in the period
  deltaKg: number | null;       // endWeight - startWeight
  targetWeight: number | null;
  towardsTarget: boolean | null; // null when no target or no delta
  entries: number;              // logs within the period
}

export function computeBodyweightSection(
  logs: BodyweightLog[],
  periodStart: string,
  periodEnd: string,
  targetWeight: number | undefined,
): BodyweightSectionData {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const inPeriod = sorted.filter(l => inRange(l.date, periodStart, periodEnd));
  // Baseline: last known weight BEFORE the period, so a single mid-week log
  // still yields a delta instead of a flat 0.
  const before = sorted.filter(l => l.date < periodStart);
  const baseline = before.length ? before[before.length - 1].weight : (inPeriod[0]?.weight ?? null);
  const endWeight = inPeriod.length ? inPeriod[inPeriod.length - 1].weight : null;
  const deltaKg = baseline != null && endWeight != null ? round1(endWeight - baseline) : null;
  let towardsTarget: boolean | null = null;
  if (targetWeight != null && deltaKg != null && baseline != null && deltaKg !== 0) {
    towardsTarget = targetWeight > baseline ? deltaKg > 0 : deltaKg < 0;
  }
  return {
    startWeight: baseline,
    endWeight,
    deltaKg,
    targetWeight: targetWeight ?? null,
    towardsTarget,
    entries: inPeriod.length,
  };
}

// ── Adherencia a sesiones ─────────────────────────────────────────────────────

export interface AdherenceSectionData {
  planned: number;        // assignments dated within the period
  completed: number;
  pct: number | null;     // completed / planned, 0-100
  prevPct: number | null; // same ratio in the comparison window
}

function adherencePct(assignments: WorkoutAssignment[], start: string, end: string): { planned: number; completed: number; pct: number | null } {
  const win = assignments.filter(a => inRange(a.date, start, end));
  const completed = win.filter(a => a.status === 'completed').length;
  return { planned: win.length, completed, pct: win.length ? Math.round((completed / win.length) * 100) : null };
}

export function computeAdherenceSection(
  assignments: WorkoutAssignment[],
  periodStart: string,
  periodEnd: string,
  prevStart: string | null,
  prevEnd: string | null,
): AdherenceSectionData {
  const cur = adherencePct(assignments, periodStart, periodEnd);
  const prev = prevStart && prevEnd ? adherencePct(assignments, prevStart, prevEnd) : null;
  return { planned: cur.planned, completed: cur.completed, pct: cur.pct, prevPct: prev?.pct ?? null };
}

// ── Nutrición (cumplimiento de dieta) ────────────────────────────────────────

export interface NutritionSectionData {
  daysLogged: number;
  periodDays: number;
  avgPct: number | null;     // mean % of diet items marked done, across logged days
  prevAvgPct: number | null;
}

function dietAvgPct(logs: DietCompletionLog[], diets: Diet[], start: string, end: string): { daysLogged: number; avgPct: number | null } {
  const dietsById = new Map(diets.map(d => [d.id, d]));
  const win = logs.filter(l => inRange(l.date, start, end));
  if (win.length === 0) return { daysLogged: 0, avgPct: null };
  const pcts = win.map(log => {
    const diet = dietsById.get(log.dietId);
    const totalItems = diet ? diet.meals.reduce((s, m) => s + m.items.length, 0) : 0;
    if (totalItems === 0) return 0;
    return Math.min(100, (log.doneItemIds.length / totalItems) * 100);
  });
  return { daysLogged: win.length, avgPct: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) };
}

export function computeNutritionSection(
  dietLogs: DietCompletionLog[],
  diets: Diet[],
  periodStart: string,
  periodEnd: string,
  prevStart: string | null,
  prevEnd: string | null,
): NutritionSectionData {
  const cur = dietAvgPct(dietLogs, diets, periodStart, periodEnd);
  const prev = prevStart && prevEnd ? dietAvgPct(dietLogs, diets, prevStart, prevEnd) : null;
  const periodDays = Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1;
  return { daysLogged: cur.daysLogged, periodDays, avgPct: cur.avgPct, prevAvgPct: prev?.avgPct ?? null };
}

// ── Retos semanales ───────────────────────────────────────────────────────────

export interface ChallengeItem {
  title: string;
  status: 'activo' | 'conseguido' | 'fallido';
  target: number;
  unit: string;
  progressValue: number | null;
}

export interface ChallengesSectionData { items: ChallengeItem[]; }

// ── Bienestar (cuestionarios) ─────────────────────────────────────────────────
// Media de cada pregunta numérica/escala/medida respondida en el periodo,
// comparada con la ventana anterior — mismo patrón que el resto de secciones.
// Resuelve overrides por asignación (resolveQuestions) para que la etiqueta
// mostrada sea la que el atleta realmente vio, no la de la plantilla maestra.

export interface WellnessQuestionSummary {
  questionId: string;
  questionLabel: string;
  questionnaireTitle: string;
  avg: number;
  prevAvg: number | null;
  unit?: string;
  responsesCount: number;
}

export interface WellnessSectionData {
  questions: WellnessQuestionSummary[];
  responsesInPeriod: number;
}

interface WellnessAcc { sum: number; count: number; label: string; qTitle: string; unit?: string }

function wellnessAverages(
  responses: QuestionnaireResponse[],
  qById: Map<string, Questionnaire>,
  aById: Map<string, QuestionnaireAssignment>,
  start: string,
  end: string,
): Map<string, WellnessAcc> {
  const acc = new Map<string, WellnessAcc>();
  for (const r of responses) {
    const date = r.submittedAt.slice(0, 10);
    if (!inRange(date, start, end)) continue;
    const q = qById.get(r.questionnaireId);
    if (!q) continue;
    const assignment = aById.get(r.assignmentId);
    const resolved = assignment ? resolveQuestions(q, assignment) : q.questions;
    for (const ans of r.answers) {
      const question = resolved.find(rq => rq.id === ans.questionId);
      if (!question) continue;
      const graphable = question.graphable || question.type === 'numeric' || question.type === 'scale' || question.type === 'metric';
      if (!graphable) continue;
      const val = Number(ans.value);
      if (isNaN(val)) continue;
      const e = acc.get(question.id) ?? { sum: 0, count: 0, label: question.label, qTitle: q.title, unit: question.unit };
      e.sum += val;
      e.count += 1;
      acc.set(question.id, e);
    }
  }
  return acc;
}

export function computeWellnessSection(
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
  qAssignments: QuestionnaireAssignment[],
  periodStart: string,
  periodEnd: string,
  prevStart: string | null,
  prevEnd: string | null,
): WellnessSectionData {
  const qById = new Map(questionnaires.map(q => [q.id, q]));
  const aById = new Map(qAssignments.map(a => [a.id, a]));

  const cur = wellnessAverages(responses, qById, aById, periodStart, periodEnd);
  const prev = prevStart && prevEnd ? wellnessAverages(responses, qById, aById, prevStart, prevEnd) : new Map<string, WellnessAcc>();

  const questions: WellnessQuestionSummary[] = [...cur.entries()].map(([id, e]) => {
    const p = prev.get(id);
    return {
      questionId: id,
      questionLabel: e.label,
      questionnaireTitle: e.qTitle,
      avg: round1(e.sum / e.count),
      prevAvg: p ? round1(p.sum / p.count) : null,
      unit: e.unit,
      responsesCount: e.count,
    };
  });

  const responsesInPeriod = responses.filter(r => inRange(r.submittedAt.slice(0, 10), periodStart, periodEnd)).length;

  return { questions, responsesInPeriod };
}

export function computeChallengesSection(
  challenges: WeeklyChallenge[],
  periodStart: string,
  periodEnd: string,
): ChallengesSectionData {
  // A challenge belongs to the report if its week overlaps the period.
  const items = challenges
    .filter(c => c.weekStart <= periodEnd && c.weekEnd >= periodStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .map(c => ({
      title: c.title,
      status: c.status,
      target: c.metric.target,
      unit: c.metric.unit,
      progressValue: c.progressValue ?? null,
    }));
  return { items };
}
