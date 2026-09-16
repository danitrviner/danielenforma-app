import { Mesocycle, TaskItem, WorkoutAssignment } from '../types';
import { PlanEvent } from './planEvents';
import { mesocycleWeekNumber } from './progression';
import { cicloDiasDeMeso } from './asignacionMesociclo';

/* ═══════════════════════════════════════════════════════════════════════════
   Mover una cosa de un día a otro en el calendario.

   Esto vivía entero dentro del `handleDrop` de NivelMes, y arrastrar con el
   ratón era la ÚNICA forma de hacerlo: el HTML5 drag-and-drop no existe en
   una pantalla táctil, así que desde el móvil no se podía mover nada. El
   entreno ya tenía su salida por el sheet del día; el hito y el evento de
   volumen no tenían ninguna.

   Sacar la decisión aquí permite que las dos puertas —arrastrar y el selector
   de fecha del sheet— hagan exactamente lo mismo, en vez de que la segunda
   sea una reimplementación que se desvíe con el tiempo. Y permite probarla,
   que es lo que de verdad hacía falta: la parte del volumen no mueve una
   fecha, reescribe el `atWeek` de la regla que originó el evento.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Algo que está en un día concreto y se puede llevar a otro. */
export type Movible =
  | { tipo: 'entreno'; id: string; etiqueta: string }
  | { tipo: 'hito'; id: string; etiqueta: string }
  | { tipo: 'volumen'; id: string; etiqueta: string };

/** La orden concreta que hay que ejecutar. `null` = no hay nada que hacer. */
export type OrdenDeMovimiento =
  | { tipo: 'entreno'; assignmentId: string; fecha: string }
  | { tipo: 'hito'; taskId: string; fecha: string }
  | { tipo: 'volumen'; workoutId: string; exerciseId: string; semanaVieja: number; semanaNueva: number };

/**
 * Qué hay en `fecha` que se pueda mover, en el mismo orden de prioridad que
 * usaba la celda al arrastrar (entreno › hito › volumen).
 *
 * A diferencia de la celda, que solo podía arrastrar UNA cosa por día, aquí se
 * devuelven todas: el sheet tiene sitio para preguntar cuál.
 */
export function moviblesDelDia(args: {
  fecha: string;
  workoutAssignments: WorkoutAssignment[];
  tasks: TaskItem[];
  volumeEvents: PlanEvent[];
}): Movible[] {
  const { fecha, workoutAssignments, tasks, volumeEvents } = args;
  const salida: Movible[] = [];

  const asignacion = (workoutAssignments ?? []).find(a => a.date === fecha);
  if (asignacion) salida.push({ tipo: 'entreno', id: asignacion.id, etiqueta: 'Entreno' });

  const tarea = (tasks ?? []).find(t => t.dueDate === fecha);
  if (tarea) salida.push({ tipo: 'hito', id: tarea.id, etiqueta: tarea.title || 'Hito' });

  const evento = (volumeEvents ?? []).find(e => e.date === fecha && e.moveRef);
  if (evento) salida.push({ tipo: 'volumen', id: evento.id, etiqueta: evento.title || 'Cambio de volumen' });

  return salida;
}

/**
 * Traduce «llevar esto al día X» a la orden que toca.
 *
 * Devuelve `null` cuando no hay nada que hacer: mismo día, evento de volumen
 * sin `moveRef` (no se puede reprogramar), mesociclo que ya no existe, o una
 * semana de destino que coincide con la de origen — mover un evento de volumen
 * tres días dentro de la misma semana no es mover nada.
 */
export function ordenDeMovimiento(
  movible: Movible,
  fechaDestino: string,
  ctx: { fechaOrigen: string; volumeEvents: PlanEvent[]; mesocycles: Mesocycle[] },
): OrdenDeMovimiento | null {
  if (!fechaDestino || fechaDestino === ctx.fechaOrigen) return null;

  if (movible.tipo === 'entreno') return { tipo: 'entreno', assignmentId: movible.id, fecha: fechaDestino };
  if (movible.tipo === 'hito') return { tipo: 'hito', taskId: movible.id, fecha: fechaDestino };

  const evento = ctx.volumeEvents.find(e => e.id === movible.id);
  if (!evento?.moveRef) return null;
  const meso = ctx.mesocycles.find(m => m.id === evento.moveRef!.mesocycleId);
  if (!meso) return null;

  const semanaNueva = mesocycleWeekNumber(meso.startDate, fechaDestino, cicloDiasDeMeso(meso));
  if (semanaNueva === evento.moveRef.atWeek) return null;

  return {
    tipo: 'volumen',
    workoutId: evento.moveRef.workoutId,
    exerciseId: evento.moveRef.exerciseId,
    semanaVieja: evento.moveRef.atWeek,
    semanaNueva,
  };
}
