import type { WorkoutAssignment, WorkoutExercise, WorkoutLog } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Una sesión ya hecha se enseña como se hizo, no como está la rutina hoy

   Una rutina de mesociclo es UN documento reutilizado en todas las vueltas.
   Cambiar el mesociclo —regenerarlo, cambiar un ejercicio, reasignarlo— edita
   ese documento, y con él cambiaba también el pasado: el lunes ya entrenado se
   pintaba con los ejercicios NUEVOS, y las series apuntadas de los ejercicios
   que ya no estaban en la rutina desaparecían de la pantalla. Peor: si el
   atleta abría ese lunes para corregir un peso y guardaba, el registro se
   reescribía a partir de la rutina nueva y esas series se borraban de verdad
   (13-10, «han perdido parte de los datos de los ejercicios»).

   La regla: si todo lo apuntado sigue en la rutina, nada cambia. Si falta
   algo, manda el registro: se enseñan los ejercicios que se hicieron, en el
   orden en que se hicieron, con la pauta de la rutina cuando sigue ahí y con
   una pauta deducida de las propias series cuando ya no.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Pauta mínima de un ejercicio que ya no está en la rutina, sacada de lo que
 *  se apuntó: tantas series como se hicieron y el rango de reps real. */
function pautaDeducida(entrada: WorkoutLog['entries'][number], order: number): WorkoutExercise {
  const reps = entrada.sets.map(s => s.repsDone).filter(r => r > 0);
  const min = reps.length > 0 ? Math.min(...reps) : 0;
  const max = reps.length > 0 ? Math.max(...reps) : 0;
  return {
    exerciseId: entrada.exerciseId,
    order,
    sets: Math.max(1, entrada.sets.length),
    reps: reps.length === 0 ? '—' : min === max ? String(min) : `${min}-${max}`,
    restSeconds: 0,
    rir: entrada.sets[0]?.rir ?? 0,
  };
}

/**
 * Los ejercicios con los que pintar (o editar) una sesión ya registrada.
 * `rutina` es la rutina actual, ya resuelta para esa semana; puede venir vacía
 * si la rutina se borró.
 */
export function ejerciciosDeSesionHecha(
  rutina: readonly WorkoutExercise[],
  log: Pick<WorkoutLog, 'entries'>,
): WorkoutExercise[] {
  const ordenada = rutina.slice().sort((a, b) => a.order - b.order);
  const enRutina = new Set(ordenada.map(we => we.exerciseId));
  if (log.entries.every(e => enRutina.has(e.exerciseId))) return ordenada;

  return log.entries.map((entrada, i) => {
    const pautado = ordenada.find(we => we.exerciseId === entrada.exerciseId);
    return pautado ? { ...pautado, order: i } : pautaDeducida(entrada, i);
  });
}

/**
 * El registro de una asignación. Primero por id; si no, por fecha —una
 * asignación recreada al reprogramar tiene id nuevo, pero el entreno de ese
 * día sigue siendo suyo—. Misma regla que `estadoDeAsignacion.ts`.
 */
export function logDeAsignacion<L extends Pick<WorkoutLog, 'assignmentId' | 'date' | 'workoutId'>>(
  logs: readonly L[],
  asignacion: Pick<WorkoutAssignment, 'id' | 'date' | 'workoutId'>,
): L | undefined {
  return logs.find(l => l.assignmentId === asignacion.id)
    ?? logs.find(l => l.date === asignacion.date && l.workoutId === asignacion.workoutId)
    ?? logs.find(l => l.date === asignacion.date);
}
