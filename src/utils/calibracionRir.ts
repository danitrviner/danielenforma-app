import type { WorkoutEntryLog, WorkoutLog, WorkoutSetLog } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Calibración del RIR (F4, 11-11-2026)

   El RIR es una estimación del atleta, y casi todo el mundo se queda más lejos
   del fallo de lo que cree (más en pierna y a repeticiones altas). La única
   forma de saberlo es comprobarlo: una serie llevada al máximo con el mismo
   peso dice cuántas había de verdad.

   Dos comprobaciones, las dos con lo que ya se registra:

     · Entre sesiones: la PRIMERA serie de hoy va al máximo (AMRAP, fallo o
       RIR 0) con el mismo peso que la primera de la última vez. Ahí se estimó
       «8 y me quedaban 2» (= 10 posibles); si hoy salen 13, se quedaba 3 más
       lejos. Vale en los dos sentidos.
     · Dentro de la sesión: una serie posterior al máximo, con el mismo peso,
       saca MÁS repeticiones de las que la estimación de una serie anterior
       daba por posibles. Con el cansancio de por medio eso solo puede ser un
       mínimo, así que solo cuenta cuando sale a favor (se quedaba lejos).

   `desfase` = repeticiones reales − repeticiones que creía posibles.
   Positivo: se queda lejos. Negativo: aprieta más de lo que apunta.
   ═══════════════════════════════════════════════════════════════════════════ */

type Serie = Pick<WorkoutSetLog, 'weight' | 'repsDone' | 'rir' | 'alFallo'>;

/** Repeticiones de desfase a partir de las cuales ya no se considera calibrado. */
export const DESFASE_QUE_IMPORTA = 2;
/** Días como mucho entre la estimación y la comprobación. */
export const DIAS_ENTRE_SESIONES = 21;

const alMaximo = (s: Serie) => !!s.alFallo || s.rir === 0;
const valida = (s: Serie) => s.weight > 0 && s.repsDone > 0;
const posibles = (s: Serie) => s.repsDone + (s.rir ?? 0);

export interface Comprobacion {
  /** Lo que se hizo en la serie de la estimación. */
  repsEstimacion: number;
  rirEstimado: number;
  /** Lo que salió en la serie al máximo. */
  repsReales: number;
  peso: number;
  desfase: number;
  /** `false` = sale de la misma sesión: el desfase es un mínimo. */
  entreSesiones: boolean;
}

/**
 * La comprobación que deja la sesión de un ejercicio, o `null`. `anterior` es
 * la sesión previa del mismo ejercicio (si es reciente y de la misma tarea).
 */
export function comprobarRir(hoy: readonly Serie[], anterior?: readonly Serie[]): Comprobacion | null {
  const sets = hoy.filter(valida);
  if (sets.length === 0) return null;

  const primera = sets[0];
  const previa = anterior?.filter(valida)[0];
  if (previa && alMaximo(primera) && !alMaximo(previa) && previa.weight === primera.weight) {
    return {
      repsEstimacion: previa.repsDone, rirEstimado: previa.rir, repsReales: primera.repsDone,
      peso: primera.weight, desfase: primera.repsDone - posibles(previa), entreSesiones: true,
    };
  }

  let mejor: Comprobacion | null = null;
  sets.forEach((tope, j) => {
    if (!alMaximo(tope)) return;
    for (const est of sets.slice(0, j)) {
      if (alMaximo(est) || est.weight !== tope.weight) continue;
      const desfase = tope.repsDone - posibles(est);
      if (desfase >= 1 && (!mejor || desfase > mejor.desfase)) {
        mejor = { repsEstimacion: est.repsDone, rirEstimado: est.rir, repsReales: tope.repsDone, peso: tope.weight, desfase, entreSesiones: false };
      }
    }
  });
  return mejor;
}

export type LecturaDeCalibracion = 'se_queda_lejos' | 'calibrado' | 'se_pasa';

export function lecturaDeCalibracion(desfase: number): LecturaDeCalibracion {
  if (desfase >= DESFASE_QUE_IMPORTA) return 'se_queda_lejos';
  if (desfase <= -DESFASE_QUE_IMPORTA) return 'se_pasa';
  return 'calibrado';
}

/** Lo que se le dice al atleta nada más comprobarlo. */
export function textoDeComprobacion(c: Comprobacion): string {
  const estimacion = `con ${String(c.peso).replace('.', ',')} kg hiciste ${c.repsEstimacion} y apuntaste que te quedaban ${c.rirEstimado}`;
  const cuando = c.entreSesiones ? 'La última vez' : 'Antes';
  const lectura = lecturaDeCalibracion(c.desfase);
  if (lectura === 'se_queda_lejos') {
    return `${cuando} ${estimacion}. Hoy, apretando, han salido ${c.repsReales}: te quedabas ${c.entreSesiones ? 'unas' : 'al menos'} ${c.desfase} repeticiones más lejos de lo que creías. Puedes acercarte más al final de cada serie.`;
  }
  if (lectura === 'se_pasa') {
    return `${cuando} ${estimacion}. Hoy, al máximo, han salido ${c.repsReales}: aprietas más de lo que apuntas. Anota el RIR un poco más bajo.`;
  }
  return `${cuando} ${estimacion}. Hoy, al máximo, han salido ${c.repsReales}: tu RIR va fino.`;
}

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface CalibracionDeEjercicio {
  exerciseId: string;
  comprobaciones: number;
  /** Media de los desfases, con un decimal. */
  desfaseMedio: number;
  ultima: string;
}

/** Las comprobaciones que hay en el historial, por ejercicio. De más desfase a menos. */
export function calibracionPorEjercicio(logs: readonly WorkoutLog[], ejercicios?: readonly string[]): CalibracionDeEjercicio[] {
  const ordenados = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const previa = new Map<string, { date: string; entry: WorkoutEntryLog }>();
  const muestras = new Map<string, { desfases: number[]; ultima: string }>();
  for (const log of ordenados) {
    for (const entry of log.entries) {
      const id = entry.exerciseId;
      const ant = previa.get(id);
      // Con «otra máquina o recorrido» la sesión anterior ya no vale de estimación.
      const comparable = ant && !entry.nuevaReferencia && dias(ant.date, log.date) <= DIAS_ENTRE_SESIONES;
      const c = comprobarRir(seriesPrincipales(entry.sets), comparable ? seriesPrincipales(ant.entry.sets) : undefined);
      if (c && (!ejercicios || ejercicios.includes(id))) {
        const m = muestras.get(id) ?? { desfases: [], ultima: log.date };
        m.desfases.push(c.desfase); m.ultima = log.date;
        muestras.set(id, m);
      }
      if (seriesPrincipales(entry.sets).some(valida)) previa.set(id, { date: log.date, entry });
    }
  }
  return [...muestras.entries()]
    .map(([exerciseId, m]) => ({
      exerciseId, comprobaciones: m.desfases.length, ultima: m.ultima,
      desfaseMedio: Math.round((m.desfases.reduce((a, b) => a + b, 0) / m.desfases.length) * 10) / 10,
    }))
    .sort((a, b) => Math.abs(b.desfaseMedio) - Math.abs(a.desfaseMedio));
}

export interface CalibracionDelAtleta {
  comprobaciones: number;
  desfaseMedio: number;
  lectura: LecturaDeCalibracion;
  porEjercicio: CalibracionDeEjercicio[];
}

/** El resumen del atleta. `null` si no hay ninguna comprobación. */
export function calibracionDelAtleta(logs: readonly WorkoutLog[], ejercicios?: readonly string[]): CalibracionDelAtleta | null {
  const porEjercicio = calibracionPorEjercicio(logs, ejercicios);
  const comprobaciones = porEjercicio.reduce((n, e) => n + e.comprobaciones, 0);
  if (comprobaciones === 0) return null;
  const desfaseMedio = Math.round((porEjercicio.reduce((s, e) => s + e.desfaseMedio * e.comprobaciones, 0) / comprobaciones) * 10) / 10;
  return { comprobaciones, desfaseMedio, lectura: lecturaDeCalibracion(desfaseMedio), porEjercicio };
}
