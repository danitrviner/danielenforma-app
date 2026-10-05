import { WorkoutExercise, WorkoutLog, WorkoutSetLog, EventoDeSemana } from '../types';
import { resolveExerciseForWeek, resolverEjercicioDelMeso, mesocycleWeekNumber } from './progression';
import { expandSetGroups } from './setGroups';
import { rangoDeReps } from './cargaSugerida';
import { diferencias, novedadesDeSemana, seriesDe, type NovedadesDeSemana } from './semanasDelBloque';

/* «Planificar progresión» (Mesociclo › Ejercicios): el coach elige unos pocos
   ejercicios de todo el bloque y los programa semana a semana en una tabla.
   Lo que se guarda son las mismas reglas de `weeklyProgression` que escribe la
   barra de semanas (ver semanasDelBloque.ts); aquí solo está lo propio de la
   tabla: cómo se identifica un ejercicio elegido, cómo se pinta una casilla y
   qué hizo de verdad el atleta esa semana. */

// ── Ejercicios elegidos ─────────────────────────────────────────────────────

/** Identidad de un día que no depende de su nombre ni de sus workoutIds. */
export const claveDelDia = (d: { dayIndex?: number; name: string }) =>
  d.dayIndex != null ? `d${d.dayIndex}` : `n:${d.name}`;

/** Identidad de un ejercicio elegido: día + ejercicio de la base. Se guarda en
 *  `Mesocycle.ejerciciosClave`, así que reordenar el día no la rompe. */
export const claveEjercicioClave = (d: { dayIndex?: number; name: string }, exerciseId: string) =>
  `${claveDelDia(d)}::${exerciseId}`;

// ── Casillas ────────────────────────────────────────────────────────────────

export interface Celda {
  /** "4×6-8" o, con bloques, "1×6-8 + 3×10-12". */
  esquema: string;
  /** "RIR 2" o, con bloques, "RIR 1/2". */
  rir: string;
}

export function describirCelda(we: WorkoutExercise): Celda {
  if (we.setGroups && we.setGroups.length > 0) {
    const rirs = [...new Set(we.setGroups.map(g => g.rir))];
    return {
      esquema: we.setGroups.map(g => `${g.sets}×${g.reps}`).join(' + '),
      rir: `RIR ${rirs.join('/')}`,
    };
  }
  return { esquema: `${we.sets}×${we.reps}`, rir: `RIR ${we.rir}` };
}

/** Lo que toca en `semana` (0 = base), sin la descarga: es lo que el coach
 *  edita; la descarga se aplica encima y se avisa en la cabecera. */
export const prescritoEn = (we: WorkoutExercise, semana: number) =>
  semana === 0 ? we : resolveExerciseForWeek(we, semana);

/** true si en `semana` cambia algo respecto a la anterior (o a la base). */
export function cambiaEn(we: WorkoutExercise, semana: number): boolean {
  if (semana === 0) return false;
  return diferencias(prescritoEn(we, semana - 1), prescritoEn(we, semana), id => id).length > 0;
}

// ── Plan contra lo hecho ────────────────────────────────────────────────────

export interface RealDeLaSemana {
  /** Series registradas. */
  hechas: number;
  /** Series pautadas esa semana (descarga incluida). */
  pautadas: number;
  /** La serie más pesada (a igualdad, la de más reps). */
  mejor: WorkoutSetLog | null;
  /** Hizo todas las series pautadas llegando al mínimo de reps. */
  cumple: boolean;
  /** Lo que guardó la sesión sobre el aviso de cambios (ver WorkoutLog). */
  novedadesVistas?: boolean;
  fecha: string;
}

export function realDeLaSemana(
  logs: WorkoutLog[],
  meso: { id?: string; startDate: string; semanasDescarga?: number[]; semanasTest?: number[] },
  cicloDias: number,
  workoutIds: string[],
  we: WorkoutExercise,
  semana: number,
): RealDeLaSemana | null {
  if (semana < 1) return null;
  const pautado = resolverEjercicioDelMeso(we, meso, semana);
  const log = logs
    .filter(l => workoutIds.includes(l.workoutId)
      && (!l.mesocycleId || !meso.id || l.mesocycleId === meso.id)
      && mesocycleWeekNumber(meso.startDate, l.date, cicloDias) === semana)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!log) return null;
  const entry = log.entries.find(e => e.exerciseId === pautado.exerciseId);
  const sets = entry?.sets ?? [];
  const filas = expandSetGroups(pautado);
  const buenas = sets.filter((s, i) => {
    const rango = rangoDeReps(filas[Math.min(i, filas.length - 1)]?.reps ?? '');
    return s.alFallo || !rango || s.repsDone >= rango.min;
  }).length;
  const pautadas = seriesDe(pautado);
  const mejor = sets.reduce<WorkoutSetLog | null>(
    (m, s) => !m || s.weight > m.weight || (s.weight === m.weight && s.repsDone > m.repsDone) ? s : m, null);
  return {
    hechas: sets.length,
    pautadas,
    mejor,
    cumple: sets.length > 0 && Math.min(buenas, sets.length) >= pautadas,
    ...(log.novedadesVistas !== undefined ? { novedadesVistas: log.novedadesVistas } : {}),
    fecha: log.date,
  };
}

// ── Aviso al atleta al empezar la sesión ────────────────────────────────────

export interface NovedadesDeLaSesion {
  novedades: NovedadesDeSemana;
  /** Mismo orden que `ejercicios`: qué cambia en cada uno respecto a la
   *  semana anterior (vacío si nada). */
  porEjercicio: string[][];
}

/** Lo que cambia en ESTA sesión respecto a la misma sesión la semana de ciclo
 *  anterior. `ejercicios` son los de la rutina base (sin resolver). */
export function novedadesDeLaSesion(
  ejercicios: WorkoutExercise[],
  meso: { semanasDescarga?: number[]; semanasTest?: number[]; eventosSemana?: Record<string, EventoDeSemana> },
  semana: number,
  dia: string,
  nombreDe: (id: string) => string,
): NovedadesDeLaSesion {
  return {
    novedades: novedadesDeSemana(ejercicios.map(we => ({ we, dia })), meso, semana, nombreDe),
    porEjercicio: ejercicios.map(we => semana > 1
      ? diferencias(resolveExerciseForWeek(we, semana - 1), resolveExerciseForWeek(we, semana), nombreDe)
      : []),
  };
}
