import type { DayAssignment, Mesocycle, MuscleGroup, WeekDistribution } from '../types.js';
import { SERIES_POR_DIA_TOPE } from './volumeSuggestion.js';
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

/**
 * La distribución que YA tienen los días de un mesociclo con ejercicios (el de
 * una plantilla terminada): por sesión, las series de cada grupo sumando las de
 * sus ejercicios. Es la que corresponde a esos ejercicios —no la que saldría
 * del volumen, que reparte los grupos a su manera y dejaba la pestaña
 * Ejercicios con huecos que no casaban—.
 *
 * `grupoDe`: grupo de un ejercicio que no lo lleve puesto (del catálogo).
 */
export function distribucionDesdeDias(
  meso: Mesocycle,
  grupoDe?: (exerciseId: string) => MuscleGroup | undefined,
): WeekDistribution | undefined {
  const dias = (meso.days ?? []).slice(0, meso.daysPerWeek);
  if (!dias.some(d => d.exercises.length > 0)) return undefined;
  const days = Array.from({ length: meso.daysPerWeek }, (_, i) => {
    const dia = dias[i];
    const assignments: DayAssignment[] = [];
    for (const e of dia?.exercises ?? []) {
      const group = e.muscleGroup ?? grupoDe?.(e.exerciseId);
      if (!group || !(e.sets > 0)) continue;
      const ya = assignments.find(a => a.group === group);
      if (ya) ya.series += e.sets; else assignments.push({ group, series: e.sets });
    }
    const totalSeries = assignments.reduce((s, a) => s + a.series, 0);
    // El orden de los grupos es el de los ejercicios: que no lo reordene el generador.
    return { assignments, totalSeries, ordenPropio: true, ...(dia?.name ? { dayType: dia.name } : {}) };
  });
  return {
    days,
    overloadAlert: days.some(d => d.totalSeries > SERIES_POR_DIA_TOPE),
    snapshot: buildSnapshot(meso),
    generatedAt: new Date().toISOString(),
  };
}
