import { Diet, NutritionProgram, NutritionPhase, OnboardingData, BodyweightLog, DietCompletionLog, StepLog } from '../types';
import { computePhaseStartDate } from '../dbService';
import { estimateMaintenanceKcal, KCAL_PER_KG } from './energyCalc';
import { exchangeToKcal } from './nutritionConstants';

// Deterministic engine that turns a NutritionProgram (phases with weeks +
// linked diet) into a week-by-week weight projection, contrasts it with the
// athlete's actual logged weight, and backs out how the athlete's real
// metabolism/adherence compares to what was assumed when the phase was
// planned. No LLM — every number here is reproducible from the same inputs.

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

function weekIndexOf(programStart: string, date: string): number {
  return Math.floor(daysBetween(programStart, date) / 7);
}

// ── Phase energy plan ───────────────────────────────────────────────────────
// What each phase actually prescribes in kcal, resolved from either an
// explicit override or the linked diet's exchange budget.

export interface PhaseEnergyPlan {
  phaseId: string;
  startDate: string;
  endDate: string;
  weeks: number;
  targetKcal: number | null;
  targetExchanges: number | null; // targetKcal / 100 — cosmetic, matches the coach's "1 intercambio ≈ 100 kcal" mental model
  source: 'manual' | 'diet' | 'none';
}

export function resolvePhaseTargetKcal(
  phase: NutritionPhase,
  diet: Diet | undefined,
): { kcal: number | null; source: 'manual' | 'diet' | 'none' } {
  if (phase.targetKcal != null) return { kcal: phase.targetKcal, source: 'manual' };
  if (diet) return { kcal: exchangeToKcal(diet.budget), source: 'diet' };
  return { kcal: null, source: 'none' };
}

export function buildPhaseEnergyPlans(program: NutritionProgram, diets: Diet[]): PhaseEnergyPlan[] {
  const dietsById = new Map(diets.map(d => [d.id, d]));
  return program.phases.map((phase, idx) => {
    const startDate = computePhaseStartDate(program, idx);
    const endDate = addDays(startDate, phase.weeks * 7);
    const { kcal, source } = resolvePhaseTargetKcal(phase, dietsById.get(phase.dietId));
    return {
      phaseId: phase.id, startDate, endDate, weeks: phase.weeks,
      targetKcal: kcal, targetExchanges: kcal != null ? round1(kcal / 100) : null,
      source,
    };
  });
}

// Suggests the kcal/day objective needed to reach targetWeightKg by the end of
// a phase of `weeks`, given the athlete's estimated maintenance and their
// pautado step expenditure. A starting point for the coach, not an override —
// the coach can still type any value into the phase.
export function suggestPhaseTargetKcal(params: {
  currentWeightKg: number;
  targetWeightKg: number;
  weeks: number;
  maintenanceKcal: number;
  stepsKcal: number;
}): number {
  const totalDeltaKg = params.targetWeightKg - params.currentWeightKg;
  const dailyDeltaKcal = (totalDeltaKg * KCAL_PER_KG) / (params.weeks * 7);
  return Math.round(params.maintenanceKcal + params.stepsKcal + dailyDeltaKcal);
}

// ── Phase energy balance (single point-in-time snapshot, e.g. "today") ──────

export interface PhaseEnergyBalance {
  maintenanceKcal: number | null;
  stepsKcal: number;
  totalExpenditure: number | null;
  targetKcal: number | null;
  dailyDeficit: number | null;  // totalExpenditure - targetKcal; positive = deficit (losing weight)
  weeklyDeltaKg: number | null; // negative = losing weight, positive = gaining
}

export function computePhaseEnergyBalance(params: {
  targetKcal: number | null;
  maintenanceKcal: number | null;
  stepGoal: number;
  kcalPerStep: number;
}): PhaseEnergyBalance {
  const stepsKcal = Math.round(params.stepGoal * params.kcalPerStep);
  const totalExpenditure = params.maintenanceKcal != null ? params.maintenanceKcal + stepsKcal : null;
  const dailyDeficit = (totalExpenditure != null && params.targetKcal != null) ? totalExpenditure - params.targetKcal : null;
  const weeklyDeltaKg = dailyDeficit != null ? round2((-dailyDeficit * 7) / KCAL_PER_KG) : null;
  return { maintenanceKcal: params.maintenanceKcal, stepsKcal, totalExpenditure, targetKcal: params.targetKcal, dailyDeficit, weeklyDeltaKg };
}

// ── Weekly bucketing of raw logs ─────────────────────────────────────────────

function bucketAverage(entries: { date: string; value: number }[], programStart: string, weekCount: number): (number | null)[] {
  const sums = new Array(weekCount).fill(0);
  const counts = new Array(weekCount).fill(0);
  for (const { date, value } of entries) {
    const w = weekIndexOf(programStart, date);
    if (w < 0 || w >= weekCount) continue;
    sums[w] += value;
    counts[w]++;
  }
  return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : null));
}

function fillForward(series: (number | null)[]): (number | null)[] {
  const out = [...series];
  for (let i = 1; i < out.length; i++) {
    if (out[i] == null) out[i] = out[i - 1];
  }
  return out;
}

function averageKnown(series: (number | null)[], uptoIdx: number): number | null {
  const known = series.slice(0, uptoIdx + 1).filter((v): v is number => v != null);
  if (known.length === 0) return null;
  return known.reduce((s, v) => s + v, 0) / known.length;
}

export function weeklyDietAdherencePct(
  logs: DietCompletionLog[], diets: Diet[], programStart: string, weekCount: number,
): (number | null)[] {
  const dietsById = new Map(diets.map(d => [d.id, d]));
  const entries = logs
    .map(l => {
      const diet = dietsById.get(l.dietId);
      const totalItems = diet ? diet.meals.reduce((s, m) => s + m.items.length, 0) : 0;
      if (totalItems === 0) return null;
      return { date: l.date, value: Math.min(100, (l.doneItemIds.length / totalItems) * 100) };
    })
    .filter((x): x is { date: string; value: number } => x != null);
  return bucketAverage(entries, programStart, weekCount);
}

export function weeklyStepAdherencePct(
  logs: StepLog[], stepGoal: number, programStart: string, weekCount: number,
): (number | null)[] {
  if (stepGoal <= 0) return new Array(weekCount).fill(null);
  const entries = logs.map(l => ({ date: l.date, value: Math.min(100, (l.steps / stepGoal) * 100) }));
  return bucketAverage(entries, programStart, weekCount);
}

export function weeklyRealWeightKg(logs: BodyweightLog[], programStart: string, weekCount: number): (number | null)[] {
  return bucketAverage(logs.map(l => ({ date: l.date, value: l.weight })), programStart, weekCount);
}

function phaseIndexForWeek(program: NutritionProgram, week: number): number | null {
  if (program.phases.length === 0) return null;
  let cum = 0;
  for (let i = 0; i < program.phases.length; i++) {
    cum += program.phases[i].weeks;
    if (week < cum) return i;
  }
  return program.phases.length - 1; // the final projection point (week === totalWeeks) belongs to the last phase
}

// Picks the bodyweight log closest in time to the program's start date (before
// or after), so a recent weigh-in taken a few days early/late still anchors
// the projection instead of silently falling back to the onboarding weight.
function resolveStartWeight(logs: BodyweightLog[], programStart: string, onboardingWeight: number | undefined): number | null {
  if (logs.length === 0) return onboardingWeight ?? null;
  let best: BodyweightLog | null = null;
  let bestDist = Infinity;
  for (const l of logs) {
    const dist = Math.abs(daysBetween(programStart, l.date));
    if (dist < bestDist) { best = l; bestDist = dist; }
  }
  return best?.weight ?? onboardingWeight ?? null;
}

// ── Weekly weight projection ─────────────────────────────────────────────────

export interface WeeklyProjectionPoint {
  week: number;
  date: string;
  phaseId: string | null;
  targetKcal: number | null;
  expected100: number | null;       // projected weight assuming 100% adherence to the plan
  expectedAdherence: number | null; // projected weight using the athlete's actual (or averaged) adherence
  real: number | null;              // athlete's logged weight, forward-filled from the nearest prior weigh-in
  isProjected: boolean;             // true for weeks beyond "today" — no real data yet, pure forecast
}

export interface ProjectionResult {
  points: WeeklyProjectionPoint[];
  currentWeek: number;
  totalWeeks: number;
  startWeightKg: number | null;
  dietAdherenceWeekly: (number | null)[];
  stepAdherenceWeekly: (number | null)[];
}

export function buildWeightProjection(params: {
  program: NutritionProgram;
  plans: PhaseEnergyPlan[]; // aligned with program.phases by index (see buildPhaseEnergyPlans)
  diets: Diet[];
  onboarding: OnboardingData | null;
  bodyweightLogs: BodyweightLog[];
  completionLogs: DietCompletionLog[];
  stepLogs: StepLog[];
  stepGoal: number;
  kcalPerStep: number;
  today: string;
}): ProjectionResult {
  const { program, plans, diets, onboarding, bodyweightLogs, completionLogs, stepLogs, stepGoal, kcalPerStep, today } = params;
  const totalWeeks = program.phases.reduce((s, p) => s + p.weeks, 0);
  const empty: ProjectionResult = { points: [], currentWeek: 0, totalWeeks, startWeightKg: null, dietAdherenceWeekly: [], stepAdherenceWeekly: [] };
  if (totalWeeks === 0 || !program.startDate) return empty;

  const currentWeek = Math.max(0, Math.min(totalWeeks, weekIndexOf(program.startDate, today)));
  const weekCount = totalWeeks + 1;

  const startWeightKg = resolveStartWeight(bodyweightLogs, program.startDate, onboarding?.weightKg);
  if (startWeightKg == null) return { ...empty, currentWeek };

  const realWeekly = fillForward(weeklyRealWeightKg(bodyweightLogs, program.startDate, weekCount));
  const coachDiets = diets.filter(d => !d.selfManaged);
  const dietAdherenceWeekly = weeklyDietAdherencePct(completionLogs, coachDiets, program.startDate, weekCount);
  const stepAdherenceWeekly = weeklyStepAdherencePct(stepLogs, stepGoal, program.startDate, weekCount);
  const stepsKcalPautado = Math.round(stepGoal * kcalPerStep);

  const points: WeeklyProjectionPoint[] = [];
  let weight100 = startWeightKg;
  let weightAdh = startWeightKg;

  for (let week = 0; week < weekCount; week++) {
    const date = addDays(program.startDate, week * 7);
    const phaseIdx = phaseIndexForWeek(program, week);
    const plan = phaseIdx != null ? plans[phaseIdx] : null;
    const phaseId = plan?.phaseId ?? null;
    const targetKcal = plan?.targetKcal ?? null;

    if (week > 0) {
      // 100%-adherence curve: BMR recomputed off the evolving projected weight so the
      // deficit shrinks as the athlete's body (and thus maintenance) gets smaller.
      const maintenance100 = estimateMaintenanceKcal(onboarding ?? {}, weight100);
      if (targetKcal != null && maintenance100 != null) {
        const dailyDeficit100 = (maintenance100 + stepsKcalPautado) - targetKcal;
        weight100 = weight100 + (-dailyDeficit100 * 7) / KCAL_PER_KG;
      }

      // Adherence-adjusted curve: scales both intake and step expenditure by the
      // athlete's logged compliance for that week (or the running average once
      // we're forecasting past "today", since there's no log yet to read).
      const dietPct = dietAdherenceWeekly[week] ?? averageKnown(dietAdherenceWeekly, currentWeek) ?? 100;
      const stepPct = stepAdherenceWeekly[week] ?? averageKnown(stepAdherenceWeekly, currentWeek) ?? 100;
      const maintenanceAdh = estimateMaintenanceKcal(onboarding ?? {}, weightAdh);
      if (targetKcal != null && maintenanceAdh != null) {
        const actualIntake = targetKcal * (dietPct / 100);
        const actualStepsKcal = stepsKcalPautado * (stepPct / 100);
        const dailyDeficitAdh = (maintenanceAdh + actualStepsKcal) - actualIntake;
        weightAdh = weightAdh + (-dailyDeficitAdh * 7) / KCAL_PER_KG;
      }
    }

    points.push({
      week, date, phaseId, targetKcal,
      expected100: round2(weight100),
      expectedAdherence: round2(weightAdh),
      // Never forward-fill real weight past "today" — a flat line into the future
      // would look like data when it's just the projection's absence of one.
      real: week <= currentWeek ? (realWeekly[week] ?? null) : null,
      isProjected: week > currentWeek,
    });
  }

  return { points, currentWeek, totalWeeks, startWeightKg, dietAdherenceWeekly, stepAdherenceWeekly };
}

// ── Performance: deviation vs plan + real-metabolism recalibration ──────────

export interface PeriodizationPerformance {
  currentWeek: number;
  totalWeeks: number;
  startWeightKg: number | null;
  expected100ToDate: number | null;
  expectedAdherenceToDate: number | null;
  realToDate: number | null;
  deviationKg: number | null;             // realToDate - expected100ToDate
  achievedPct: number | null;             // % of the planned total change that has actually materialized
  explainedByAdherenceKg: number | null;  // expectedAdherence - expected100 — the slice of the gap explained by logged (non-)compliance
  explainedByMetabolicKg: number | null;  // real - expectedAdherence — the residual, attributed to estimation/metabolic error
  estimatedMaintenanceKcal: number | null; // Mifflin-St Jeor estimate at the athlete's current real weight
  realMaintenanceKcal: number | null;      // backed out from actual intake/steps/weight change over the recent window
  maintenanceGapKcal: number | null;       // realMaintenanceKcal - estimatedMaintenanceKcal
}

const REAL_MAINTENANCE_WINDOW_WEEKS = 4;

export function computePeriodizationPerformance(params: {
  projection: ProjectionResult;
  onboarding: OnboardingData | null;
  stepGoal: number;
  kcalPerStep: number;
  windowWeeks?: number;
}): PeriodizationPerformance {
  const { projection, onboarding, stepGoal, kcalPerStep } = params;
  const { points, currentWeek, totalWeeks, startWeightKg, dietAdherenceWeekly, stepAdherenceWeekly } = projection;
  const empty: PeriodizationPerformance = {
    currentWeek, totalWeeks, startWeightKg: null,
    expected100ToDate: null, expectedAdherenceToDate: null, realToDate: null,
    deviationKg: null, achievedPct: null, explainedByAdherenceKg: null, explainedByMetabolicKg: null,
    estimatedMaintenanceKcal: null, realMaintenanceKcal: null, maintenanceGapKcal: null,
  };
  if (points.length === 0 || startWeightKg == null) return empty;

  const todayPoint = points[Math.min(currentWeek, points.length - 1)];
  const expected100ToDate = todayPoint.expected100;
  const expectedAdherenceToDate = todayPoint.expectedAdherence;
  const realToDate = todayPoint.real;

  const deviationKg = (realToDate != null && expected100ToDate != null) ? round2(realToDate - expected100ToDate) : null;
  const plannedTotalChange = expected100ToDate != null ? expected100ToDate - startWeightKg : null;
  const actualTotalChange = realToDate != null ? realToDate - startWeightKg : null;
  const achievedPct = (plannedTotalChange != null && actualTotalChange != null && Math.abs(plannedTotalChange) > 0.05)
    ? Math.round((actualTotalChange / plannedTotalChange) * 100)
    : null;

  const explainedByAdherenceKg = (expectedAdherenceToDate != null && expected100ToDate != null)
    ? round2(expectedAdherenceToDate - expected100ToDate) : null;
  const explainedByMetabolicKg = (realToDate != null && expectedAdherenceToDate != null)
    ? round2(realToDate - expectedAdherenceToDate) : null;

  const stepsKcalPautado = Math.round(stepGoal * kcalPerStep);
  const windowWeeks = params.windowWeeks ?? REAL_MAINTENANCE_WINDOW_WEEKS;
  const realMaintenanceKcal = computeRealMaintenanceKcal(points, dietAdherenceWeekly, stepAdherenceWeekly, stepsKcalPautado, currentWeek, windowWeeks);
  const estimatedMaintenanceKcal = estimateMaintenanceKcal(onboarding ?? {}, realToDate ?? startWeightKg);
  const maintenanceGapKcal = (realMaintenanceKcal != null && estimatedMaintenanceKcal != null)
    ? realMaintenanceKcal - estimatedMaintenanceKcal : null;

  return {
    currentWeek, totalWeeks, startWeightKg,
    expected100ToDate, expectedAdherenceToDate, realToDate,
    deviationKg, achievedPct, explainedByAdherenceKg, explainedByMetabolicKg,
    estimatedMaintenanceKcal, realMaintenanceKcal, maintenanceGapKcal,
  };
}

// Backs out the athlete's real maintenance from an energy-balance identity over
// a recent window: weightDeltaKg × 7700 = totalIntake − totalExpenditure(days).
// Solving for the (unknown) maintenance term inside totalExpenditure:
//   maintenance = avgIntake − avgActualStepsKcal − (weightDeltaKg × 7700) / days
// Approximates actual intake as the phase's target kcal scaled by logged diet
// adherence (%), since the app tracks "items marked done" rather than kcal eaten.
function computeRealMaintenanceKcal(
  points: WeeklyProjectionPoint[],
  dietAdherenceWeekly: (number | null)[],
  stepAdherenceWeekly: (number | null)[],
  stepsKcalPautado: number,
  currentWeek: number,
  windowWeeks: number,
): number | null {
  const from = Math.max(0, currentWeek - windowWeeks);
  const rows: { targetKcal: number; dietPct: number; stepPct: number; realWeight: number }[] = [];
  for (let w = from; w <= currentWeek; w++) {
    const p = points[w];
    const dietPct = dietAdherenceWeekly[w];
    const stepPct = stepAdherenceWeekly[w];
    if (!p || p.targetKcal == null || p.real == null || dietPct == null || stepPct == null) continue;
    rows.push({ targetKcal: p.targetKcal, dietPct, stepPct, realWeight: p.real });
  }
  if (rows.length < 2) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const weightDeltaKg = last.realWeight - first.realWeight;
  const avgIntakeKcal = rows.reduce((s, r) => s + r.targetKcal * (r.dietPct / 100), 0) / rows.length;
  const avgStepsKcalActual = rows.reduce((s, r) => s + stepsKcalPautado * (r.stepPct / 100), 0) / rows.length;
  const days = (rows.length - 1) * 7;
  if (days <= 0) return null;
  return Math.round(avgIntakeKcal - avgStepsKcalActual - (weightDeltaKg * KCAL_PER_KG) / days);
}
