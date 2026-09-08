import type { Mesocycle, Workout } from '../types';
import { diasDeCiclo, vueltasDelCiclo, offsetsDeSesiones } from './progression';
import { TRAINING_SPLITS, offsetsDeSplit, cicloDeSplit } from './trainingSplits';
import { addDays } from './trainingWeek';

/**
 * Días que dura una vuelta del microciclo, con el REPARTO elegido como fuente
 * de verdad de su propio calendario.
 *
 * `Mesocycle.cycleDays` es un campo suelto: elegir un reparto de la lista lo
 * rellena (`cicloDeSplit`), pero los dos se pueden desincronizar —mesociclos
 * viejos, un `cicloDeSplit` que cambió, o un split semanal cuyo `cycleDays`
 * quedó en 6 tras tocar el calendario a mano—. Cuando pasa, el generador
 * acababa produciendo un ciclo rotativo más corto que una semana y SIN día de
 * descanso, y las sesiones se desplazaban por el calendario vuelta tras vuelta
 * (cayendo en domingo, y saliendo en rojo días que aún no han llegado). Con un
 * `splitId` puesto manda el reparto; sin él, el cálculo de siempre.
 */
export function cicloDiasDeMeso(
  meso: Pick<Mesocycle, 'daysPerWeek' | 'cycleDays' | 'splitId'>,
): number {
  if (meso.splitId) {
    const split = TRAINING_SPLITS.find(sp => sp.id === meso.splitId);
    if (split) return cicloDeSplit(split);
  }
  return diasDeCiclo(meso.daysPerWeek, meso.cycleDays);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Volcar un mesociclo al calendario del atleta

   Qué fecha le toca a cada sesión. Vivía suelto dentro de `handleAssign` en
   MesocycleManager, y en cuanto hubo un segundo sitio desde el que asignar
   (el botón de la pestaña Ejercicios y el panel del cliente) copiar ese
   cálculo habría sido garantizar que los tres se desincronizaran. Una sola
   definición: la que decide las fechas reales del atleta.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Las sesiones de un mesociclo, EN EL ORDEN DEL CICLO.
 *
 * El orden sale de `dayIndex`, nunca del nombre ni del orden en que Firestore
 * devuelva los documentos —que es el fallo que hacía que la sesión 2 se
 * asignara antes que la 1—. Las rutinas anteriores a `dayIndex` conservan el
 * orden de lectura, que es lo único que se sabe de ellas.
 *
 * Una sesión = un documento `Workout`, reutilizado en todas las vueltas. Si un
 * mesociclo antiguo tiene varios documentos para el mismo día, se queda el
 * primero: son copias del mismo día, no días distintos.
 */
export function sesionesDeMesociclo(workouts: Workout[], mesocycleId: string): Workout[] {
  const propias = workouts.filter(w => w.mesocycleId === mesocycleId);
  const vistas = new Set<string>();
  const unicas: Workout[] = [];
  for (const w of propias) {
    const clave = w.dayIndex != null ? `d${w.dayIndex}` : `n:${w.name}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    unicas.push(w);
  }
  return unicas.sort((a, b) => {
    if (a.dayIndex != null && b.dayIndex != null) return a.dayIndex - b.dayIndex;
    if (a.dayIndex != null) return -1;
    if (b.dayIndex != null) return 1;
    return 0;
  });
}

/**
 * En qué día del ciclo (0-based) cae cada sesión.
 *
 * Un calendario tocado a mano manda sobre el cálculo automático, pero solo si
 * su longitud cuadra con las sesiones configuradas; si el coach cambió el
 * número de sesiones después de tocarlo, se cae al automático en vez de
 * asignar con un patrón que ya no encaja. Se ordena siempre: la sesión 1 es la
 * que cae antes, pase lo que pase.
 */
export function offsetsDelMesociclo(meso: Mesocycle): number[] {
  const cicloDias = cicloDiasDeMeso(meso);
  if (meso.customOffsets && meso.customOffsets.length === meso.daysPerWeek) {
    return [...meso.customOffsets].sort((a, b) => a - b);
  }
  const split = meso.splitId ? TRAINING_SPLITS.find(sp => sp.id === meso.splitId) : undefined;
  return offsetsDeSesiones({
    sesiones: meso.daysPerWeek,
    cicloDias,
    offsetsDelSplit: split ? offsetsDeSplit(split) : undefined,
    repartirEnElCiclo: meso.cycleDays !== undefined,
  });
}

export interface FechaDeSesion {
  /** Sesión del microciclo, 0-based — el índice dentro de `sesionesDeMesociclo`. */
  dayIdx: number;
  /** Vuelta del microciclo, 1-based. */
  vuelta: number;
  date: string;
}

/**
 * El calendario completo del bloque: una entrada por sesión y vuelta.
 *
 * `nSesiones` es cuántas sesiones hay DE VERDAD (las rutinas ya generadas),
 * que puede no coincidir con `meso.daysPerWeek` si el coach cambió el número
 * después de generar. Manda lo que existe: asignar una fecha a una sesión que
 * no está creada dejaría al atleta con un hueco en el calendario.
 */
export function fechasDelMesociclo(meso: Mesocycle, nSesiones: number): FechaDeSesion[] {
  const cicloDias = cicloDiasDeMeso(meso);
  const vueltas = vueltasDelCiclo(meso.weeks, cicloDias);
  const offsets = offsetsDelMesociclo(meso);
  const fechas: FechaDeSesion[] = [];
  for (let vuelta = 1; vuelta <= vueltas; vuelta++) {
    for (let dayIdx = 0; dayIdx < nSesiones; dayIdx++) {
      fechas.push({
        dayIdx,
        vuelta,
        date: addDays(meso.startDate, (vuelta - 1) * cicloDias + (offsets[dayIdx] ?? dayIdx)),
      });
    }
  }
  return fechas;
}
