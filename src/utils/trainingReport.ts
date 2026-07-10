import { WorkoutLog, Exercise, Mesocycle, MuscleGroup, MUSCLE_LABELS } from '../types';
import { epley } from './oneRepMax';
import { addDays } from './trainingWeek';

// Deterministic training-performance report engine (no LLM/external API), same
// style as src/utils/nutritionAnalysis.ts. Powers the weekly report the coach
// reviews and sends to the athlete: total tonnage, per-exercise performance,
// and joint muscle-group progression (tonnage AND estimated 1RM) against a
// comparison window of X weeks or the previous mesocycle.

export type ComparisonMode =
  | { mode: 'weeks'; n: number }                                   // vs same-length window, n weeks earlier
  | { mode: 'mesocycle'; currentId: string; previousId: string | null };

const NONE_GROUP = 'none' as const;
type GroupKey = MuscleGroup | typeof NONE_GROUP;

export interface ExercisePerf {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  tonnage: number;
  bestOrm: number;               // best Epley 1RM in the current period
  prevBestOrm: number | null;    // best Epley in the comparison window
  deltaOrmPct: number | null;    // signed % vs prevBestOrm
  isPR: boolean;                 // bestOrm beats the all-time best BEFORE this period
}

export interface MuscleGroupPerf {
  group: GroupKey;
  label: string;
  tonnage: number;
  tonnageDeltaPct: number | null;
  meanOrm: number | null;        // mean of per-exercise bestOrm within the group
  ormDeltaPct: number | null;
}

export interface TrainingReport {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  comparisonLabel: string;       // e.g. "vs 4 semanas antes" / "vs Macrociclo 1"
  sessions: number;              // distinct training days in the current period
  tonnage: { current: number; previous: number | null; deltaPct: number | null };
  perExercise: ExercisePerf[];
  muscleGroups: MuscleGroupPerf[];
  highlights: string[];          // PRs and standout group changes, coach-facing
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function deltaPct(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

interface Agg {
  tonnage: number;
  perExercise: Map<string, { sets: number; reps: number; tonnage: number; bestOrm: number }>;
  dates: Set<string>;
}

function aggregate(logs: WorkoutLog[]): Agg {
  const perExercise = new Map<string, { sets: number; reps: number; tonnage: number; bestOrm: number }>();
  const dates = new Set<string>();
  let tonnage = 0;
  for (const log of logs) {
    dates.add(log.date);
    for (const entry of log.entries) {
      let row = perExercise.get(entry.exerciseId);
      if (!row) { row = { sets: 0, reps: 0, tonnage: 0, bestOrm: 0 }; perExercise.set(entry.exerciseId, row); }
      for (const s of entry.sets) {
        const w = Number(s.weight) || 0;
        const r = Number(s.repsDone) || 0;
        row.sets++;
        row.reps += r;
        const t = w * r;
        row.tonnage = round1(row.tonnage + t);
        tonnage = round1(tonnage + t);
        const orm = epley(w, r);
        if (orm > row.bestOrm) row.bestOrm = orm;
      }
    }
  }
  return { tonnage, perExercise, dates };
}

// Best all-time Epley per exercise, strictly before `beforeDate` — used for PR detection.
function allTimeBestBefore(logs: WorkoutLog[], beforeDate: string): Map<string, number> {
  const best = new Map<string, number>();
  for (const log of logs) {
    if (log.date >= beforeDate) continue;
    for (const entry of log.entries) {
      for (const s of entry.sets) {
        const orm = epley(s.weight, s.repsDone);
        if (orm > (best.get(entry.exerciseId) ?? 0)) best.set(entry.exerciseId, orm);
      }
    }
  }
  return best;
}

function groupOf(exerciseId: string, exercises: Exercise[]): GroupKey {
  const ex = exercises.find(e => e.id === exerciseId);
  return ex?.muscleGroup ?? NONE_GROUP;
}

// ── Window resolution ─────────────────────────────────────────────────────────

export interface Windows {
  curStart: string; curEnd: string;
  prevStart: string | null; prevEnd: string | null;
  comparisonLabel: string;
}

export function resolveWindows(
  periodStart: string,
  periodEnd: string,
  comparison: ComparisonMode,
  mesocycles: Mesocycle[],
): Windows {
  if (comparison.mode === 'weeks') {
    const shift = comparison.n * 7;
    return {
      curStart: periodStart, curEnd: periodEnd,
      prevStart: addDays(periodStart, -shift), prevEnd: addDays(periodEnd, -shift),
      comparisonLabel: comparison.n === 1 ? 'vs la semana anterior' : `vs ${comparison.n} semanas antes`,
    };
  }
  // mesocycle mode
  const cur = mesocycles.find(m => m.id === comparison.currentId) ?? null;
  const prev = comparison.previousId ? mesocycles.find(m => m.id === comparison.previousId) ?? null : null;
  const curStart = cur?.startDate ?? periodStart;
  const curEnd = cur ? addDays(cur.startDate, cur.weeks * 7 - 1) : periodEnd;
  const prevStart = prev?.startDate ?? null;
  const prevEnd = prev ? addDays(prev.startDate, prev.weeks * 7 - 1) : null;
  return {
    curStart, curEnd, prevStart, prevEnd,
    comparisonLabel: prev ? `vs Macrociclo ${prev.number}` : 'sin macrociclo previo',
  };
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildTrainingReport(params: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  periodStart: string;
  periodEnd: string;
  comparison: ComparisonMode;
}): TrainingReport {
  const { logs, exercises, mesocycles, periodStart, periodEnd, comparison } = params;
  const w = resolveWindows(periodStart, periodEnd, comparison, mesocycles);

  const curLogs = logs.filter(l => inRange(l.date, w.curStart, w.curEnd));
  const prevLogs = w.prevStart && w.prevEnd ? logs.filter(l => inRange(l.date, w.prevStart!, w.prevEnd!)) : [];

  const cur = aggregate(curLogs);
  const prev = aggregate(prevLogs);
  const priorBest = allTimeBestBefore(logs, w.curStart);

  const nameOf = (id: string) => exercises.find(e => e.id === id)?.name ?? `Ejercicio (…${id.slice(-6)})`;

  // Per-exercise
  const perExercise: ExercisePerf[] = Array.from(cur.perExercise.entries())
    .map(([exerciseId, row]) => {
      const prevRow = prev.perExercise.get(exerciseId);
      const prevBestOrm = prevRow ? prevRow.bestOrm : null;
      // A PR must beat existing history — a first-ever exercise (no prior logs)
      // isn't a record, so require a prior best to exist before flagging.
      const prior = priorBest.get(exerciseId);
      const isPR = row.bestOrm > 0 && prior != null && row.bestOrm > prior;
      return {
        exerciseId,
        name: nameOf(exerciseId),
        sets: row.sets,
        reps: row.reps,
        tonnage: row.tonnage,
        bestOrm: row.bestOrm,
        prevBestOrm,
        deltaOrmPct: prevBestOrm != null ? deltaPct(row.bestOrm, prevBestOrm) : null,
        isPR,
      };
    })
    .sort((a, b) => b.tonnage - a.tonnage);

  // Muscle groups — tonnage sum + mean best-orm per exercise, both windows
  const groupAgg = (agg: Agg) => {
    const byGroup = new Map<GroupKey, { tonnage: number; orms: number[] }>();
    for (const [exerciseId, row] of agg.perExercise) {
      const g = groupOf(exerciseId, exercises);
      let bucket = byGroup.get(g);
      if (!bucket) { bucket = { tonnage: 0, orms: [] }; byGroup.set(g, bucket); }
      bucket.tonnage = round1(bucket.tonnage + row.tonnage);
      if (row.bestOrm > 0) bucket.orms.push(row.bestOrm);
    }
    return byGroup;
  };
  const curGroups = groupAgg(cur);
  const prevGroups = groupAgg(prev);
  const meanOf = (arr: number[]) => arr.length ? round1(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  // Order groups by current tonnage descending, with the "Sin grupo" bucket last.
  const orderedKeys: GroupKey[] = Array.from(curGroups.keys()).sort((a, b) => {
    if (a === NONE_GROUP) return 1;
    if (b === NONE_GROUP) return -1;
    return curGroups.get(b)!.tonnage - curGroups.get(a)!.tonnage;
  });

  const muscleGroups: MuscleGroupPerf[] = orderedKeys.map(group => {
    const c = curGroups.get(group)!;
    const p = prevGroups.get(group) ?? null;
    const meanOrm = meanOf(c.orms);
    const prevMeanOrm = p ? meanOf(p.orms) : null;
    return {
      group,
      label: group === NONE_GROUP ? 'Sin grupo' : MUSCLE_LABELS[group],
      tonnage: c.tonnage,
      tonnageDeltaPct: p ? deltaPct(c.tonnage, p.tonnage) : null,
      meanOrm,
      ormDeltaPct: meanOrm != null && prevMeanOrm != null ? deltaPct(meanOrm, prevMeanOrm) : null,
    };
  });

  // Highlights (coach-facing)
  const highlights: string[] = [];
  for (const e of perExercise.filter(e => e.isPR)) {
    const gain = e.prevBestOrm != null ? round1(e.bestOrm - e.prevBestOrm) : null;
    highlights.push(`Nuevo récord en ${e.name}: ${e.bestOrm}kg${gain != null && gain > 0 ? ` (+${gain}kg)` : ''}.`);
  }
  const topGroup = [...muscleGroups]
    .filter(g => g.tonnageDeltaPct != null)
    .sort((a, b) => (b.tonnageDeltaPct ?? 0) - (a.tonnageDeltaPct ?? 0))[0];
  if (topGroup && (topGroup.tonnageDeltaPct ?? 0) > 5) {
    highlights.push(`${topGroup.label} es el grupo que más progresó en volumen (${topGroup.tonnageDeltaPct! > 0 ? '+' : ''}${topGroup.tonnageDeltaPct}%).`);
  }
  const worstGroup = [...muscleGroups]
    .filter(g => g.tonnageDeltaPct != null)
    .sort((a, b) => (a.tonnageDeltaPct ?? 0) - (b.tonnageDeltaPct ?? 0))[0];
  if (worstGroup && (worstGroup.tonnageDeltaPct ?? 0) < -10) {
    highlights.push(`${worstGroup.label} bajó su volumen (${worstGroup.tonnageDeltaPct}%) — revisar si es intencional.`);
  }

  return {
    generatedAt: new Date().toISOString(),
    periodStart: w.curStart,
    periodEnd: w.curEnd,
    comparisonLabel: w.comparisonLabel,
    sessions: cur.dates.size,
    tonnage: {
      current: cur.tonnage,
      previous: prevLogs.length ? prev.tonnage : null,
      deltaPct: prevLogs.length ? deltaPct(cur.tonnage, prev.tonnage) : null,
    },
    perExercise,
    muscleGroups,
    highlights,
  };
}
