import type { Mesocycle } from '../types.js';
import { mesocycleWeekNumber, vueltasDelCiclo } from './progression.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Semana N» del bloque: una sola cuenta (F5, 17-11-2026)

   Había tres. Rutinas contaba por VUELTA del microciclo, el Road map del atleta
   por días/7 y la revisión del coach rotulaba «S1…S8» sobre las ocho últimas
   columnas: en un bloque de 10 semanas la S3 salía como «S1», y con un ciclo
   de 14 días el Road map decía «semana 4» donde Rutinas decía «semana 2».

   La que vale es la de Rutinas, porque es la que resuelve lo programado
   (`resolverEjercicioDelMeso` va por vuelta): semana N = vuelta N del ciclo,
   contada desde `startDate`. Con un ciclo semanal coincide con la semana de
   calendario del bloque, así que para la mayoría de bloques no cambia nada.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo que hace falta del bloque. Solo `startDate` es obligatorio: sin datos del
 *  ciclo (o pasando `cicloDias` a mano) la vuelta dura una semana. */
export type BloqueParaSemana =
  Pick<Mesocycle, 'startDate'> & Partial<Pick<Mesocycle, 'weeks' | 'daysPerWeek' | 'cycleDays' | 'splitId' | 'reparto'>>;

/** Días que dura la «semana» de este bloque (una vuelta del microciclo). */
export function diasDeSemanaDelBloque(bloque: BloqueParaSemana): number {
  const sinCiclo = bloque.daysPerWeek == null && bloque.cycleDays == null && !bloque.splitId && !bloque.reparto;
  if (sinCiclo) return 7;
  const dias = cicloDiasDeMeso({
    daysPerWeek: bloque.daysPerWeek ?? 0, cycleDays: bloque.cycleDays, splitId: bloque.splitId, reparto: bloque.reparto,
  });
  return Number.isFinite(dias) && dias > 0 ? dias : 7;
}

/** Cuántas semanas (vueltas) tiene el bloque; `null` si no se sabe cuánto dura. */
export function totalDeSemanasDelBloque(bloque: BloqueParaSemana, cicloDias = diasDeSemanaDelBloque(bloque)): number | null {
  return bloque.weeks != null && bloque.weeks > 0 ? vueltasDelCiclo(bloque.weeks, cicloDias) : null;
}

/**
 * Semana del bloque (1 = la primera) en la que cae `fecha`: la vuelta del
 * ciclo, nunca menos de 1 ni más que las que tiene el bloque. `cicloDias` solo
 * hace falta pasarlo cuando no se tiene el mesociclo delante.
 */
export function semanaDelBloque(bloque: BloqueParaSemana, fecha: string, cicloDias = diasDeSemanaDelBloque(bloque)): number {
  const semana = mesocycleWeekNumber(bloque.startDate, fecha, cicloDias);
  const total = totalDeSemanasDelBloque(bloque, cicloDias);
  return total == null ? semana : Math.min(total, semana);
}
