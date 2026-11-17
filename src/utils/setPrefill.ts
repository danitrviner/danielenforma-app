import { Workout, WorkoutEntryLog, WorkoutLog } from '../types.js';
import { expandSetGroups } from './setGroups.js';
import { sugerirCarga, serieDeReferencia } from './cargaSugerida.js';
import { segmentosProgramados, seriesPrincipales } from './tecnicaDeSerie.js';
import type { TipoDeSemana } from './tipoDeSemana.js';

/** Fila de entrada del editor de series — mismo shape que `SetInput` en
 * TrainingScreen.tsx, extraído aquí para poder testear el prerelleno sin
 * montar el componente completo. */
export interface SetPrefill {
  weight: string;
  repsDone: string;
  rir: string; // '0'-'5' o 'fallo'
  done: boolean;
  /** Bajada o miniserie programada (14-b), tras la serie `segmentoDe`. */
  segmento?: boolean;
  segmentoDe?: number;
}

/**
 * Fase 3 (decisión de Dani, 2026-08-07 — "Registro editable en la sesión"):
 * la tabla llega PRERRELLENADA con lo del último día, no vacía con el dato
 * anterior solo como referencia. Regla de prerelleno (Contrato-de-datos.md):
 * el peso y las repeticiones por defecto salen de la última sesión del mismo
 * `exerciseId` con el mismo número de serie.
 *
 * El RIR NO. El RIR es una PAUTA del entrenador, no una marca personal: dice
 * cuánto esfuerzo quiere que le meta a esa serie. Heredar el de la sesión
 * anterior hacía que a partir del segundo día el atleta viera el RIR que él
 * mismo tecleó la vez pasada en vez del que le ha puesto su entrenador, y si
 * un día se equivocaba, el error se arrastraba sesión tras sesión. Siempre
 * manda `row.rir` (Dani, 10-09-2026).
 *
 * El desplegable sigue siendo editable: lo que el atleta anote se guarda en su
 * `WorkoutLog`, que es otro documento — la prescripción del coach en
 * `Workout.exercises[].rir` no se toca nunca desde aquí.
 *
 * F7a (17-11-2026): en semana de descarga, puente o vuelta de parón (`semana`)
 * la fila no llega con la carga nueva aunque tocara subir: se repite lo de la
 * última vez.
 *
 * F19 (17-11-2026): si la última vez hubo menos series que las pautadas hoy
 * —sesión cortada, o venir de una descarga con la mitad— las filas de más
 * copian la última serie con repeticiones (`serieDeReferencia`) en vez de
 * llegar vacías. Es la misma referencia que usa `sugerirCarga`, así que si esa
 * serie sube, las de más suben con ella y la tabla no mezcla dos pesos.
 */
export function prefillWorkoutSets(
  workout: Workout, prevEntries: WorkoutEntryLog[],
  /** Salto real de carga de cada ejercicio (`saltoReal`), si se conoce. */
  saltoDe?: (exerciseId: string) => number | null,
  /** Semana de descarga, puente o vuelta de parón (`tipoDeSemana`), si lo es. */
  semana?: TipoDeSemana | null,
): SetPrefill[][] {
  return workout.exercises
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(we => {
      const prevEntry = prevEntries.find(e => e.exerciseId === we.exerciseId);
      // Donde toca subir (doble progresión, ver cargaSugerida.ts) la fila llega
      // ya con la carga nueva y el mínimo del rango, no con lo de la última vez.
      const sugerida = sugerirCarga(we, prevEntry, saltoDe?.(we.exerciseId), semana).series;
      // «La serie 2 de la última vez» cuenta solo series principales: las
      // bajadas de una técnica en otra serie que no sea la última van en medio.
      const previas = prevEntry ? seriesPrincipales(prevEntry.sets) : [];
      const filas = expandSetGroups(we);
      const principales: SetPrefill[] = filas.map((row, sIdx) => {
        const prev = serieDeReferencia(previas, sIdx);
        const sube = sugerida[sIdx];
        if (sube) return { weight: String(sube.peso), repsDone: String(sube.reps), rir: String(row.rir), done: false };
        return {
          weight: prev && prev.weight > 0 ? String(prev.weight) : '',
          repsDone: prev && prev.repsDone > 0 ? String(prev.repsDone) : '',
          rir: String(row.rir),
          done: false,
        };
      });
      // Bajadas / miniseries ya puestas (14-b), DETRÁS de las principales: así
      // las filas de las series no se mueven. Sin marcar no se guardan.
      const segmentos = segmentosProgramados(we, filas.length)
        .map(segmentoDe => ({ weight: '', repsDone: '', rir: '0', done: false, segmento: true, segmentoDe }));
      return [...principales, ...segmentos];
    });
}

/** ¿Tiene esta entrada alguna serie de verdad (con repeticiones)? Un ejercicio
 *  saltado con motivo se guarda con `sets: []` y su nota: es una entrada, pero
 *  no es «la última vez que lo hizo». */
export function tieneSeriesValidas(entry: Pick<WorkoutEntryLog, 'sets'>): boolean {
  return seriesPrincipales(entry.sets).some(s => s.repsDone > 0);
}

/**
 * «La última vez» de cada ejercicio: una entrada por `exerciseId`, sacada de
 * las sesiones anteriores a `antesDe` (la más reciente primero). Es lo que
 * rellena la tabla y con lo que se compara la sesión.
 *
 * F19 (17-11-2026): antes se cogía la entrada más reciente sin mirar qué
 * traía. Un ejercicio saltado con motivo («máquina ocupada») se guarda sin
 * series, pasaba a ser «la última vez» y la sesión siguiente llegaba en
 * blanco, sin pesos ni referencia. Ahora las series salen de la sesión más
 * reciente que SÍ las tenga.
 *
 * La nota y la respuesta del coach siguen siendo las de la entrada más
 * reciente, tenga series o no: si el atleta escribió «no lo hice: me
 * molestaba» y el coach le contestó, eso es justo lo que tiene que leer hoy.
 * Si no hay ninguna entrada con series, se devuelve la más reciente tal cual
 * (la tabla llega vacía, como siempre que no hay historial).
 *
 * `sinLogId`: al corregir una sesión ya hecha, su propio registro no cuenta.
 */
export function entradasDeLaUltimaVez(
  logs: readonly WorkoutLog[], antesDe: string, sinLogId?: string,
): WorkoutEntryLog[] {
  const anteriores = logs
    .filter(l => l.date < antesDe && l.id !== sinLogId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const recientes = new Map<string, WorkoutEntryLog>();
  const conSeries = new Map<string, WorkoutEntryLog>();
  for (const log of anteriores) {
    for (const entry of log.entries) {
      if (!recientes.has(entry.exerciseId)) recientes.set(entry.exerciseId, entry);
      if (!conSeries.has(entry.exerciseId) && tieneSeriesValidas(entry)) conSeries.set(entry.exerciseId, entry);
    }
  }
  return [...recientes.entries()].map(([exerciseId, reciente]) => {
    const valida = conSeries.get(exerciseId);
    if (!valida || valida === reciente) return reciente;
    // Las series (y lo que va con ellas) de la sesión que las tiene; la nota,
    // de la más reciente.
    return { ...valida, note: reciente.note, noteCoachSeen: reciente.noteCoachSeen, noteReply: reciente.noteReply };
  });
}
