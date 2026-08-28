// Motor de OPCIONES de reto semanal. Genera una opción por cada tipo viable con
// un score de relevancia: el coach las ve como cards y elige (o no hace nada y
// desde el martes se auto-envía la de mayor score — ver ensureWeeklyChallenge).
//
// Tres reglas de diseño gobiernan todo lo de abajo:
//
//   · EL OBJETIVO SE MIDE EN INCREMENTO, NO EN CIFRA ABSOLUTA. Un reto siempre
//     parte de lo que el atleta YA hace (baseline) y le pide un poco más. Por
//     eso ningún generador escribe un número fijo: escribe baseline + delta, y
//     el delta lo escala challengeMemory según cómo le fue las últimas semanas
//     (diana ~65% de retos conseguidos).
//   · NADA SE REPITE SOLO. La rotación mira 4 semanas de historial y un tipo
//     que ya falló dos veces seguidas se aparta aunque puntúe alto.
//   · SI NO HAY DATOS, EL RETO ES CONSEGUIR DATOS. Un objetivo genérico
//     ("8.000 pasos") no dice nada de nadie; un reto de hábito ("registra tu
//     peso 3 días") desbloquea todos los demás tipos para la semana siguiente.
//
// Este módulo es la base de weeklyChallenge.ts (que re-exporta los helpers ISO
// y delega generateAutoChallenge aquí); no debe importar de weeklyChallenge
// para evitar ciclos.

import {
  WeeklyChallenge, ChallengeKind, ChallengeDifficulty, ChallengeStreakSource,
  StepLog, BodyweightLog, WorkoutLog, Exercise, DietCompletionLog, Diet,
  WorkoutAssignment, CardioSession, MuscleGroup, MUSCLE_LABELS,
} from '../types';
import { ProjectionResult } from './nutritionPeriodization';
import { getWeekStart, addDays } from './trainingWeek';
import { epley } from './oneRepMax';
import {
  avgSteps, bestSet, dailyDietPcts, lastBodyweight, normalizeText, BestSet,
  fractionalSetsByGroup, zone2Minutes, loggedDays,
} from './athleteMetrics';
import {
  ChallengeMemory, EMPTY_MEMORY, buildChallengeMemory, difficultyFor,
  rotationPenalty, frustrationPenalty, failedMilestoneAttempts,
  weekSeed, pickVariant,
} from './challengeMemory';

// Básicos por defecto para retos de carga (si el coach no configura elegibles).
export const BASIC_LIFT_KEYWORDS = ['sentadilla', 'press banca', 'peso muerto', 'dominada', 'press militar', 'remo'];

export const GENERIC_STEP_TARGET = 8000;

// Intentos que se le conceden a un mismo hito redondo antes de aparcarlo. Un
// "ve a por los 100 kg" colgando seis semanas deja de ser un reto y pasa a ser
// un recordatorio de que no llegas.
export const MAX_MILESTONE_ATTEMPTS = 2;

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
  cardioSessions?: CardioSession[];      // opcional: sin ellas no se proponen retos de Zona 2
  // Historial de retos del atleta. Opcional para no romper a los llamadores que
  // solo evalúan progreso, pero sin él el motor pierde rotación larga y
  // dificultad adaptativa (se comporta como si fuese su primera semana).
  history?: WeeklyChallenge[];
}

export interface AutoChallengeInput extends ChallengeData {
  athleteId: string;
  today: string;                 // YYYY-MM-DD
  // Compatibilidad: el kind de la semana anterior. Si viene `history` se ignora
  // (la memoria ya lo deduce, y encima con 4 semanas de ventana en vez de 1).
  previousKind?: ChallengeKind;
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
  difficulty: ChallengeDifficulty;     // cómo de exigente es respecto a su baseline
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

// ── Utilidades ────────────────────────────────────────────────────────────────

function fmtSteps(n: number): string {
  return Math.round(n).toLocaleString('es-ES');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Cierres de copy que rotan por semana. No cambian el objetivo — solo evitan
// que el atleta lea la misma frase calcada diez semanas seguidas.
const CIERRES = [
  'Sin excusas.',
  'Se hace, no se piensa.',
  'A por ello.',
  'Una semana, un objetivo.',
  'Tú puedes con esto.',
] as const;

// ── Generación de opciones ────────────────────────────────────────────────────

export function generateChallengeOptions(input: AutoChallengeInput): ChallengeOption[] {
  const { weekStart, weekEnd } = isoWeekBounds(input.today);
  const isoWeek = isoWeekKey(input.today);
  const seed = weekSeed(isoWeek);
  const cierre = pickVariant(CIERRES, seed);
  const options: ChallengeOption[] = [];
  const histTo = addDays(weekStart, -1);

  // Memoria del atleta. Si el llamador no pasa historial se cae al
  // `previousKind` de siempre para no perder la rotación mínima.
  const memory: ChallengeMemory = input.history
    ? buildChallengeMemory(input.history, isoWeek)
    : (input.previousKind
        ? { ...EMPTY_MEMORY, recentKinds: [input.previousKind] }
        : EMPTY_MEMORY);

  // ── Carga: hito redondo, progresión, o PR de repeticiones ──
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

  const cargaTuning = difficultyFor('carga_ejercicio', memory);

  // Hitos aún vivos: los que no se han fallado ya MAX_MILESTONE_ATTEMPTS veces.
  // Un hito quemado no desaparece del mundo, simplemente deja de ser "el reto":
  // se sigue progresando ese ejercicio por la vía normal (+kg o +reps).
  const milestones = bestByExercise
    .map(x => ({ ...x, m: nextRoundMilestone(x.best.weight) }))
    .filter((x): x is typeof x & { m: NonNullable<ReturnType<typeof nextRoundMilestone>> } => x.m != null)
    .filter(x => failedMilestoneAttempts(x.exerciseId, memory) < MAX_MILESTONE_ATTEMPTS)
    // El hito "más maduro": menor distancia relativa a su umbral.
    .sort((a, b) => (a.m.distance / Math.max(2.5, a.m.milestone * 0.03)) - (b.m.distance / Math.max(2.5, b.m.milestone * 0.03)));

  // ¿Se ha quemado algún hito? Entonces el PR de reps sube de prioridad: es la
  // forma de seguir progresando ese mismo ejercicio sin volver a estrellarse
  // contra el mismo número.
  const hayHitoQuemado = bestByExercise.some(
    x => failedMilestoneAttempts(x.exerciseId, memory) >= MAX_MILESTONE_ATTEMPTS,
  );

  if (milestones.length > 0) {
    const { exerciseId, best, m } = milestones[0];
    const exerciseName = nameById.get(exerciseId) ?? 'tu básico';
    const intentos = failedMilestoneAttempts(exerciseId, memory);
    options.push({
      kind: 'carga_ejercicio',
      // Sigue siendo la opción estrella, pero ya no es intocable: 96 deja hueco
      // a que un reto de hábito urgente (score 95+) le pase por delante.
      score: intentos === 0 ? 96 : 86,
      isMilestone: true,
      difficulty: 'ambicioso',
      title: `Ve a por los ${m.milestone} kg en ${exerciseName}`,
      description: intentos === 0
        ? `Tu mejor marca: ${best.weight} kg × ${best.reps}. Estás a solo ${m.distance} kg de la barrera de los ${m.milestone}. Esta semana: ${m.milestone} kg a ${best.reps} repeticiones. Un hito para el recuerdo.`
        : `Segundo asalto a los ${m.milestone} kg. Tu marca sigue en ${best.weight} kg × ${best.reps} y te faltan ${m.distance} kg. Esta semana va la buena: ${m.milestone} kg a ${best.reps} repeticiones.`,
      reason: intentos === 0
        ? `Su mejor marca en ${exerciseName} está a ${m.distance} kg de un número redondo`
        : `Segundo (y último) intento del hito de ${m.milestone} kg — si falla, el motor rota a progresión normal`,
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
    // Incremento en discos reales: múltiplos de 1,25 kg, entre 1,25 y 5.
    const incKg = clamp(Math.round((2.5 * cargaTuning.factor) / 1.25) * 1.25, 1.25, 5);
    const target = Math.min(epley(best.weight + incKg, best.reps), epley(best.weight, best.reps + 1));
    options.push({
      kind: 'carga_ejercicio',
      score: 70,
      difficulty: cargaTuning.label,
      title: `Mejora tu ${exerciseName}`,
      description: `Tu mejor marca reciente: ${best.weight} kg × ${best.reps}. Esta semana: +${incKg.toLocaleString('es-ES')} kg a las mismas repeticiones, o +1 repetición al mismo peso.`,
      reason: `Progresión sobre su básico más entrenado (+${incKg} kg, listón ${cargaTuning.label})`,
      metric: { unit: 'kg (1RM est.)', target, baseline: best.e1rm, exerciseId, exerciseName },
    });
  }

  // ── PR de repeticiones: progresar sin subir el peso ──
  // Solo tiene sentido en el rango de fuerza/hipertrofia: por encima de 12 reps
  // sumar una más no es progreso, es resistencia; por debajo de 3 la serie es
  // demasiado pesada para pedir repeticiones extra sin fallar.
  {
    const candidato = [...bestByExercise]
      .filter(x => x.best.reps >= 3 && x.best.reps <= 12)
      .sort((a, b) => b.freq - a.freq)[0];
    if (candidato) {
      const { exerciseId, best } = candidato;
      const exerciseName = nameById.get(exerciseId) ?? 'tu básico';
      const tuning = difficultyFor('reps_ejercicio', memory);
      const incReps = clamp(Math.round(tuning.factor), 1, 2);
      options.push({
        kind: 'reps_ejercicio',
        score: hayHitoQuemado ? 76 : 66,
        difficulty: tuning.label,
        title: `${best.reps + incReps} repeticiones con ${best.weight} kg`,
        description: `Ahora mismo mueves ${best.weight} kg × ${best.reps} en ${exerciseName}. Esta semana no toques el peso: saca ${best.reps + incReps} repeticiones. ${cierre}`,
        reason: hayHitoQuemado
          ? `El hito de carga se ha agotado — progresar por repeticiones evita estrellarse contra el mismo número`
          : `Progresión sin subir peso en ${exerciseName} (más margen de técnica que un intento pesado)`,
        metric: {
          unit: 'reps',
          target: best.reps + incReps,
          baseline: best.reps,
          exerciseId,
          exerciseName,
          atWeight: best.weight,
        },
      });
    }
  }

  // ── Pasos (media y total, misma viabilidad de datos) ──
  {
    const from = addDays(weekStart, -28);
    const { avg, days } = avgSteps(input.stepLogs, from, histTo);
    if (days >= 14) {
      const tuning = difficultyFor('pasos_media', memory);
      // 5% es el incremento de referencia; el factor lo mueve entre el 2% y el
      // 10%, y además nunca se piden más de 2.500 pasos/día extra de golpe.
      const pct = clamp(0.05 * tuning.factor, 0.02, 0.10);
      const rawTarget = Math.min(avg * (1 + pct), avg + 2500);
      const target = Math.max(100, Math.round(rawTarget / 100) * 100);
      options.push({
        kind: 'pasos_media',
        score: 65 + (avg < 7000 ? 10 : 0),
        difficulty: tuning.label,
        title: 'Supera tu media de pasos',
        description: `Tu media de las últimas 4 semanas es de ${fmtSteps(avg)} pasos/día. Esta semana: media de ${fmtSteps(target)} o más.`,
        reason: avg < 7000
          ? `Media baja (${fmtSteps(avg)}/día) — el punto débil ahora mismo · +${Math.round(pct * 100)}%`
          : `Mantener el motor del gasto diario · +${Math.round(pct * 100)}%`,
        metric: { unit: 'pasos', target, baseline: Math.round(avg) },
      });
      const weekTuning = difficultyFor('pasos_total', memory);
      const weekPct = clamp(0.05 * weekTuning.factor, 0.02, 0.10);
      const weekTarget = Math.max(1000, Math.round((avg * 7 * (1 + weekPct)) / 1000) * 1000);
      options.push({
        kind: 'pasos_total',
        score: 45,
        difficulty: weekTuning.label,
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
        const tuning = difficultyFor('peso_objetivo', memory);
        const planTarget = Math.round(point.expectedAdherence * 10) / 10;
        // El plan manda, pero si lleva dos semanas sin llegar se le pide el
        // tramo que sí es alcanzable en vez de repetirle un número imposible.
        const target = tuning.factor < 1
          ? Math.round((baseline + (planTarget - baseline) * tuning.factor) * 10) / 10
          : planTarget;
        const losing = target <= baseline;
        const currentPoint = proj.points.find(p => p.week === proj.currentWeek);
        const deviated = currentPoint?.real != null && currentPoint.expectedAdherence != null
          && Math.abs(currentPoint.real - currentPoint.expectedAdherence) >= 0.5;
        options.push({
          kind: 'peso_objetivo',
          score: 60 + (deviated ? 10 : 0),
          difficulty: tuning.label,
          title: losing ? 'Sigue tu proyección de peso' : 'Construye según lo planificado',
          description: losing
            ? `Tu plan proyecta ${target} kg para esta semana. Termina la semana en ${target} kg o menos.`
            : `Tu plan proyecta ${target} kg para esta semana. Termina la semana en ${target} kg o más.`,
          reason: target !== planTarget
            ? `Objetivo suavizado (el plan pedía ${planTarget} kg) tras fallar el reto de peso`
            : deviated ? 'Desviado ≥0,5 kg de la proyección del plan' : 'Alineado con su periodización nutricional',
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
        const tuning = difficultyFor('adherencia_dieta', memory);
        // Antes esto era `max(media, 80)`: al que venía del 55% le plantaba un
        // 80% de golpe (+25 puntos, imposible) y al que venía del 96% le
        // regalaba su propia media. Ahora se sube en tramos de 2 a 10 puntos
        // sobre lo que ya hace, y el techo es 97: exigir el 100% de adherencia
        // una semana entera solo enseña a mentir en los checks.
        const inc = clamp(5 * tuning.factor, 2, 10);
        const target = clamp(Math.round(avg + inc), 60, 97);
        options.push({
          kind: 'adherencia_dieta',
          score: 55 + (avg < 80 ? 15 : 0),
          difficulty: tuning.label,
          title: 'Clava tu dieta esta semana',
          description: `Tu adherencia media del último mes es del ${Math.round(avg)}%. Esta semana: ${target}% o más.`,
          reason: avg < 80
            ? `Adherencia floja (${Math.round(avg)}%) — donde más margen hay · +${Math.round(inc)} puntos`
            : `Consolidar la adherencia actual · +${Math.round(inc)} puntos`,
          metric: { unit: '%', target, baseline: Math.round(avg) },
        });
      }
    }
  }

  // ── Entrenos completados ──
  {
    const weekAssignments = input.assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
    if (weekAssignments.length > 0) {
      const tuning = difficultyFor('entrenos_completados', memory);
      // No se puede "escalar" un entreno: o vas o no vas. Lo que sí se puede es
      // dejar de pedir el pleno a quien lleva dos semanas sin conseguirlo —
      // 3 de 4 es un objetivo, 4 de 4 fallado dos veces es un recordatorio.
      const total = weekAssignments.length;
      const target = tuning.factor < 0.5 && total > 1 ? total - 1 : total;
      const pleno = target === total;
      options.push({
        kind: 'entrenos_completados',
        score: 50,
        difficulty: tuning.label,
        title: pleno ? 'Semana completa de entrenos' : `Completa ${target} de ${total} entrenos`,
        description: pleno
          ? `Tienes ${total} entrenamiento${total === 1 ? '' : 's'} esta semana. Complétalo${total === 1 ? '' : 's todos'}.`
          : `Tienes ${total} entrenamientos esta semana. Completa al menos ${target}: mejor ${target} buenos que ninguno perfecto.`,
        reason: pleno
          ? 'Cerrar la semana de entrenos al 100%'
          : `Objetivo rebajado a ${target}/${total} tras dos semanas fallando el pleno`,
        metric: { unit: 'sesiones', target },
      });
    }
  }

  // ── Volumen por grupo muscular ──
  // Detecta el grupo REZAGADO: aquel cuya última semana cayó más por debajo de
  // su propia media de 4 semanas. Es el reto del que siempre se salta el mismo
  // día — no le pides "entrena más", le pides las series que él mismo se hacía.
  {
    const from = addDays(weekStart, -28);
    const historico = fractionalSetsByGroup(input.workoutLogs, input.exercises, from, histTo);
    const ultimaSemana = fractionalSetsByGroup(
      input.workoutLogs, input.exercises, addDays(weekStart, -7), histTo,
    );
    const candidatos: { group: MuscleGroup; media: number; ultima: number; caida: number }[] = [];
    for (const [group, total] of historico) {
      const media = total / 4;
      // Menos de 3 series/semana de media es ruido (un secundario suelto), no
      // un grupo que el atleta esté entrenando de verdad.
      if (media < 3) continue;
      const ultima = ultimaSemana.get(group) ?? 0;
      candidatos.push({ group, media, ultima, caida: (media - ultima) / media });
    }
    candidatos.sort((a, b) => b.caida - a.caida);
    const peor = candidatos[0];
    if (peor) {
      const tuning = difficultyFor('series_grupo', memory);
      const label = MUSCLE_LABELS[peor.group];
      const rezagado = peor.caida >= 0.25;
      // Se pide su media histórica más un empujón; nunca menos de una serie más
      // que la semana pasada, o el reto se cumpliría solo sin hacer nada.
      const pct = clamp(0.10 * tuning.factor, 0.05, 0.20);
      const target = Math.max(
        Math.round(peor.media * (1 + pct)),
        Math.ceil(peor.ultima) + 1,
        3,
      );
      options.push({
        kind: 'series_grupo',
        score: 48 + (rezagado ? 14 : 0),
        difficulty: tuning.label,
        title: `${target} series de ${label.toLowerCase()} esta semana`,
        description: rezagado
          ? `La semana pasada te quedaste en ${Math.round(peor.ultima)} series de ${label.toLowerCase()}, cuando tu media es ${Math.round(peor.media)}. Esta semana: ${target} series. ${cierre}`
          : `Tu media de ${label.toLowerCase()} es de ${Math.round(peor.media)} series por semana. Esta semana sube a ${target}.`,
        reason: rezagado
          ? `${label} cayó un ${Math.round(peor.caida * 100)}% respecto a su media de 4 semanas — es el grupo que se está saltando`
          : `Empujón de volumen en ${label} (+${Math.round(pct * 100)}% sobre su media)`,
        metric: { unit: 'series', target, baseline: Math.round(peor.ultima), muscleGroup: peor.group, muscleLabel: label },
      });
    }
  }

  // ── Cardio en Zona 2 ──
  {
    const sessions = input.cardioSessions ?? [];
    const from = addDays(weekStart, -28);
    const minutos = zone2Minutes(sessions, from, histTo);
    const conBanda = sessions.filter(s => s.date >= from && s.date <= histTo && !s.manual).length;
    // Hacen falta al menos dos sesiones reales con banda: con una sola no hay
    // media de la que partir, y proponer minutos de Zona 2 a quien no hace
    // cardio es inventarle un hábito que el coach no le ha mandado.
    if (conBanda >= 2 && minutos > 0) {
      const tuning = difficultyFor('cardio_zona2', memory);
      const mediaSemanal = minutos / 4;
      const pct = clamp(0.10 * tuning.factor, 0.05, 0.20);
      const target = Math.max(10, Math.round((mediaSemanal * (1 + pct)) / 5) * 5);
      options.push({
        kind: 'cardio_zona2',
        score: 52,
        difficulty: tuning.label,
        title: `${target} minutos en Zona 2`,
        description: `Tu media es de ${Math.round(mediaSemanal)} minutos de Zona 2 a la semana. Esta semana: ${target} minutos con la banda puesta. El ritmo al que puedes hablar sin ahogarte.`,
        reason: `Base aeróbica: +${Math.round(pct * 100)}% sobre su media de Zona 2 (${Math.round(mediaSemanal)} min/sem)`,
        metric: { unit: 'min', target, baseline: Math.round(mediaSemanal) },
      });
    }
  }

  // ── Racha de registro (reto de hábito) ──
  // Siempre viable: no necesita datos previos, y precisamente por eso es el
  // reto correcto cuando no hay ninguno. Un atleta sin registros no puede
  // recibir ningún otro tipo de reto medible; este los desbloquea todos.
  {
    const from = addDays(weekStart, -14);
    const fuentes: { source: ChallengeStreakSource; dias: number; que: string; comoSeHace: string }[] = [
      { source: 'pasos', dias: loggedDays(input.stepLogs, from, histTo), que: 'tus pasos', comoSeHace: 'anótalos al final del día' },
      { source: 'peso', dias: loggedDays(input.bodyweightLogs, from, histTo), que: 'tu peso', comoSeHace: 'nada más levantarte, antes de desayunar' },
    ];
    if (input.coachDiets.length > 0) {
      fuentes.push({
        source: 'dieta',
        dias: loggedDays(input.completionLogs, from, histTo),
        que: 'tus comidas',
        comoSeHace: 'marca lo que vas comiendo sobre la marcha',
      });
    }
    // La fuente peor cubierta es la que más falta hace.
    fuentes.sort((a, b) => a.dias - b.dias);
    const peor = fuentes[0];
    const porSemana = peor.dias / 2;
    const tuning = difficultyFor('racha_registro', memory);
    const paso = clamp(Math.round(2 * tuning.factor), 1, 3);
    const target = clamp(Math.round(porSemana) + paso, 3, 7);

    // ¿Está el atleta en blanco? Entonces esto es LO ÚNICO que tiene sentido
    // mandarle, y se pone por delante incluso del hito de carga.
    const enBlanco = fuentes.every(f => f.dias < 3);
    const bloqueando = porSemana < 3;
    options.push({
      kind: 'racha_registro',
      score: enBlanco ? 95 : bloqueando ? 62 : 40,
      difficulty: tuning.label,
      title: `Registra ${peor.que} ${target} días`,
      description: enBlanco
        ? `Empezamos por lo básico: apunta ${peor.que} ${target} días de los 7 — ${peor.comoSeHace}. Sin ese dato no puedo ajustarte nada, y con él empiezan los retos de verdad.`
        : `Vas registrando ${peor.que} unos ${Math.round(porSemana)} días por semana. Esta semana: ${target} de 7 — ${peor.comoSeHace}. ${cierre}`,
      reason: enBlanco
        ? 'Sin datos todavía: el reto de arranque es generar el primer registro, no un objetivo inventado'
        : bloqueando
          ? `Solo registra ${peor.que} ${Math.round(porSemana)} días/semana — sin ese dato el motor no puede proponer retos medibles`
          : `Reforzar el hábito de registro peor cubierto (${peor.source})`,
      metric: { unit: 'días', target, baseline: Math.round(porSemana), streakSource: peor.source },
    });
  }

  // ── Rotación, fatiga y orden final ────────────────────────────────────────
  for (const opt of options) {
    // Los hitos redondos se saltan la rotación: son irrepetibles por naturaleza
    // y ya tienen su propio tope de intentos (MAX_MILESTONE_ATTEMPTS).
    if (!opt.isMilestone) {
      opt.score -= rotationPenalty(opt.kind, memory);
      opt.score -= frustrationPenalty(opt.kind, memory);
    }
    opt.score = Math.max(5, Math.min(100, Math.round(opt.score)));
  }

  return options.sort((a, b) => b.score - a.score);
}

// Fallback final cuando no hay dato ninguno NI opción de hábito disponible.
// En la práctica ya no se alcanza (generateChallengeOptions siempre devuelve al
// menos el reto de racha de registro), pero se conserva como red de seguridad
// del contrato "el atleta SIEMPRE tiene un reto".
export function genericStepsOption(): ChallengeOption {
  return {
    kind: 'pasos_media',
    score: 5,
    difficulty: 'suave',
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
    // Se persisten para que la memoria de la semana que viene pueda contar
    // intentos de hito y con qué listón se envió cada reto.
    ...(opt.isMilestone ? { isMilestone: true } : {}),
    difficulty: opt.difficulty,
  };
}
