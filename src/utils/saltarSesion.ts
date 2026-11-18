import type { WorkoutAssignment } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «No voy a poder hacerla» (17-11-2026)

   Una sesión que el atleta sabe que no va a hacer se quedaba «pendiente» hasta
   que a los 7 días pasaba sola a «perdida»: el coach veía una semana un hueco
   que no sabía leer (¿se le ha olvidado?, ¿está malo?) y el atleta, una tarjeta
   roja que no podía quitar. Ahora la marca él como saltada (`skipped`) y dice
   por qué en un toque.

   Hermano de `saltarEjercicio.ts` (saltar UN ejercicio dentro de la sesión).

   Dos límites que vienen de las reglas de Firestore, no de aquí:
     · el atleta solo puede cambiar `status` de su asignación, y solo a
       'completed', 'skipped' o 'perdido'. NO puede devolverla a 'pending'.
       Por eso «deshacer» no es una segunda escritura: la primera se retrasa
       unos segundos (`ESPERA_PARA_DESHACER_MS`) y deshacer la cancela.
     · no puede escribir ningún otro campo, así que HOY EL MOTIVO NO SE
       GUARDA: `WorkoutAssignment.note` existe, pero es la nota del coach para
       ese día. Cuando haya un campo propio, se escribe en `cambiosAlSaltar`
       y no hay que tocar nada más.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MOTIVOS_DE_SALTO = [
  { clave: 'salud', etiqueta: 'Enfermo o lesión', icono: 'personal_injury' },
  { clave: 'viaje', etiqueta: 'Viaje o trabajo', icono: 'route' },
  { clave: 'tiempo', etiqueta: 'Falta de tiempo', icono: 'schedule' },
  { clave: 'otro', etiqueta: 'Otro', icono: 'more_vert' },
] as const;

export type MotivoDeSalto = typeof MOTIVOS_DE_SALTO[number]['clave'];

/** Lo que el atleta tiene para arrepentirse antes de que se guarde. */
export const ESPERA_PARA_DESHACER_MS = 6000;

export function etiquetaDeMotivo(clave: MotivoDeSalto): string {
  return MOTIVOS_DE_SALTO.find(m => m.clave === clave)?.etiqueta ?? 'Otro';
}

/** «No la hice: viaje o trabajo» — el texto que se guardará cuando haya dónde. */
export function textoDeSalto(clave: MotivoDeSalto): string {
  return `No la hice: ${etiquetaDeMotivo(clave).toLowerCase()}`;
}

/**
 * ¿Se le ofrece «No voy a poder hacerla»? Solo en una sesión que sigue
 * pendiente (la de hoy, una futura o una atrasada que aún no se ha dado por
 * perdida) y que no tiene series apuntadas: con trabajo a medias lo que toca
 * es terminarla, no tirarlo.
 */
export function sePuedeSaltar(a: Pick<WorkoutAssignment, 'status'>, seriesAMedias: number): boolean {
  return a.status === 'pending' && seriesAMedias === 0;
}

/**
 * Lo que se escribe en la asignación al saltarla. Solo el estado: es lo único
 * que las reglas le dejan tocar al atleta (ver arriba). El motivo llega hasta
 * aquí para que guardarlo sea añadir una línea el día que exista el campo.
 */
export function cambiosAlSaltar(_motivo: MotivoDeSalto): Pick<WorkoutAssignment, 'status'> {
  return { status: 'skipped' };
}
