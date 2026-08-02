import { CardioAssignment, CardioZones } from '../types';

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
export function pickActiveZona2Assignment(assignments: CardioAssignment[]): CardioAssignment | undefined {
  return assignments
    .filter(a => a.active && a.type === 'zona2')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Igual que `pickActiveZona2Assignment` pero para intervalos (§F6) — exige que el coach haya definido al menos un bloque. */
export function pickActiveIntervalAssignment(assignments: CardioAssignment[]): CardioAssignment | undefined {
  return assignments
    .filter(a => a.active && a.type === 'intervalos' && (a.intervals?.length ?? 0) > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
