import {
  Diet, DietCompletionLog, StepLog, BodyweightLog, OnboardingData, FoodCategory,
  MenuCompletionLog, WeeklyMenu, WeekDay, NutritionPhase,
} from '../types';
import { GRAMS_PER_EXCHANGE } from './nutritionConstants';
import { adherenciaDelDia, adherenciaPorIntercambios } from './diaDeDieta';
import { hoyIsoLocal, addDays } from './trainingWeek';

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Deterministic rule-based nutrition analysis engine for the coach-only AI
// dashboard. No LLM/external API — every threshold below is a named,
// overridable parameter rather than a value baked into the logic, so future
// tuning doesn't require touching the computation functions themselves.

export interface AnalysisThresholds {
  windowDays: number;        // how many recent days to consider
  adherenceOkPct: number;    // ≥ this % of exchanges done → "on track"
  macroDeviationOkPct: number; // ≤ this % deviation from target → "on track"
  /**
   * Ventana explícita `YYYY-MM-DD`, ambas inclusive. Sin ella se usan los
   * últimos `windowDays` contando hacia atrás desde hoy, que es lo que quiere
   * un panel que se abre solo; la Revisión, en cambio, tiene su propio periodo
   * elegido arriba (7 días, 14, el bloque entero) y necesita que la adherencia
   * y los pasos hablen de ESA ventana y no de otra distinta, o el coach lee en
   * la misma pantalla dos números que no son comparables.
   */
  ventana?: { desde: string; hasta: string };
}

export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  windowDays: 14,
  adherenceOkPct: 80,
  macroDeviationOkPct: 15,
};

/**
 * Las fechas que entran en el análisis: la ventana explícita si la hay, y si no
 * los últimos `windowDays` hasta hoy. En fecha LOCAL, no UTC: con
 * `toISOString()` un registro guardado a las 00:30 de Madrid caía en el día
 * anterior y la ventana se comía un día por un extremo y se dejaba otro fuera.
 */
function fechasDeLaVentana(t: AnalysisThresholds): Set<string> {
  const dates = new Set<string>();
  if (t.ventana) {
    for (let d = t.ventana.desde; d <= t.ventana.hasta; d = addDays(d, 1)) dates.add(d);
    return dates;
  }
  const hoy = hoyIsoLocal();
  for (let i = 0; i < t.windowDays; i++) dates.add(addDays(hoy, -i));
  return dates;
}

/** Cuántos días abarca el análisis — para los textos que dicen «últimos N días». */
function diasDeLaVentana(t: AnalysisThresholds): number {
  return t.ventana ? fechasDeLaVentana(t).size : t.windowDays;
}

export interface AdherenceResult {
  daysLogged: number;
  windowDays: number;
  /**
   * Adherencia media de la ventana, medida en INTERCAMBIOS: lo que comió
   * dividido entre su cupo. Puede pasar de 100 — comer de más es un dato, y
   * recortarlo haría que un atleta que se pasa se viera idéntico a uno que
   * cumple.
   *
   * Antes esto era «líneas marcadas ÷ líneas puestas», que desde que en «Mi
   * plan» todo lo que el atleta añade nace ya marcado daba 100 % comiera lo que
   * comiera, y trataba igual media cucharada de aceite que 200 g de pollo.
   */
  avgPct: number;
  /** Días de la ventana con cupo, que son los únicos que entran en `avgPct`. */
  daysWithBudget: number;
  /**
   * La cuenta vieja, por líneas marcadas. Se conserva porque hay histórico
   * calculado así y porque en un plan que dicta el coach de verdad todavía
   * significa algo — pero no es la que se enseña.
   */
  avgPctPorLineas: number;
}

export function computeAdherenceRate(
  logs: DietCompletionLog[],
  diets: Diet[],
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS,
): AdherenceResult {
  const window = fechasDeLaVentana(thresholds);
  const dias = diasDeLaVentana(thresholds);
  const inWindow = logs.filter(l => window.has(l.date));
  if (inWindow.length === 0) {
    return { daysLogged: 0, windowDays: dias, avgPct: 0, daysWithBudget: 0, avgPctPorLineas: 0 };
  }

  const porLineas = inWindow.map(log => adherenciaDelDia(log, diets) ?? 0);
  const avgPctPorLineas = Math.round(porLineas.reduce((s, p) => s + p, 0) / porLineas.length);

  // Solo los días CON cupo: sin objetivo no hay nada que cumplir, y meterlos
  // como ceros hundiría la media de alguien que simplemente no tenía dieta
  // puesta ese día.
  const conCupo = inWindow
    .map(log => adherenciaPorIntercambios(log, diets))
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const avgPct = conCupo.length > 0
    ? Math.round(conCupo.reduce((s, a) => s + a.pct, 0) / conCupo.length)
    : 0;

  return {
    daysLogged: inWindow.length,
    windowDays: dias,
    avgPct,
    daysWithBudget: conCupo.length,
    avgPctPorLineas,
  };
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
  const window = fechasDeLaVentana(thresholds);
  const dias = diasDeLaVentana(thresholds);
  // El menú semanal no tiene cupo de intercambios: su adherencia es por
  // comidas tildadas y punto. Los campos de intercambios van a cero.
  if (!menu) return { daysLogged: 0, windowDays: dias, avgPct: 0, daysWithBudget: 0, avgPctPorLineas: 0 };
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
  if (pcts.length === 0) return { daysLogged: 0, windowDays: dias, avgPct: 0, daysWithBudget: 0, avgPctPorLineas: 0 };
  const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
  return { daysLogged: pcts.length, windowDays: dias, avgPct, daysWithBudget: 0, avgPctPorLineas: avgPct };
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
  const window = fechasDeLaVentana(thresholds);
  const dias = diasDeLaVentana(thresholds);
  const inWindow = logs.filter(l => window.has(l.date));
  if (inWindow.length === 0 || stepGoal <= 0) return { daysLogged: inWindow.length, windowDays: dias, avgPct: 0 };
  const avgPct = Math.round(inWindow.reduce((s, l) => s + Math.min(100, (l.steps / stepGoal) * 100), 0) / inWindow.length);
  return { daysLogged: inWindow.length, windowDays: dias, avgPct };
}

export interface MacroDeviationResult {
  category: FoodCategory;
  targetGrams: number;
  planGrams: number;
  deviationPct: number; // signed: positive = plan exceeds target
}

/**
 * Compara el presupuesto de la dieta activa (pasado a gramos) con el objetivo
 * del atleta.
 *
 * ── Contra QUÉ objetivo ────────────────────────────────────────────────────
 * Hasta ahora, siempre contra los gramos del ALTA, que se calcularon para
 * mantener. Eso convertía la señal en ruido justo para los clientes que están
 * haciendo algo: un atleta en una fase de déficit de 2.050 kcal, con su dieta
 * bien montada para esa fase, salía con «déficit de GRASA: 44 g vs 68 g
 * (−35 %)» y una alerta en rojo. Y esa alerta la lee después el asistente, que
 * propone «subir la grasa» de un plan que está exactamente donde debe estar.
 *
 * Con periodización, el objetivo es el de la FASE ACTIVA: sus kcal repartidas
 * con el mismo `macroSplit` del alta. Sin periodización se sigue usando el
 * alta, que es lo único que hay.
 */
export function computeMacroDeviation(
  diet: Diet | null,
  onboarding: OnboardingData | null,
  /** La fase que rige hoy, si el atleta tiene periodización. */
  faseActiva?: NutritionPhase | null,
): MacroDeviationResult[] {
  // `macroGrams` figura como obligatorio en el tipo, pero el documento de
  // Firestore no siempre lo trae: las altas anteriores a que se calculara, y
  // las que se guardaron a medias, llegan sin él. Leerlo a ciegas reventaba el
  // panel entero con «Cannot read properties of undefined (reading 'hc')», y
  // como quien llamaba lo envolvía en un try/catch, el coach no veía un error
  // sino la pantalla vacía con un «sin datos suficientes» que era mentira: los
  // datos estaban, lo que faltaba era el objetivo contra el que compararlos.
  // Sin objetivo no hay desviación que calcular, y eso se dice callando esta
  // sección, no tumbando las otras cuatro.
  if (!diet || !onboarding?.macroGrams) return [];
  const cats: ('HC' | 'PROT' | 'GRASA')[] = ['HC', 'PROT', 'GRASA'];
  const targetByCat = objetivoEnGramos(onboarding, faseActiva ?? null);
  return cats.flatMap(cat => {
    const targetGrams = targetByCat[cat];
    if (typeof targetGrams !== 'number' || !Number.isFinite(targetGrams)) return [];
    const planGrams = round1(diet.budget[cat] * GRAMS_PER_EXCHANGE[cat]);
    const deviationPct = targetGrams > 0 ? round1(((planGrams - targetGrams) / targetGrams) * 100) : 0;
    return [{ category: cat, targetGrams, planGrams, deviationPct }];
  });
}

/**
 * Los gramos objetivo de cada macro.
 *
 * Con fase activa y kcal declaradas, se reparten esas kcal con el `macroSplit`
 * del alta —el reparto es criterio del coach y no cambia porque cambien las
 * kcal— y se pasan a gramos con 4/4/9. Sin fase, los gramos del alta tal cual.
 */
export function objetivoEnGramos(
  onboarding: OnboardingData,
  faseActiva: NutritionPhase | null,
): Record<'HC' | 'PROT' | 'GRASA', number> {
  const delAlta = {
    HC: onboarding.macroGrams.hc,
    PROT: onboarding.macroGrams.prot,
    GRASA: onboarding.macroGrams.grasa,
  };
  const kcalFase = faseActiva?.targetKcal;
  const split = onboarding.macroSplit;
  if (!kcalFase || kcalFase <= 0 || !split) return delAlta;

  return {
    HC: round1((kcalFase * (split.hc / 100)) / 4),
    PROT: round1((kcalFase * (split.prot / 100)) / 4),
    GRASA: round1((kcalFase * (split.grasa / 100)) / 9),
  };
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
  const window = fechasDeLaVentana(thresholds);
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
  // Solo se avisa si de verdad hay días CON cupo: sin objetivo la media es 0 y
  // saldría una alerta de adherencia baja para alguien que aún no tiene dieta.
  if (adherence.daysWithBudget > 0 && adherence.avgPct < thresholds.adherenceOkPct) {
    flags.push(`Adherencia baja: se ha comido el ${adherence.avgPct}% de su cupo de intercambios (últimos ${adherence.windowDays} días).`);
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
  /** La fase de nutrición que rige hoy, si la hay. */
  faseActiva?: NutritionPhase | null;
  thresholds?: AnalysisThresholds;
}): NutritionReport {
  const thresholds = params.thresholds ?? DEFAULT_THRESHOLDS;
  const adherence = computeAdherenceRate(params.completionLogs, params.diets, thresholds);
  const steps = computeStepCompletionRate(params.stepLogs, params.stepGoal, thresholds);
  const macroDeviation = computeMacroDeviation(params.activeDiet, params.onboarding, params.faseActiva ?? null);
  const weightTrend = computeWeightTrend(params.bodyweightLogs, params.targetWeight, thresholds);
  const flags = detectDeficitsExcesses(adherence, macroDeviation, thresholds);

  const summaryParts = [
    adherence.daysWithBudget > 0
      ? `Adherencia media: ${adherence.avgPct}% de su cupo (${adherence.daysWithBudget} de ${adherence.daysLogged} días registrados tenían dieta puesta).`
      : adherence.daysLogged > 0
        ? `Registra la comida (${adherence.daysLogged} días) pero no tenía cupo puesto, así que no hay adherencia que medir.`
        : 'Sin registros de adherencia recientes.',
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
