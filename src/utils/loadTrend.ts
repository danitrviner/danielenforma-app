import { WorkoutLog } from '../types.js';
import { esAnteriorALaReferencia, ultimaReferenciaPorEjercicio } from './referenciaDeEjercicio.js';
import { marcaDeSesion } from './marcaDeSesion.js';
import { DataPoint } from './seriesCorrelation.js';
import { computeEWMA } from './ewma.js';

/**
 * Curva EWMA de la marca de cada sesión de un ejercicio (el e1RM de su mejor
 * serie válida, ver `marcaDeSesion.ts`) — para no leer un mal día aislado
 * (durmió mal, estresado) como una caída real de fuerza.
 * Un mismo día con varias sesiones no debería darse (un log por sesión), pero
 * si lo hubiera se queda con el mejor e1RM del día, no se suman.
 */
export function ewmaDeSeriePorSesion(logs: WorkoutLog[], exerciseId: string, lambda = 0.3): DataPoint[] {
  const porDia = new Map<string, number>();
  // D3: la curva empieza en la última referencia nueva (cambio de máquina o
  // de recorrido); mezclar las dos tareas dibujaría una caída que no existe.
  const refs = ultimaReferenciaPorEjercicio(logs);
  for (const log of logs) {
    if (esAnteriorALaReferencia(refs, exerciseId, log.date)) continue;
    for (const entry of log.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      // La marca de la sesión: el RM de su mejor serie VÁLIDA (D2, 17-11-2026).
      // Una sesión sin series válidas no tiene punto: antes entraba con el RM
      // de lo que hubiera (una serie de 20 a RIR 4) y doblaba la curva.
      const marca = marcaDeSesion(entry.sets);
      if (marca != null && marca > (porDia.get(log.date) ?? 0)) porDia.set(log.date, marca);
    }
  }
  const puntos: DataPoint[] = [...porDia.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return computeEWMA(puntos, lambda);
}
