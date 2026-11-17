import type { WorkoutSetLog } from '../types.js';
import { rirEfectivo } from './oneRepMax.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Qué series valen para estimar el RM (17-11-2026)

   El RM estimado sale de una serie submáxima (peso, repeticiones y RIR). No
   todas las series lo estiman igual de bien, y hasta ahora entraban todas las
   que tuvieran 3 repeticiones o más: una serie de 20 a RIR 3 «valía» lo mismo
   que una de 6 a RIR 1. Aquí está el único filtro, para que el seguimiento, el
   cierre de bloque, los informes y los récords hablen del mismo RM.

   · Repeticiones: de 3 a 12. Las fórmulas pierden precisión al alejarse del
     fallo en repeticiones (R² 0,99 con 5RM, 0,95 con 20RM; Reynolds 2006) y
     por encima de 10-12 no se recomiendan.
   · RIR: 2 o menos. El RIR que se apunta uno mismo falla en torno a una
     repetición y empeora cuanto más lejos del fallo (Halperin 2022).
   · RIR apuntado por el atleta. Una serie guardada con el RIR pautado sin
     tocar (`rirApuntado === false`) no dice nada de su esfuerzo. Los registros
     antiguos no llevan la marca y se dan por buenos: no hay forma de saberlo.
   · Bajadas y miniseries fuera: se hacen con fatiga encima.

   La FÓRMULA no cambia (utils/oneRepMax.ts, decisión de Dani del 16-10): esto
   solo decide qué series se le pasan.
   ═══════════════════════════════════════════════════════════════════════════ */

export const REPS_MIN_RM = 3;
export const REPS_MAX_RM = 12;
export const RIR_MAX_RM = 2;

export type SerieParaRm = Pick<WorkoutSetLog, 'repsDone' | 'rir' | 'alFallo' | 'segmento' | 'rirApuntado'>;

/** Por qué una serie no vale para el RM, o `null` si vale. */
export function motivoDeNoValer(s: SerieParaRm): 'segmento' | 'reps' | 'rir' | 'rir_sin_apuntar' | null {
  if (s.segmento) return 'segmento';
  if (!(s.repsDone >= REPS_MIN_RM && s.repsDone <= REPS_MAX_RM)) return 'reps';
  if (s.rirApuntado === false && !s.alFallo) return 'rir_sin_apuntar';
  if (rirEfectivo(s.rir, s.alFallo) > RIR_MAX_RM) return 'rir';
  return null;
}

/** ¿La serie vale para estimar el RM? */
export function esSerieValidaParaRm(s: SerieParaRm): boolean {
  return motivoDeNoValer(s) === null;
}

/** Las series de una sesión que valen para el RM. */
export function seriesValidasParaRm<T extends SerieParaRm>(sets: readonly T[]): T[] {
  return sets.filter(esSerieValidaParaRm);
}

/** Mediana de una lista (vacía → `null`). */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
