import type { CardioAplazo, CardioAssignment } from '../types';
import { addDays, fechaCorta } from './trainingWeek';
import { protocoloVo2max } from './cardioProgression';

/** El día siguiente a `hoy` (YYYY-MM-DD). */
export function mananaDe(hoy: string): string {
  return addDays(hoy, 1);
}

/** ¿Ha aplazado el atleta el cardio de HOY? */
export function aplazadoHoy(aplazos: readonly CardioAplazo[], hoy: string): CardioAplazo | undefined {
  return aplazos.find(a => a.desde === hoy);
}

/**
 * Las asignaciones tal y como aplican HOY tras los aplazos.
 *
 *  · Una asignación PUNTUAL (con `date`) aplazada se mueve de verdad: hoy
 *    desaparece y mañana aparece. Sin esto, mañana no la encontraría.
 *  · Una RECURRENTE (sin `date`, «X veces por semana») no tiene día que mover:
 *    solo se oculta el día aplazado; mañana sigue pautada como siempre.
 *
 * No modifica la asignación guardada (las escribe solo el coach).
 */
export function aplicarAplazos(
  assignments: readonly CardioAssignment[],
  aplazos: readonly CardioAplazo[],
  hoy: string,
): CardioAssignment[] {
  const aplazadoDeHoy = aplazos.some(a => a.desde === hoy);
  return assignments.flatMap(asg => {
    const aplazo = aplazos.find(a => a.assignmentId === asg.id && (asg.date ? asg.date === a.desde : true));
    if (asg.date) {
      if (!aplazo) return [asg];
      // Puntual: el día efectivo pasa a ser `hasta`.
      return [{ ...asg, date: aplazo.hasta }];
    }
    // Recurrente: hoy se oculta si se aplazó hoy y es la que se aplazó (o no se sabe cuál).
    if (aplazadoDeHoy && aplazos.some(a => a.desde === hoy && (!a.assignmentId || a.assignmentId === asg.id))) return [];
    return [asg];
  });
}

/** Días hacia atrás que enseña el coach en «Aplazos recientes». */
export const DIAS_DE_APLAZOS = 30;

const TIPO_LABEL: Record<string, string> = { zona2: 'Zona 2', intervalos: 'Intervalos', libre: 'Libre' };

/** Cómo se llama una prescripción de cardio en las pantallas del coach. */
export function nombreDeAsignacion(a: CardioAssignment): string {
  if (a.program?.kind === 'vo2max') return `VO₂máx · ${protocoloVo2max(a.program.protocolId).label}`;
  if (a.program?.kind === 'zona2') return 'Zona 2 progresiva';
  return TIPO_LABEL[a.type] ?? a.type;
}

export interface LineaDeAplazo {
  id: string;
  /** «mar 21 oct → mié 22 oct». */
  texto: string;
  /** La prescripción aplazada, si todavía existe. */
  nombre?: string;
}

/**
 * Lo que se enseña al coach: los aplazos de los últimos `DIAS_DE_APLAZOS` días
 * (del más reciente al más antiguo) y cuántos son. `asignaciones` solo pone
 * nombre; un aplazo cuya prescripción ya no está se enseña igual, sin nombre.
 */
export function resumenDeAplazos(
  aplazos: readonly CardioAplazo[],
  asignaciones: readonly CardioAssignment[],
  hoy: string,
): { total: number; lineas: LineaDeAplazo[] } {
  const desde = addDays(hoy, -DIAS_DE_APLAZOS);
  const lineas = [...aplazos]
    .filter(a => a.desde >= desde)
    .sort((a, b) => b.desde.localeCompare(a.desde))
    .map(a => {
      const asg = a.assignmentId ? asignaciones.find(x => x.id === a.assignmentId) : undefined;
      return {
        id: a.id,
        texto: `${fechaCorta(a.desde, { dia: true })} → ${fechaCorta(a.hasta, { dia: true })}`,
        ...(asg ? { nombre: nombreDeAsignacion(asg) } : {}),
      };
    });
  return { total: lineas.length, lineas };
}
