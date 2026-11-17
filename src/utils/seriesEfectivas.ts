import type { WorkoutLog } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Series efectivas realizadas (S10, 11-11-2026)

   El volumen que cuenta es el de series duras. Una serie que se para a 5 o
   más repeticiones del fallo apenas suma, así que 16 series apuntadas pueden
   ser 9 de verdad. Aquí se cuenta cuántas de las series hechas llegaron a
   RIR 4 o menos (o al fallo).

   Depende de que el RIR apuntado sea fiable: si la calibración (F4) dice que
   se queda lejos, el dato real es aún peor que este.
   ═══════════════════════════════════════════════════════════════════════════ */

/** RIR máximo con el que una serie todavía cuenta como efectiva. */
export const RIR_EFECTIVO_MAXIMO = 4;
/** Por debajo de este porcentaje se avisa al coach. */
export const EFECTIVAS_MINIMO_PCT = 80;
/** Con menos series que estas no se saca ninguna conclusión. */
export const SERIES_MINIMAS = 10;

export interface SeriesEfectivas {
  hechas: number;
  efectivas: number;
  /** Efectivas ÷ hechas × 100, redondeado. `null` con pocas series. */
  pct: number | null;
  /** Ejercicios con más series lejos del fallo, del que más al que menos. */
  dondeSePierden: { exerciseId: string; lejos: number }[];
}

export function seriesEfectivas(logs: readonly WorkoutLog[]): SeriesEfectivas {
  let hechas = 0;
  let efectivas = 0;
  const lejosPor = new Map<string, number>();
  for (const log of logs) {
    for (const entry of log.entries) {
      for (const s of seriesPrincipales(entry.sets)) {
        if (!(s.weight > 0) || !(s.repsDone > 0)) continue;
        hechas += 1;
        if (s.alFallo || (s.rir ?? 0) <= RIR_EFECTIVO_MAXIMO) efectivas += 1;
        else lejosPor.set(entry.exerciseId, (lejosPor.get(entry.exerciseId) ?? 0) + 1);
      }
    }
  }
  return {
    hechas, efectivas,
    pct: hechas >= SERIES_MINIMAS ? Math.round((efectivas / hechas) * 100) : null,
    dondeSePierden: [...lejosPor.entries()].map(([exerciseId, lejos]) => ({ exerciseId, lejos })).sort((a, b) => b.lejos - a.lejos),
  };
}
