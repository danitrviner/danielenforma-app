import { Diet, DietCompletionLog, StepLog, BodyweightLog, OnboardingData, FoodCategory, MenuCompletionLog, WeeklyMenu, WeekDay } from '../types';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Deterministic rule-based nutrition analysis engine for the coach-only AI
// dashboard. No LLM/external API — every threshold below is a named,
// overridable parameter rather than a value baked into the logic, so future
// tuning doesn't require touching the computation functions themselves.

export interface AnalysisThresholds {
  windowDays: number;        // how many recent days to consider
  adherenceOkPct: number;    // ≥ this % of exchanges done → "on track"
  macroDeviationOkPct: number; // ≤ this % deviation from target → "on track"
}

export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  windowDays: 14,
  adherenceOkPct: 80,
  macroDeviationOkPct: 15,
};

function recentDates(windowDays: number): Set<string> {
  const dates = new Set<string>();
  const now = new Date();
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.add(d.toISOString().split('T')[0]);
  }
  return dates;
}

export interface AdherenceResult {
  daysLogged: number;
  windowDays: number;
  avgPct: number; // 0-100, average % of the day's diet items marked done, across logged days
}

export function computeAdherenceRate(
  logs: DietCompletionLog[],
  diets: Diet[],
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): AdherenceResult {
  const window = recentDates(thresholds.windowDays);
  const inWindow = logs.filter(l => window.has(l.date));
  if (inWindow.length === 0) return { daysLogged: 0, windowDays: thresholds.windowDays, avgPct: 0 };

  const dietsById = new Map(diets.map(d => [d.id, d]));
  const pcts = inWindow.map(log => {
    const diet = dietsById.get(log.dietId);
    const totalItems = diet ? diet.meals.reduce((s, m) => s + m.items.length, 0) : 0;
    if (totalItems === 0) return 0;
    return Math.min(100, (log.doneItemIds.length / totalItems) * 100);
  });
  const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  return { daysLogged: inWindow.length, windowDays: thresholds.windowDays, avgPct };
}

// Menu adherence: over the window, the average % of a day's menu meals the
// athlete ticked off. The denominator is the number of meals the menu has for
// that weekday (menus can have different meals per day), derived from the log's
// date. Lives beside computeAdherenceRate but is a fully separate signal —
// menu completion is tracked in its own collection (see MenuCompletionLog).
export function computeMenuAdherenceRate(
  logs: MenuCompletionLog[],
  menu: WeeklyMenu | null,
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): AdherenceResult {
  const window = recentDates(thresholds.windowDays);
  if (!menu) return { daysLogged: 0, windowDays: thresholds.windowDays, avgPct: 0 };
  const mealsByDay = new Map<WeekDay, number>(menu.days.map(d => [d.day, d.meals.length]));

  const inWindow = logs.filter(l => l.menuId === menu.id && window.has(l.date));
  const pcts: number[] = [];
  for (const log of inWindow) {
    const jsDay = new Date(`${log.date}T00:00:00`).getDay();
    const weekday = WEEK_DAYS[(jsDay + 6) % 7];
    const total = mealsByDay.get(weekday) ?? 0;
    if (total === 0) continue;
    pcts.push(Math.min(100, (log.doneMealKeys.length / total) * 100));
  }
  if (pcts.length === 0) return { daysLogged: 0, windowDays: thresholds.windowDays, avgPct: 0 };
  const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  return { daysLogged: pcts.length, windowDays: thresholds.windowDays, avgPct };
}

export interface StepCompletionResult {
  daysLogged: number;
  windowDays: number;
  avgPct: number; // 0-100, average % of daily step goal reached
}

export function computeStepCompletionRate(
  logs: StepLog[],
  stepGoal: number,
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): StepCompletionResult {
  const window = recentDates(thresholds.windowDays);
  const inWindow = logs.filter(l => window.has(l.date));
  if (inWindow.length === 0 || stepGoal <= 0) return { daysLogged: inWindow.length, windowDays: thresholds.windowDays, avgPct: 0 };
  const avgPct = Math.round(inWindow.reduce((s, l) => s + Math.min(100, (l.steps / stepGoal) * 100), 0) / inWindow.length);
  return { daysLogged: inWindow.length, windowDays: thresholds.windowDays, avgPct };
}

export interface MacroDeviationResult {
  category: FoodCategory;
  targetGrams: number;
  planGrams: number;
  deviationPct: number; // signed: positive = plan exceeds target
}

// Compares the athlete's active diet's exchange budget (converted to grams)
// against the onboarding target grams — a "does the plan match the goal"
// signal, independent of day-to-day adherence.
export function computeMacroDeviation(diet: Diet | null, onboarding: OnboardingData | null): MacroDeviationResult[] {
  if (!diet || !onboarding) return [];
  const cats: ('HC' | 'PROT' | 'GRASA')[] = ['HC', 'PROT', 'GRASA'];
  const targetByCat: Record<'HC' | 'PROT' | 'GRASA', number> = {
    HC: onboarding.macroGrams.hc, PROT: onboarding.macroGrams.prot, GRASA: onboarding.macroGrams.grasa,
  };
  return cats.map(cat => {
    const planGrams = round1(diet.budget[cat] * GRAMS_PER_EXCHANGE[cat]);
    const targetGrams = targetByCat[cat];
    const deviationPct = targetGrams > 0 ? round1(((planGrams - targetGrams) / targetGrams) * 100) : 0;
    return { category: cat, targetGrams, planGrams, deviationPct };
  });
}

export interface WeightTrendResult {
  latestWeight: number | null;
  deltaFromFirst: number | null; // kg, over the window
  towardsTarget: boolean | null; // null when no targetWeight to compare against
}

export function computeWeightTrend(
  logs: BodyweightLog[],
  targetWeight: number | undefined,
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): WeightTrendResult {
  const window = recentDates(thresholds.windowDays);
  const inWindow = logs.filter(l => window.has(l.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (inWindow.length === 0) return { latestWeight: null, deltaFromFirst: null, towardsTarget: null };
  const first = inWindow[0].weight;
  const latest = inWindow[inWindow.length - 1].weight;
  const delta = round1(latest - first);
  const towardsTarget = targetWeight == null ? null : (
    targetWeight === first ? Math.abs(latest - targetWeight) <= Math.abs(delta) :
    targetWeight > first ? latest >= first : latest <= first
  );
  return { latestWeight: latest, deltaFromFirst: delta, towardsTarget };
}

export interface NutritionReport {
  generatedAt: string;
  adherence: AdherenceResult;
  steps: StepCompletionResult;
  macroDeviation: MacroDeviationResult[];
  weightTrend: WeightTrendResult;
  flags: string[];
  summary: string;
}

export function detectDeficitsExcesses(
  adherence: AdherenceResult,
  macroDeviation: MacroDeviationResult[],
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): string[] {
  const flags: string[] = [];
  if (adherence.daysLogged > 0 && adherence.avgPct < thresholds.adherenceOkPct) {
    flags.push(`Adherencia baja: ${adherence.avgPct}% de intercambios completados (últimos ${adherence.windowDays} días).`);
  }
  macroDeviation.forEach(m => {
    if (Math.abs(m.deviationPct) > thresholds.macroDeviationOkPct) {
      const dir = m.deviationPct > 0 ? 'exceso' : 'déficit';
      flags.push(`${dir === 'exceso' ? 'Exceso' : 'Déficit'} de ${m.category} en el plan: ${m.planGrams}g vs ${m.targetGrams}g objetivo (${m.deviationPct > 0 ? '+' : ''}${m.deviationPct}%).`);
    }
  });
  return flags;
}

export function buildNutritionReport(params: {
  completionLogs: DietCompletionLog[];
  diets: Diet[];
  activeDiet: Diet | null;
  stepLogs: StepLog[];
  stepGoal: number;
  bodyweightLogs: BodyweightLog[];
  targetWeight?: number;
  onboarding: OnboardingData | null;
  thresholds?: AnalysisThresholds;
}): NutritionReport {
  const thresholds = params.thresholds ?? DEFAULT_THRESHOLDS;
  const adherence = computeAdherenceRate(params.completionLogs, params.diets, thresholds);
  const steps = computeStepCompletionRate(params.stepLogs, params.stepGoal, thresholds);
  const macroDeviation = computeMacroDeviation(params.activeDiet, params.onboarding);
  const weightTrend = computeWeightTrend(params.bodyweightLogs, params.targetWeight, thresholds);
  const flags = detectDeficitsExcesses(adherence, macroDeviation, thresholds);

  const summaryParts = [
    adherence.daysLogged > 0 ? `Adherencia media: ${adherence.avgPct}% (${adherence.daysLogged} días registrados).` : 'Sin registros de adherencia recientes.',
    steps.daysLogged > 0 ? `Objetivo de pasos cumplido al ${steps.avgPct}% de media.` : 'Sin registros de pasos recientes.',
    weightTrend.latestWeight != null ? `Peso actual: ${weightTrend.latestWeight}kg (${weightTrend.deltaFromFirst! >= 0 ? '+' : ''}${weightTrend.deltaFromFirst}kg en la ventana).` : 'Sin registros de peso recientes.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    adherence,
    steps,
    macroDeviation,
    weightTrend,
    flags,
    summary: summaryParts.join(' '),
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
