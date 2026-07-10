// Motor de OPCIONES de reto semanal. Genera una opción por cada tipo viable con
// un score de relevancia: el coach las ve como cards y elige (o no hace nada y
// desde el martes se auto-envía la de mayor score — ver ensureWeeklyChallenge).
// La prioridad estrella son los hitos redondos de carga: si la mejor marca del
// atleta está a un paso de un número redondo (97.5 kg → 100), esa opción gana.
//
// Este módulo es la base de weeklyChallenge.ts (que re-exporta los helpers ISO
// y delega generateAutoChallenge aquí); no debe importar de weeklyChallenge
// para evitar ciclos.

import {
  WeeklyChallenge, ChallengeKind, StepLog, BodyweightLog, WorkoutLog, Exercise,
  DietCompletionLog, Diet, WorkoutAssignment,
} from '../types';
import { ProjectionResult } from './nutritionPeriodization';
import { getWeekStart, addDays } from './trainingWeek';
import { epley } from './oneRepMax';
import { avgSteps, bestSet, dailyDietPcts, lastBodyweight, normalizeText, BestSet } from './athleteMetrics';

// Básicos por defecto para retos de carga (si el coach no configura elegibles).
export const BASIC_LIFT_KEYWORDS = ['sentadilla', 'press banca', 'peso muerto', 'dominada', 'press militar', 'remo'];

export const GENERIC_STEP_TARGET = 8000;

// ── Semana ISO ────────────────────────────────────────────────────────────────

// Clave de semana ISO-8601 ('2026-W28'). El año es el ISO year (el del jueves de
// la semana), que puede diferir del año natural en los bordes de enero/diciembre.
export function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;            // 1=lunes … 7=domingo
  date.setUTCDate(date.getUTCDate() + 4 - dow); // jueves de esta semana
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isoWeekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
  const weekStart = getWeekStart(dateStr);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

// Lunes = margen del coach para elegir opción; el orquestador no auto-crea.
export function isCoachGraceDay(todayISO: string): boolean {
  return new Date(todayISO + 'T00:00:00').getDay() === 1;
}

// ── Datos de entrada ──────────────────────────────────────────────────────────

export interface ChallengeData {
  stepLogs: StepLog[];
  bodyweightLogs: BodyweightLog[];
  workoutLogs: WorkoutLog[];
  exercises: Exercise[];
  completionLogs: DietCompletionLog[];
  coachDiets: Diet[];                    // dietas del coach (sin selfManaged)
  assignments: WorkoutAssignment[];
  projection?: ProjectionResult | null;  // de buildWeightProjection, si hay programa
  liftExerciseIds?: string[];            // elegibles para retos de carga (challengeConfig)
}

export interface AutoChallengeInput extends ChallengeData {
  athleteId: string;
  today: string;                 // YYYY-MM-DD
  previousKind?: ChallengeKind;  // kind de la semana anterior, para rotar
}

// ── Opciones ──────────────────────────────────────────────────────────────────

export interface ChallengeOption {
  kind: ChallengeKind;
  score: number;                       // 0-100, ya con rotación aplicada
  title: string;
  description: string;                 // lo que verá el atleta
  reason: string;                      // por qué se propone — solo para el coach
  metric: WeeklyChallenge['metric'];
  isMilestone?: boolean;               // hito redondo de carga
}

// ── Hitos redondos ────────────────────────────────────────────────────────────

// Siguiente múltiplo redondo ESTRICTO por encima del peso (5 kg en pesos
// pequeños, 10 kg a partir de 40), si está lo bastante cerca para proponerlo
// como reto de la semana. Una marca exactamente en el redondo devuelve null
// (no se repropone el hito ya logrado).
export function nextRoundMilestone(weightKg: number): { milestone: number; distance: number } | null {
  if (weightKg <= 0) return null;
  const step = weightKg < 40 ? 5 : 10;
  const eps = 1e-6;
  const next = Math.floor((weightKg + eps) / step) * step + step;
  const distance = Math.round((next - weightKg) * 10) / 10;
  const threshold = Math.max(2.5, next * 0.03);
  return distance <= threshold + eps ? { milestone: next, distance } : null;
}

// Ejercicios en los que se pueden proponer retos de carga: la config del coach
// si existe, o los básicos por keyword.
export function eligibleLiftIds(exercises: Exercise[], liftExerciseIds?: string[]): Set<string> {
  if (liftExerciseIds && liftExerciseIds.length > 0) return new Set(liftExerciseIds);
  return new Set(
    exercises
      .filter(e => {
        const n = normalizeText(e.name);
        return BASIC_LIFT_KEYWORDS.some(k => n.includes(normalizeText(k)));
      })
      .map(e => e.id),
  );
}

// ── Generación de opciones ────────────────────────────────────────────────────

const ROTATION_PENALTY = 25;

function fmtSteps(n: number): string {
  return Math.round(n).toLocaleString('es-ES');
}

export function generateChallengeOptions(input: AutoChallengeInput): ChallengeOption[] {
  const { weekStart, weekEnd } = isoWeekBounds(input.today);
  const options: ChallengeOption[] = [];
  const histTo = addDays(weekStart, -1);

  // ── Carga: hito redondo (score 100) o progresión (70) ──
  const eligible = eligibleLiftIds(input.exercises, input.liftExerciseIds);
  const liftFrom = addDays(weekStart, -21);
  const nameById = new Map(input.exercises.map(e => [e.id, e.name]));
  const bestByExercise: { exerciseId: string; best: BestSet; freq: number }[] = [];
  {
    const counts = new Map<string, number>();
    for (const log of input.workoutLogs) {
      if (log.date < liftFrom || log.date > histTo) continue;
      for (const entry of log.entries) {
        if (eligible.has(entry.exerciseId) && entry.sets.length > 0) {
          counts.set(entry.exerciseId, (counts.get(entry.exerciseId) ?? 0) + 1);
        }
      }
    }
    for (const [exerciseId, freq] of counts) {
      const best = bestSet(input.workoutLogs, { exerciseIds: new Set([exerciseId]), from: liftFrom, to: histTo });
      if (best) bestByExercise.push({ exerciseId, best, freq });
    }
  }

  const milestones = bestByExercise
    .map(x => ({ ...x, m: nextRoundMilestone(x.best.weight) }))
    .filter((x): x is typeof x & { m: NonNullable<ReturnType<typeof nextRoundMilestone>> } => x.m != null)
    // El hito "más maduro": menor distancia relativa a su umbral.
    .sort((a, b) => (a.m.distance / Math.max(2.5, a.m.milestone * 0.03)) - (b.m.distance / Math.max(2.5, b.m.milestone * 0.03)));

  if (milestones.length > 0) {
    const { exerciseId, best, m } = milestones[0];
    const exerciseName = nameById.get(exerciseId) ?? 'tu básico';
    options.push({
      kind: 'carga_ejercicio',
      score: 100,
      isMilestone: true,
      title: `Ve a por los ${m.milestone} kg en ${exerciseName}`,
      description: `Tu mejor marca: ${best.weight} kg × ${best.reps}. Estás a solo ${m.distance} kg de la barrera de los ${m.milestone}. Esta semana: ${m.milestone} kg a ${best.reps} repeticiones. Un hito para el recuerdo.`,
      reason: `Su mejor marca en ${exerciseName} está a ${m.distance} kg de un número redondo`,
      metric: {
        unit: 'kg (1RM est.)',
        target: epley(m.milestone, best.reps),
        baseline: best.e1rm,
        exerciseId,
        exerciseName,
      },
    });
  } else if (bestByExercise.length > 0) {
    const { exerciseId, best } = [...bestByExercise].sort((a, b) => b.freq - a.freq)[0];
    const exerciseName = nameById.get(exerciseId) ?? 'tu básico';
    const target = Math.min(epley(best.weight + 2.5, best.reps), epley(best.weight, best.reps + 1));
    options.push({
      kind: 'carga_ejercicio',
      score: 70,
      title: `Mejora tu ${exerciseName}`,
      description: `Tu mejor marca reciente: ${best.weight} kg × ${best.reps}. Esta semana: +2,5 kg a las mismas repeticiones, o +1 repetición al mismo peso.`,
      reason: 'Progresión sobre su básico más entrenado',
      metric: { unit: 'kg (1RM est.)', target, baseline: best.e1rm, exerciseId, exerciseName },
    });
  }

  // ── Pasos (media y total, misma viabilidad de datos) ──
  {
    const from = addDays(weekStart, -28);
    const { avg, days } = avgSteps(input.stepLogs, from, histTo);
    if (days >= 14) {
      const target = Math.max(100, Math.round((avg * 1.05) / 100) * 100);
      options.push({
        kind: 'pasos_media',
        score: 65 + (avg < 7000 ? 10 : 0),
        title: 'Supera tu media de pasos',
        description: `Tu media de las últimas 4 semanas es de ${fmtSteps(avg)} pasos/día. Esta semana: media de ${fmtSteps(target)} o más.`,
        reason: avg < 7000 ? `Media baja (${fmtSteps(avg)}/día) — el punto débil ahora mismo` : 'Mantener el motor del gasto diario',
        metric: { unit: 'pasos', target, baseline: Math.round(avg) },
      });
      const weekTarget = Math.max(1000, Math.round((avg * 7 * 1.05) / 1000) * 1000);
      options.push({
        kind: 'pasos_total',
        score: 45,
        title: `${fmtSteps(weekTarget)} pasos esta semana`,
        description: `Suma total semanal: ${fmtSteps(weekTarget)} pasos. Da igual cómo los repartas — lo que cuenta es llegar.`,
        reason: 'Variante flexible del reto de pasos (total, no media)',
        metric: { unit: 'pasos', target: weekTarget, baseline: Math.round(avg * 7) },
      });
    }
  }

  // ── Peso objetivo (proyección de la periodización) ──
  {
    const proj = input.projection;
    if (proj && proj.points.length > 0 && proj.startWeightKg != null) {
      const point = [...proj.points]
        .filter(p => p.expectedAdherence != null)
        .sort((a, b) => Math.abs(new Date(a.date).getTime() - new Date(weekEnd).getTime())
                      - Math.abs(new Date(b.date).getTime() - new Date(weekEnd).getTime()))[0];
      if (point && point.expectedAdherence != null) {
        const last = lastBodyweight(input.bodyweightLogs);
        const baseline = last?.weight ?? proj.startWeightKg;
        const target = Math.round(point.expectedAdherence * 10) / 10;
        const losing = target <= baseline;
        const currentPoint = proj.points.find(p => p.week === proj.currentWeek);
        const deviated = currentPoint?.real != null && currentPoint.expectedAdherence != null
          && Math.abs(currentPoint.real - currentPoint.expectedAdherence) >= 0.5;
        options.push({
          kind: 'peso_objetivo',
          score: 60 + (deviated ? 10 : 0),
          title: losing ? 'Sigue tu proyección de peso' : 'Construye según lo planificado',
          description: losing
            ? `Tu plan proyecta ${target} kg para esta semana. Termina la semana en ${target} kg o menos.`
            : `Tu plan proyecta ${target} kg para esta semana. Termina la semana en ${target} kg o más.`,
          reason: deviated ? 'Desviado ≥0,5 kg de la proyección del plan' : 'Alineado con su periodización nutricional',
          metric: { unit: 'kg', target, baseline },
        });
      }
    }
  }

  // ── Adherencia a la dieta ──
  {
    if (input.coachDiets.length > 0) {
      const from = addDays(weekStart, -28);
      const { avg, days } = dailyDietPcts(input.completionLogs, input.coachDiets, from, histTo);
      if (days >= 7) {
        const target = Math.min(100, Math.round(Math.max(avg, 80)));
        options.push({
          kind: 'adherencia_dieta',
          score: 55 + (avg < 80 ? 15 : 0),
          title: 'Clava tu dieta esta semana',
          description: `Tu adherencia media del último mes es del ${Math.round(avg)}%. Esta semana: ${target}% o más.`,
          reason: avg < 80 ? `Adherencia floja (${Math.round(avg)}%) — donde más margen hay` : 'Consolidar la adherencia actual',
          metric: { unit: '%', target, baseline: Math.round(avg) },
        });
      }
    }
  }

  // ── Entrenos completados ──
  {
    const weekAssignments = input.assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
    if (weekAssignments.length > 0) {
      options.push({
        kind: 'entrenos_completados',
        score: 50,
        title: 'Semana completa de entrenos',
        description: `Tienes ${weekAssignments.length} entrenamiento${weekAssignments.length === 1 ? '' : 's'} esta semana. Complétalo${weekAssignments.length === 1 ? '' : 's todos'}.`,
        reason: 'Cerrar la semana de entrenos al 100%',
        metric: { unit: 'sesiones', target: weekAssignments.length },
      });
    }
  }

  // Rotación: penaliza repetir el tipo de la semana anterior, salvo hitos.
  for (const opt of options) {
    if (!opt.isMilestone && input.previousKind && opt.kind === input.previousKind) {
      opt.score -= ROTATION_PENALTY;
    }
    opt.score = Math.max(5, Math.min(100, opt.score));
  }

  return options.sort((a, b) => b.score - a.score);
}

// Fallback final cuando no hay dato ninguno: reto genérico de pasos.
export function genericStepsOption(): ChallengeOption {
  return {
    kind: 'pasos_media',
    score: 5,
    title: 'Muévete cada día',
    description: `Esta semana: media de ${fmtSteps(GENERIC_STEP_TARGET)} pasos al día. Registra tus pasos para ver el progreso.`,
    reason: 'Sin datos suficientes todavía — reto genérico de arranque',
    metric: { unit: 'pasos', target: GENERIC_STEP_TARGET },
  };
}

// Materializa una opción como reto de la semana del día indicado.
export function buildChallengeFromOption(
  opt: ChallengeOption,
  params: { athleteId: string; today: string; origin: WeeklyChallenge['origin'] },
): WeeklyChallenge {
  const { weekStart, weekEnd } = isoWeekBounds(params.today);
  const isoWeek = isoWeekKey(params.today);
  return {
    id: `${params.athleteId}_${isoWeek}`,
    athleteId: params.athleteId,
    isoWeek,
    weekStart,
    weekEnd,
    kind: opt.kind,
    title: opt.title,
    description: opt.description,
    origin: params.origin,
    metric: opt.metric,
    status: 'activo',
    createdAt: new Date().toISOString(),
  };
}
