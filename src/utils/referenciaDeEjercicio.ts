import type { WorkoutLog } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Referencia nueva de un ejercicio (D3, 11-11-2026)

   Cuando el atleta cambia de máquina, de apoyo o de recorrido, los kilos de
   antes y los de después no miden lo mismo: bajar de 70 a 55 kg en la prensa
   por bajar más hondo no es perder fuerza, es otra tarea. Si se comparan,
   sale una «caída» falsa, y un récord falso el día que vuelve a la máquina de
   siempre.

   El atleta lo marca en la sesión («Otra máquina o recorrido») y
   queda en `WorkoutEntryLog.nuevaReferencia`. Desde esa sesión, lo que mide
   FUERZA (1RM estimado, récords, tendencia) solo mira hacia delante. Lo que
   mide TRABAJO (series, repeticiones, tonelaje) no se toca: ese trabajo se
   hizo igual.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Por ejercicio, la fecha (YYYY-MM-DD) de la última sesión marcada como referencia nueva. */
export function ultimaReferenciaPorEjercicio(logs: readonly WorkoutLog[]): Map<string, string> {
  const refs = new Map<string, string>();
  for (const log of logs) {
    for (const entry of log.entries) {
      if (!entry.nuevaReferencia) continue;
      if (log.date > (refs.get(entry.exerciseId) ?? '')) refs.set(entry.exerciseId, log.date);
    }
  }
  return refs;
}

/** ¿Una sesión de esa fecha es de ANTES de la referencia vigente del ejercicio? */
export function esAnteriorALaReferencia(refs: ReadonlyMap<string, string> | undefined, exerciseId: string, fecha: string): boolean {
  const ref = refs?.get(exerciseId);
  return ref != null && fecha < ref;
}
