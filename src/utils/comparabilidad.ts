import type { WorkoutEntryLog, WorkoutLog, WorkoutSetLog } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { descansoRealDelEjercicio } from './tiemposDeSerie.js';
import { marcaDeSesion } from './marcaDeSesion.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Comparabilidad automática (S3, 11-11-2026)

   Dos sesiones del mismo ejercicio solo se pueden comparar si la TAREA es la
   misma. Si el ejercicio ha pasado de ir primero a ir cuarto, si se descansa
   la mitad, si se para con dos repeticiones más de margen o si se ha cambiado
   de 8 a 15 repeticiones, que el número baje no dice nada del atleta: dice
   que se le ha pedido otra cosa.

   Todo sale de lo que el atleta registró (el orden en la sesión, las horas de
   cada serie, el RIR, los kilos y las reps), no de lo que estaba pautado: lo
   que cuenta es lo que pasó.

   Los umbrales son criterio práctico para no marcar ruido, no fronteras
   medidas en ningún estudio.
   ═══════════════════════════════════════════════════════════════════════════ */

export type CambioDeTarea = 'referencia' | 'orden' | 'descanso' | 'rir' | 'rango' | 'tecnica';

export const ETIQUETA_DE_CAMBIO: Record<CambioDeTarea, string> = {
  referencia: 'otra máquina o recorrido',
  orden: 'el orden en la sesión',
  descanso: 'el descanso',
  rir: 'el RIR',
  rango: 'el rango de repeticiones',
  tecnica: 'la técnica',
};

/** Series hechas antes en la sesión a partir de las cuales el ejercicio «llega distinto». */
const SERIES_PREVIAS_DE_DIFERENCIA = 3;
/** Diferencia de descanso real que cambia la tarea: 30 s y un cuarto del descanso. */
const DESCANSO_SEG = 30;
const DESCANSO_FRACCION = 0.25;
/** Repeticiones de diferencia (con el peso moviéndose al revés) que son otro rango. */
const REPS_DE_OTRO_RANGO = 3;

export interface SesionDeEjercicio {
  date: string;
  entry: WorkoutEntryLog;
  /** Series principales de OTROS ejercicios apuntadas antes en la sesión. */
  seriesPrevias: number;
}

const validas = (sets: readonly WorkoutSetLog[]) => seriesPrincipales(sets).filter(s => s.weight > 0 && s.repsDone > 0);

/**
 * La marca de una sesión del historial: el RM de su mejor serie VÁLIDA para
 * estimarlo (`marcaDeSesion.ts`, D2 17-11-2026), o `null` si no tiene ninguna.
 * Es la única definición para todo lo que compara sesiones (estancamiento,
 * hipótesis): antes cada uno cogía el máximo de todas las series, y una
 * sesión entera a RIR 4 daba «marca» igual.
 *
 * Ojo: las `validas` de arriba son otra cosa (series con peso y repeticiones,
 * para saber si la TAREA es la misma); una sesión puede estar en el historial
 * y no tener marca.
 */
export function marcaDelPunto(p: Pick<SesionDeEjercicio, 'entry'>): number | null {
  return marcaDeSesion(p.entry.sets);
}

/** Sesiones del ejercicio con alguna serie válida, de la más antigua a la más nueva. */
export function sesionesDelEjercicio(logs: readonly WorkoutLog[], exerciseId: string): SesionDeEjercicio[] {
  const salida: SesionDeEjercicio[] = [];
  for (const log of logs) {
    const idx = log.entries.findIndex(e => e.exerciseId === exerciseId);
    if (idx < 0 || validas(log.entries[idx].sets).length === 0) continue;
    const seriesPrevias = log.entries.slice(0, idx).reduce((n, e) => n + validas(e.sets).length, 0);
    salida.push({ date: log.date, entry: log.entries[idx], seriesPrevias });
  }
  return salida.sort((a, b) => a.date.localeCompare(b.date));
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

/** En qué ha cambiado la tarea de una sesión a la siguiente. Vacío = comparables. */
export function cambiosDeTarea(antes: SesionDeEjercicio, ahora: SesionDeEjercicio): CambioDeTarea[] {
  const cambios: CambioDeTarea[] = [];
  if (ahora.entry.nuevaReferencia) cambios.push('referencia');

  if (Math.abs(ahora.seriesPrevias - antes.seriesPrevias) >= SERIES_PREVIAS_DE_DIFERENCIA) cambios.push('orden');

  const dA = descansoRealDelEjercicio(seriesPrincipales(antes.entry.sets));
  const dB = descansoRealDelEjercicio(seriesPrincipales(ahora.entry.sets));
  if (dA != null && dB != null && Math.abs(dA - dB) >= Math.max(DESCANSO_SEG, DESCANSO_FRACCION * Math.max(dA, dB))) cambios.push('descanso');

  const sA = validas(antes.entry.sets);
  const sB = validas(ahora.entry.sets);
  // Solo con el RIR que apuntó el atleta: una serie guardada con el RIR
  // pautado sin tocar (`rirApuntado === false`) no dice a cuánto paró, y
  // compararla con una apuntada marcaba un «cambio de RIR» que no existía.
  // Si en alguna de las dos sesiones no hay ninguno apuntado, no se compara.
  const rir = (s: WorkoutSetLog) => (s.alFallo ? 0 : s.rir ?? 0);
  const conRir = (ss: WorkoutSetLog[]) => ss.filter(s => s.alFallo || s.rirApuntado !== false).map(rir);
  const rA = conRir(sA);
  const rB = conRir(sB);
  if (rA.length > 0 && rB.length > 0 && Math.abs(media(rA) - media(rB)) >= 1) cambios.push('rir');

  // Otro rango: las reps se van 3 o más para un lado y el peso para el otro.
  // Mismas reps de menos con el mismo peso es rendir peor, no otro rango.
  const dReps = mediana(sB.map(s => s.repsDone)) - mediana(sA.map(s => s.repsDone));
  const dPeso = Math.max(...sB.map(s => s.weight)) - Math.max(...sA.map(s => s.weight));
  if (Math.abs(dReps) >= REPS_DE_OTRO_RANGO && dReps * dPeso < 0) cambios.push('rango');

  const conSegmentos = (e: WorkoutEntryLog) => e.sets.some(s => s.segmento);
  const alFallo = (ss: WorkoutSetLog[]) => ss.filter(s => s.alFallo).length;
  if (conSegmentos(antes.entry) !== conSegmentos(ahora.entry) || (alFallo(sA) === 0) !== (alFallo(sB) === 0)) cambios.push('tecnica');

  return cambios;
}

export interface PuntoDelHistorial extends SesionDeEjercicio {
  /** Qué cambió respecto a la sesión anterior. La primera nunca lleva cambios. */
  cambios: CambioDeTarea[];
}

/** El historial del ejercicio con lo que cambió en cada sesión. */
export function historialComparable(logs: readonly WorkoutLog[], exerciseId: string): PuntoDelHistorial[] {
  const sesiones = sesionesDelEjercicio(logs, exerciseId);
  return sesiones.map((s, i) => ({ ...s, cambios: i === 0 ? [] : cambiosDeTarea(sesiones[i - 1], s) }));
}

/** Las últimas sesiones seguidas con la misma tarea: desde el último cambio hasta hoy. */
export function tramoComparable(logs: readonly WorkoutLog[], exerciseId: string): PuntoDelHistorial[] {
  const historial = historialComparable(logs, exerciseId);
  let desde = 0;
  historial.forEach((p, i) => { if (p.cambios.length > 0) desde = i; });
  return historial.slice(desde);
}

export interface CambioEnLaVentana { date: string; cambios: CambioDeTarea[] }

/** El último cambio de tarea de cada ejercicio dentro de la ventana, si lo hay. */
export function cambiosEnLaVentana(
  logs: readonly WorkoutLog[], ejercicios: readonly string[], desde: string, hasta: string,
): Record<string, CambioEnLaVentana> {
  const salida: Record<string, CambioEnLaVentana> = {};
  for (const id of ejercicios) {
    const ultimo = historialComparable(logs, id).filter(p => p.cambios.length > 0 && p.date >= desde && p.date <= hasta).pop();
    if (ultimo) salida[id] = { date: ultimo.date, cambios: ultimo.cambios };
  }
  return salida;
}

/** «el orden en la sesión y el descanso». */
export function describirCambios(cambios: readonly CambioDeTarea[]): string {
  const t = cambios.map(c => ETIQUETA_DE_CAMBIO[c]);
  return t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`;
}
