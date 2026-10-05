import { MuscleGroup, Mesocycle, WeekDistribution, MUSCLE_ORDER } from '../types';

const MUSCLE_GROUPS: MuscleGroup[] = MUSCLE_ORDER;

export function buildSnapshot(m: Mesocycle) {
  const groupSeries: Partial<Record<MuscleGroup, number>> = {};
  MUSCLE_GROUPS.forEach(g => { if (m.groups[g].series > 0) groupSeries[g] = m.groups[g].series; });
  return {
    daysPerWeek: m.daysPerWeek,
    cycleDays: m.cycleDays,
    splitId: m.splitId,
    // Serializado a texto: es el único campo del snapshot que es un array, y
    // la comparación de abajo es toda por igualdad simple.
    customOffsets: m.customOffsets ? m.customOffsets.join(',') : undefined,
    groupSeries,
  };
}

export function isStale(m: Mesocycle, dist: WeekDistribution): boolean {
  const cur  = buildSnapshot(m);
  const snap = dist.snapshot;
  // CUÁNDO cae cada sesión (calendario a mano, duración del ciclo) no cambia
  // QUÉ se entrena en ellas: son solo fechas, y las fechas del atleta se
  // reescriben solas desde el calendario. Antes, tocar un día marcaba el reparto
  // como «desactualizado» y pedía recalcular algo que no había cambiado
  // (Dani, 05-10-2026). Lo que sí obliga a recalcular es el número de sesiones,
  // otro reparto elegido de la lista o el volumen. Tocar el calendario suelta el
  // reparto de la lista (`splitId` pasa a undefined): eso no cuenta.
  if (cur.daysPerWeek !== snap.daysPerWeek) return true;
  if (cur.splitId !== undefined && cur.splitId !== snap.splitId) return true;
  const keys = new Set([...Object.keys(cur.groupSeries), ...Object.keys(snap.groupSeries)]) as Set<MuscleGroup>;
  for (const k of keys) {
    if (cur.groupSeries[k] !== snap.groupSeries[k]) return true;
  }
  return false;
}
