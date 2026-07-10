import { BodyweightLog, WorkoutAssignment, DietCompletionLog, Diet, WeeklyChallenge } from '../types';

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
