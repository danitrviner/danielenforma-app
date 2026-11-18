import type { Mesocycle } from '../types.js';
import { rangoDelMeso } from './bloqueDelAtleta.js';
import { addDays, esFechaIso } from './trainingWeek.js';

/**
 * Último día del bloque (17-11-2026).
 *
 * Un mesociclo dura sus vueltas × los días del ciclo (`rangoDelMeso`), que
 * solo coincide con `weeks × 7` cuando el ciclo es la semana: 8 semanas con
 * ciclo de 5 días son 11 vueltas = 55 días, y 4 semanas con ciclo de 10 son
 * 30. El cierre usaba `weeks × 7` por su cuenta: daba el bloque por terminado
 * antes (o después) de tiempo, el aviso de cierre saltaba a destiempo y las
 * últimas sesiones contaban en la adherencia pero no en la progresión.
 *
 * Archivo propio y pequeño para que lo puedan usar tanto el motor del cierre
 * como `cierreParaAtleta` sin arrastrar el informe de entrenamiento entero.
 * Si al mesociclo le falta algún dato del ciclo (fichas antiguas), cae a
 * `weeks × 7`, que es lo que se hacía.
 */
export function finDeBloque(meso: Mesocycle): string {
  const hasta = rangoDelMeso(meso)?.hasta;
  return hasta && esFechaIso(hasta) ? hasta : addDays(meso.startDate, meso.weeks * 7 - 1);
}
