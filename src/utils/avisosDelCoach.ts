import { CoachClientTask } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// AVISOS DEL COACH — las tareas con fecha que Dani se pone a sí mismo.
//
// `CoachClientTask.dueDate` existía desde que la IA empezó a dejar notas con
// `add_coach_task`, y no se pintaba en ningún sitio: se guardaba una fecha que
// nadie volvía a ver. Esto es lo que la saca a la luz.
//
// ── No hay servidor ────────────────────────────────────────────────────────
// Este proyecto no tiene cron ni Cloud Functions, así que un aviso no puede
// "saltar" solo: se calcula al abrir la app, igual que el resto de alertas del
// coach. Eso decide el vocabulario — «se pasó el 12 sep», no «te avisamos el
// 12 sep»— porque prometer un aviso que solo llega si entras es peor que no
// prometerlo.
// ═══════════════════════════════════════════════════════════════════════════

export type EstadoAviso = 'vencido' | 'hoy' | 'proximo' | 'lejano';

export interface AvisoDelCoach {
  tarea: CoachClientTask;
  estado: EstadoAviso;
  /** Días hasta la fecha. Negativo = se pasó. */
  dias: number;
  /** Lo que se lee: «Se pasó hace 3 días», «Hoy», «En 2 días». */
  texto: string;
}

/** Días naturales entre dos fechas ISO. */
export function diasHasta(desde: string, hasta: string): number {
  const a = new Date(`${desde}T12:00:00`).getTime();
  const b = new Date(`${hasta}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Cuántos días por delante se considera «próximo». */
export const VENTANA_PROXIMO = 7;

export function clasificarAviso(tarea: CoachClientTask, hoy: string): AvisoDelCoach | null {
  if (!tarea.dueDate || tarea.done) return null;
  const dias = diasHasta(hoy, tarea.dueDate);
  if (dias < 0) {
    return {
      tarea, dias, estado: 'vencido',
      texto: dias === -1 ? 'Se pasó ayer' : `Se pasó hace ${-dias} días`,
    };
  }
  if (dias === 0) return { tarea, dias, estado: 'hoy', texto: 'Hoy' };
  if (dias <= VENTANA_PROXIMO) {
    return { tarea, dias, estado: 'proximo', texto: dias === 1 ? 'Mañana' : `En ${dias} días` };
  }
  return { tarea, dias, estado: 'lejano', texto: `El ${tarea.dueDate}` };
}

/**
 * Los avisos que reclaman algo AHORA, del más vencido al más reciente.
 *
 * Deja fuera los lejanos a propósito: una tarea para dentro de tres semanas no
 * es un aviso, es una nota. Meterla en la misma lista que lo vencido es cómo
 * una bandeja de avisos deja de mirarse.
 */
export function avisosActivos(tareas: CoachClientTask[], hoy: string): AvisoDelCoach[] {
  return tareas
    .map(t => clasificarAviso(t, hoy))
    .filter((a): a is AvisoDelCoach => a !== null && a.estado !== 'lejano')
    .sort((a, b) => a.dias - b.dias);
}

/** Cuántos están vencidos o vencen hoy — lo que va en un contador. */
export function cuentaUrgentes(tareas: CoachClientTask[], hoy: string): number {
  return tareas.reduce((n, t) => {
    const a = clasificarAviso(t, hoy);
    return n + (a && (a.estado === 'vencido' || a.estado === 'hoy') ? 1 : 0);
  }, 0);
}

/**
 * Clave de deduplicación de la notificación.
 *
 * Lleva la fecha de vencimiento, no la de hoy: así el aviso se crea UNA vez
 * cuando vence y no uno nuevo cada día que el coach abra la app sin hacerle
 * caso. Mismo criterio que las claves por mes/semana del resto de avisos del
 * coach (ClientsScreen).
 */
export function claveDeAviso(tarea: CoachClientTask): string {
  return `notif_task_${tarea.id}_${tarea.dueDate}`;
}
