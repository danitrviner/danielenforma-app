/**
 * Series PRINCIPALES de un ejercicio: sin las bajadas (dropset) ni miniseries
 * (myoreps) o pausas (rest-pause) añadidas tras la última serie (`segmento: true`).
 *
 * Una técnica de intensidad se SUMA a la serie, no es una serie más. Para todo
 * lo que cuenta series —volumen, estímulo, RIR medio, series hechas frente a
 * pautadas— se usa esto. Para lo que cuenta carga real (tonelaje, 1RM, mejor
 * serie) se siguen usando todas las filas: levantar ese peso fue real.
 */
export function seriesPrincipales<T extends { segmento?: boolean }>(sets: readonly T[]): T[] {
  return sets.filter(s => !s.segmento);
}

export type EstadoDelEjercicio = 'abierto' | 'tecnica-pendiente' | 'cerrado';

/**
 * En qué punto está un ejercicio de la sesión.
 *
 * `tecnica-pendiente`: las series principales están hechas pero quedan bajadas
 * o miniseries sin marcar. Antes eso contaba como «abierto» sin salida (Dani,
 * 28-10-2026): la tarjeta deja las filas de la técnica sin reps «para
 * marcarlas después», así que un drop set o unas myo-reps sin apuntar dejaban
 * el ejercicio colgado —sin «Siguiente» y, en el último, sin cierre—. Tampoco
 * vale cerrarlo solo en ese momento: las filas de la técnica desaparecerían
 * justo antes de hacerlas. Por eso es un estado propio, con su botón.
 */
export function estadoDelEjercicio(sets: readonly { done: boolean; segmento?: boolean }[]): EstadoDelEjercicio {
  const principales = seriesPrincipales(sets);
  if (principales.length === 0 || !principales.every(s => s.done)) return 'abierto';
  return sets.every(s => s.done) ? 'cerrado' : 'tecnica-pendiente';
}
