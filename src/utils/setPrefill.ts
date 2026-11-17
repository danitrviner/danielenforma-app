import { Workout, WorkoutEntryLog, WorkoutExercise, WorkoutLog } from '../types.js';
import { expandSetGroups } from './setGroups.js';
import { sugerirCarga, serieDeReferencia, repsAlRirPautado, rangoDeReps } from './cargaSugerida.js';
import { esSesionFuera } from './sesionFuera.js';
import { segmentosProgramados, seriesPrincipales, seriesConTecnica } from './tecnicaDeSerie.js';
import type { TipoDeSemana } from './tipoDeSemana.js';
import type { ExpandedSet } from './setGroups.js';

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
 *
 * D1a (17-11-2026): las repeticiones llegan A RIR PAUTADO. Si la última vez el
 * atleta apuntó un RIR distinto del que tenía pautado, se le pone lo que
 * habría hecho con el esfuerzo que pide el coach (`repsAlRirPautado`): 10 a
 * RIR 0 con RIR 1 pautado → 9. Sin el RIR apuntado, lo hecho tal cual.
 *
 * D5 (17-11-2026): las series de test (AMRAP) y las pautadas al fallo llegan
 * con «fallo» y las repeticiones vacías (`seriesAlMaximo`). Antes traían el
 * RIR del ejercicio y las repeticiones de la última vez: un toque en «Hecha»
 * guardaba un test que no se había hecho.
 *
 * Fuera de su gimnasio (`fuera`, 17-11-2026, ver utils/sesionFuera.ts): el
 * PESO llega vacío —los kilos de la última vez son de otras máquinas y no le
 * dicen nada— y las repeticiones, con el mínimo del rango, igual que cuando
 * toca un peso nuevo. Ni carga sugerida ni lo de la última vez: lo que se le
 * pide es el RIR. Las series al máximo, como siempre.
 */
export function prefillWorkoutSets(
  workout: Workout, prevEntries: WorkoutEntryLog[],
  /** Salto real de carga de cada ejercicio (`saltoReal`), si se conoce. */
  saltoDe?: (exerciseId: string) => number | null,
  /** Semana de descarga, puente o vuelta de parón (`tipoDeSemana`), si lo es. */
  semana?: TipoDeSemana | null,
  /** Sesión fuera del gimnasio habitual. */
  fuera = false,
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
      const alMaximo = seriesAlMaximo(we, filas);
      const principales: SetPrefill[] = filas.map((row, sIdx) => {
        const prev = serieDeReferencia(previas, sIdx);
        const sube = sugerida[sIdx];
        // D5: en una serie al máximo no se sabe cuántas saldrán; se apuntan después.
        const tope = alMaximo.has(sIdx);
        const rir = tope ? 'fallo' : String(row.rir);
        if (fuera) {
          const rango = rangoDeReps(row.reps ?? '');
          return { weight: '', repsDone: !tope && rango ? String(rango.min) : '', rir, done: false };
        }
        if (sube) return { weight: String(sube.peso), repsDone: tope ? '' : String(sube.reps), rir, done: false };
        // D1a: lo de la última vez, llevado al RIR que pide el coach hoy.
        const reps = prev ? repsAlRirPautado(prev, row.rir) : 0;
        return {
          weight: prev && prev.weight > 0 ? String(prev.weight) : '',
          repsDone: !tope && reps > 0 ? String(reps) : '',
          rir,
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

/**
 * Las series (índice, 0 = la primera) que se hacen AL MÁXIMO (D5): las que
 * llevan la técnica AMRAP o «al fallo» —la última, o las que haya marcado el
 * coach—, y las que tienen «AMRAP» escrito como repeticiones. En la semana de
 * test `resolverEjercicioDelMeso` ya pone la técnica AMRAP, así que salen aquí.
 */
export function seriesAlMaximo(
  we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>, filas: readonly Pick<ExpandedSet, 'reps'>[],
): Set<number> {
  const out = new Set<number>();
  if (we.technique === 'amrap' || we.technique === 'fallo') {
    for (const n of seriesConTecnica(we, filas.length)) out.add(n - 1);
  }
  filas.forEach((f, i) => { if (/amrap/i.test(f.reps ?? '')) out.add(i); });
  return out;
}

/** El RIR pautado de cada serie como lo ve el atleta: '0'-'5', o 'fallo' en las
 *  series al máximo. Es el objetivo de la serie; lo que él apunte no lo cambia. */
export function rirPautadoPorSerie(
  we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes' | 'sets' | 'reps' | 'rir' | 'setGroups'>,
): string[] {
  const filas = expandSetGroups(we);
  const alMaximo = seriesAlMaximo(we, filas);
  return filas.map((f, i) => (alMaximo.has(i) ? 'fallo' : String(f.rir)));
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
 *
 * Fuera de su gimnasio (17-11-2026, utils/sesionFuera.ts): las series de una
 * sesión fuera NUNCA son «la última vez» —sus kilos son de otras máquinas—.
 * Se toman las de la última sesión en su gimnasio, aunque sea antigua; si no
 * hay ninguna, el ejercicio llega sin series (sin referencia). La nota sigue
 * siendo la de la entrada más reciente, fuera o no.
 */
export function entradasDeLaUltimaVez(
  logs: readonly WorkoutLog[], antesDe: string, sinLogId?: string,
): WorkoutEntryLog[] {
  const anteriores = logs
    .filter(l => l.date < antesDe && l.id !== sinLogId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const recientes = new Map<string, WorkoutEntryLog>();
  const conSeries = new Map<string, WorkoutEntryLog>();
  const deFuera = new Set<WorkoutEntryLog>();
  for (const log of anteriores) {
    const fuera = esSesionFuera(log);
    for (const entry of log.entries) {
      if (fuera) deFuera.add(entry);
      if (!recientes.has(entry.exerciseId)) recientes.set(entry.exerciseId, entry);
      if (!fuera && !conSeries.has(entry.exerciseId) && tieneSeriesValidas(entry)) conSeries.set(entry.exerciseId, entry);
    }
  }
  return [...recientes.entries()].map(([exerciseId, reciente]) => {
    const valida = conSeries.get(exerciseId);
    // Solo hay sesiones fuera con series: sin referencia, pero con su nota.
    if (!valida) return deFuera.has(reciente) ? { ...reciente, sets: [] } : reciente;
    if (valida === reciente) return reciente;
    // Las series (y lo que va con ellas) de la sesión que las tiene; la nota,
    // de la más reciente.
    return { ...valida, note: reciente.note, noteCoachSeen: reciente.noteCoachSeen, noteReply: reciente.noteReply };
  });
}
