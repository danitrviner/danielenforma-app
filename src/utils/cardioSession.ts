import { CardioAssignment, CardioSession, CardioZones } from '../types';
import { isoWeekKey, isoWeekBounds } from './challengeOptions';
import { addDays } from './trainingWeek';

// Lógica pura de acumulación de una sesión de cardio en vivo — extraída de
// CardioScreen.tsx para poder testearla sin React (§F1 del plan de réplica
// FITIV, docs/FITIV-analisis-y-plan.md). Corrige dos fallos reales:
//   1) una desconexión de la banda a mitad de sesión descartaba lo grabado
//      porque el callback leía el `elapsedSec` de un closure viejo (0);
//   2) el tiempo por zona y el cronómetro se derivaban de un contador de
//      ticks, que se atrasa si el SO estrangula el intervalo en segundo
//      plano (pantalla bloqueada).
// Aquí todo sale de marcas de tiempo reales (Date.now() / los timestamps de
// las notificaciones BLE), nunca de contar ejecuciones de un intervalo.

export const ZERO_TIME_IN_ZONE: Record<keyof CardioZones, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

export interface ZoneAccumulator {
  timeInZoneSec: Record<keyof CardioZones, number>;
  /** Tramos con FC por debajo del suelo de Z1 — la píldora "Fuera de zona" de FITIV (§4bis.1). */
  belowZoneSec: number;
  lastZone: keyof CardioZones | null;
  /** Date.now() del último punto ya contabilizado. */
  lastZoneAtMs: number | null;
}

export function createZoneAccumulator(nowMs: number): ZoneAccumulator {
  return { timeInZoneSec: { ...ZERO_TIME_IN_ZONE }, belowZoneSec: 0, lastZone: null, lastZoneAtMs: nowMs };
}

/**
 * Suma al acumulador el tramo transcurrido desde el último punto hasta
 * `nowMs`, imputado a la zona que estaba activa en ese tramo (o a
 * `belowZoneSec` si no había ninguna), y deja `nowMs` como nueva referencia.
 * Se llama en cada muestra de FC recibida y también al cerrar la sesión,
 * para no perder el último tramo sin cerrar.
 */
export function flushZoneTime(acc: ZoneAccumulator, nowMs: number): ZoneAccumulator {
  const timeInZoneSec = { ...acc.timeInZoneSec };
  let belowZoneSec = acc.belowZoneSec;
  if (acc.lastZoneAtMs !== null) {
    const deltaSec = (nowMs - acc.lastZoneAtMs) / 1000;
    if (acc.lastZone !== null) timeInZoneSec[acc.lastZone] += deltaSec;
    else belowZoneSec += deltaSec;
  }
  return { timeInZoneSec, belowZoneSec, lastZone: acc.lastZone, lastZoneAtMs: nowMs };
}

export function setActiveZone(acc: ZoneAccumulator, zone: keyof CardioZones | null): ZoneAccumulator {
  return { ...acc, lastZone: zone };
}

/** Redondea el acumulador a segundos enteros, listo para guardar. */
export function roundTimeInZone(timeInZoneSec: Record<keyof CardioZones, number>): Record<keyof CardioZones, number> {
  return {
    z1: Math.round(timeInZoneSec.z1),
    z2: Math.round(timeInZoneSec.z2),
    z3: Math.round(timeInZoneSec.z3),
    z4: Math.round(timeInZoneSec.z4),
    z5: Math.round(timeInZoneSec.z5),
  };
}

/** Duración de la sesión a partir del reloj de pared — nunca de un contador de ticks. */
export function elapsedSecFromWallClock(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

const MIN_SESSION_SEC = 10;

/**
 * Una sesión solo se descarta si el usuario lo pide explícitamente, o si es
 * demasiado corta para tener sentido. Una desconexión de la banda NUNCA debe
 * llegar aquí con mode='discard' — siempre 'save'.
 */
export function shouldDiscardSession(elapsedSec: number, mode: 'save' | 'discard'): boolean {
  return mode === 'discard' || elapsedSec < MIN_SESSION_SEC;
}

export function summarizeSamples(samples: number[]): { avgHR?: number; maxHR?: number } {
  if (samples.length === 0) return {};
  const avgHR = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const maxHR = Math.max(...samples);
  return { avgHR, maxHR };
}

/**
 * La prescripción activa de "Sesión Zona 2" del coach (si la hay), para
 * guiar la sesión con zona y duración objetivo (§F3 del plan). Si hay varias
 * activas a la vez (no debería, pero por si acaso) se usa la más reciente.
 */
/**
 * De entre las activas de un tipo, cuál es "la de hoy". Una asignación con
 * `date` es PUNTUAL — programada para un día concreto (26-08, Dani: "poder
 * configurar y programar sesiones de cardio específicas") — y solo cuenta si
 * `date === todayIso`; fuera de su día no se ve por ningún lado, ni antes ni
 * después, así que un cardio puesto para el jueves no se le adelanta al
 * atleta el martes ni le persigue la semana siguiente. Sin coincidencia
 * puntual, se cae a la más reciente SIN fecha (la prescripción recurrente de
 * siempre) — una puntual de otro día nunca sirve de recurrente de repuesto.
 * Si hay más de una puntual para hoy, gana la más reciente, igual que con las
 * recurrentes.
 */
function pickActiveAssignment(candidatos: CardioAssignment[], todayIso: string): CardioAssignment | undefined {
  // Un programa progresivo con "Empieza el" en el futuro no cuenta como
  // activo todavía — sin este filtro, `semanaDelPrograma` no tiene sesiones
  // previas que contar y siempre devuelve semana 1, así que el atleta veía y
  // podía empezar la Semana 1 el mismo día que el coach lo creaba, días antes
  // de la fecha que había elegido a propósito.
  const activos = candidatos.filter(a => !a.program || a.program.startDate <= todayIso);
  const porFecha = (xs: CardioAssignment[]) => xs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const puntualDeHoy = porFecha(activos.filter(a => a.date === todayIso));
  return puntualDeHoy ?? porFecha(activos.filter(a => !a.date));
}

export function pickActiveZona2Assignment(assignments: CardioAssignment[], todayIso: string): CardioAssignment | undefined {
  return pickActiveAssignment(assignments.filter(a => a.active && a.type === 'zona2'), todayIso);
}

/** Igual que `pickActiveZona2Assignment` pero para intervalos (§F6) — exige que el coach haya definido al menos un bloque. */
export function pickActiveIntervalAssignment(assignments: CardioAssignment[], todayIso: string): CardioAssignment | undefined {
  return pickActiveAssignment(assignments.filter(a => a.active && a.type === 'intervalos' && (a.intervals?.length ?? 0) > 0), todayIso);
}

// ─── Objetivo semanal de cardio (F3.9, `objetivosCardio` del contrato) ─────
//
// El contrato pide minutosObjetivo/minutosHechos por semana ISO. minutosHechos
// nunca se guarda: siempre se deriva de `cardioSessions` (evita que el
// contador y las sesiones reales diverjan). Lo único que persiste en
// Firestore es el objetivo y si esa semana ya cerró — para no repetir el
// haptic de éxito en cada render/sesión de la misma semana ya completa.

const DEFAULT_WEEKLY_MINUTES = 90; // 3 sesiones de 30 min si el coach no ha prescrito nada

/** Minutos de cardio ya hechos en la semana ISO de `todayIso`, a partir de las sesiones reales. */
export function weeklyCardioMinutesDone(sessions: Pick<CardioSession, 'date' | 'durationSec'>[], todayIso: string): number {
  const { weekStart, weekEnd } = isoWeekBounds(todayIso);
  const secs = sessions
    .filter(s => s.date >= weekStart && s.date <= weekEnd)
    .reduce((sum, s) => sum + s.durationSec, 0);
  return Math.round(secs / 60);
}

/** Minutos hechos por día de la semana ISO actual (lunes→domingo), para las 7 microbarras. */
export function dailyCardioMinutesForWeek(sessions: Pick<CardioSession, 'date' | 'durationSec'>[], todayIso: string): number[] {
  const { weekStart } = isoWeekBounds(todayIso);
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(weekStart, i);
    const secs = sessions.filter(s => s.date === dateStr).reduce((sum, s) => sum + s.durationSec, 0);
    days.push(Math.round(secs / 60));
  }
  return days;
}

/** Objetivo semanal por defecto cuando no hay uno guardado — derivado de la prescripción activa, si la hay. */
export function defaultWeeklyCardioGoal(assignments: CardioAssignment[]): { minutesGoal: number; sessionsGoal?: number } {
  const active = assignments.filter(a => a.active && (a.type === 'zona2' || a.type === 'intervalos') && a.timesPerWeek);
  const best = active.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!best?.timesPerWeek) return { minutesGoal: DEFAULT_WEEKLY_MINUTES };
  const perSessionMin = best.targetDurationSec ? best.targetDurationSec / 60 : 30;
  return { minutesGoal: Math.round(best.timesPerWeek * perSessionMin), sessionsGoal: best.timesPerWeek };
}

export { isoWeekKey };
