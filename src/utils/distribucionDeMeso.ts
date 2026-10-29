import type { Mesocycle, WeekDistribution } from '../types.js';
import { repartoDelMesociclo, tiposDeEntrenamiento, gruposPorSesion } from './trainingSplits.js';
import { cicloDiasDeMeso, offsetsDelMesociclo } from './asignacionMesociclo.js';
import { runDistribution } from './programacion.js';
import { buildSnapshot } from './repartoDesactualizado.js';

/**
 * La distribución de un mesociclo tal y como está (reparto, calendario y
 * volumen). La usan el editor («Distribución automática», aplicar un reparto)
 * y el asistente al proponer un mesociclo con reparto: un solo cálculo, así lo
 * que propone el asistente es lo mismo que saldría pulsando el botón.
 *
 * Con un reparto salido de la calculadora (`reparto.frecuencias`) es exacta:
 * cada grupo va a todos sus días.
 */
export function distribucionDeMeso(meso: Mesocycle): WeekDistribution {
  const reparto = repartoDelMesociclo(meso);
  const result = runDistribution(
    meso.groups,
    meso.daysPerWeek,
    reparto ? tiposDeEntrenamiento(reparto) : undefined,
    { cicloDias: cicloDiasDeMeso(meso), offsets: offsetsDelMesociclo(meso) },
    reparto ? gruposPorSesion(reparto) : undefined,
    !!meso.reparto?.frecuencias,
  );
  return { ...result, snapshot: buildSnapshot(meso), generatedAt: new Date().toISOString() };
}
