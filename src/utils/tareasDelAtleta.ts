import type { TaskItem } from '../types';
import { diasEntreFechas } from './trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué tareas se le enseñan al atleta (28-10-2026)

   Las tareas de revisión/cuestionario/foto con fecha son del CICLO de esa
   semana: la revisión del 27-09 que nadie cerró no es «se te pasó», es
   historia. En producción había 22 así, vencidas desde septiembre, en la
   lista de «Tareas pendientes» de los atletas — y una app que te recuerda
   cada día algo que ya no puedes hacer parece rota. Las manuales del coach
   («manda vídeo de la sentadilla») sí se quedan hasta que se cierren.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Días tras la fecha a partir de los cuales una tarea de ciclo caduca sola. */
export const DIAS_CADUCIDAD_TAREA_DE_CICLO = 7;

const DE_CICLO: ReadonlySet<TaskItem['type']> = new Set(['revision', 'cuestionario', 'foto']);

export function tareasVigentes(tareas: readonly TaskItem[], hoy: string): TaskItem[] {
  return tareas.filter(t => {
    if (t.status !== 'pending') return false;
    if (!DE_CICLO.has(t.type) || !t.dueDate) return true;
    return diasEntreFechas(t.dueDate, hoy) <= DIAS_CADUCIDAD_TAREA_DE_CICLO;
  });
}
