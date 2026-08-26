import { WorkoutLog } from '../types';
import { epley } from './oneRepMax';
import { DataPoint } from './seriesCorrelation';
import { computeEWMA } from './ewma';

/**
 * Curva EWMA del mejor e1RM por sesión de un ejercicio — para no leer un mal
 * día aislado (durmió mal, estresado) como una caída real de fuerza.
 * Un mismo día con varias sesiones no debería darse (un log por sesión), pero
 * si lo hubiera se queda con el mejor e1RM del día, no se suman.
 */
export function ewmaDeSeriePorSesion(logs: WorkoutLog[], exerciseId: string, lambda = 0.3): DataPoint[] {
  const porDia = new Map<string, number>();
  for (const log of logs) {
    for (const entry of log.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      for (const set of entry.sets) {
        const orm = epley(set.weight, set.repsDone);
        if (orm > (porDia.get(log.date) ?? 0)) porDia.set(log.date, orm);
      }
    }
  }
  const puntos: DataPoint[] = [...porDia.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return computeEWMA(puntos, lambda);
}
