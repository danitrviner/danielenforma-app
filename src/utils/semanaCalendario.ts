/**
 * Detalle por ejercicio de un día — lo que el Nivel Semana enseña y que los
 * niveles Año y Mes no pueden: qué toca hacer exactamente, con las series ya
 * resueltas para la semana del mesociclo.
 *
 * Vive aparte de `roadmapCalendar.ts` (que construye el índice de días de los
 * tres niveles) porque solo lo necesita una vista y resolver la progresión de
 * los 7 días a la vez no es gratis: si esto entrara en `construirIndiceDeDias`
 * se pagaría en el Año y el Mes, donde no se enseña.
 */
import {
  WorkoutAssignment, WorkoutLog, Workout, Exercise, Mesocycle,
} from '../types';
import { mesocycleWeekNumber, diasDeCiclo, resolveExerciseForWeek } from './progression';
import { addDays } from './trainingWeek';

export interface EjercicioDelDia {
  exerciseId: string;
  nombre: string;
  /** Series planificadas para ESA semana del mesociclo (progresión aplicada). */
  series: number;
  reps: string;
  rir: number;
  /** Series registradas por el atleta, si ya entrenó ese día. */
  seriesHechas?: number;
  /** Carga media movida en esas series, en kg. Solo con registro. */
  pesoMedio?: number;
}

export interface DatosSemana {
  workoutAssignments: WorkoutAssignment[];
  workoutLogs: WorkoutLog[];
  workouts: Workout[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
}

/**
 * Ejercicios de un día concreto. Devuelve `[]` cuando no hay entreno asignado
 * o cuando la rutina ya no existe — nunca inventa una sesión vacía.
 */
export function ejerciciosDelDia(fecha: string, datos: DatosSemana): EjercicioDelDia[] {
  const asignacion = datos.workoutAssignments.find(a => a.date === fecha);
  if (!asignacion) return [];
  const workout = datos.workouts.find(w => w.id === asignacion.workoutId);
  if (!workout) return [];

  const meso = datos.mesocycles.find(m => m.id === (workout.mesocycleId ?? asignacion.mesocycleId));
  const semanaDelMeso = meso
    ? mesocycleWeekNumber(meso.startDate, fecha, diasDeCiclo(meso.daysPerWeek, meso.cycleDays))
    : 1;

  const log = datos.workoutLogs.find(l => l.assignmentId === asignacion.id)
    ?? datos.workoutLogs.find(l => l.date === fecha);

  return workout.exercises
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(we => {
      const resuelto = resolveExerciseForWeek(we, semanaDelMeso);
      const entrada = log?.entries.find(e => e.exerciseId === we.exerciseId);
      const seriesHechas = entrada?.sets.length;
      // Media de la carga movida, no el máximo: el máximo de una serie suelta
      // no dice cómo fue la sesión, y es lo que un coach mira de un vistazo.
      const pesoMedio = entrada && entrada.sets.length > 0
        ? Math.round((entrada.sets.reduce((s, x) => s + x.weight, 0) / entrada.sets.length) * 10) / 10
        : undefined;
      return {
        exerciseId: we.exerciseId,
        nombre: datos.exercises.find(e => e.id === we.exerciseId)?.name ?? 'Ejercicio',
        series: resuelto.sets,
        reps: resuelto.reps,
        rir: resuelto.rir,
        ...(seriesHechas !== undefined ? { seriesHechas } : {}),
        ...(pesoMedio !== undefined ? { pesoMedio } : {}),
      };
    });
}

/** Los 7 días (lunes→domingo) de la semana que contiene `fecha`. */
export function diasDeLaSemana(inicio: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
}

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "24 — 30 de agosto" o "31 de agosto — 6 de septiembre". */
export function rotuloDeSemana(inicio: string): string {
  const fin = addDays(inicio, 6);
  const [, mi, di] = inicio.split('-');
  const [, mf, df] = fin.split('-');
  return mi === mf
    ? `${Number(di)} — ${Number(df)} ${MESES_CORTO[Number(mi) - 1]}`
    : `${Number(di)} ${MESES_CORTO[Number(mi) - 1]} — ${Number(df)} ${MESES_CORTO[Number(mf) - 1]}`;
}
