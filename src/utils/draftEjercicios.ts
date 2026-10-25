import type { Exercise, Mesocycle, MuscleGroup, WorkoutLog } from '../types';
import { SERIES_MAX_POR_EJERCICIO } from './programacion';
import { bloquesSeguidosCon, cubreElMaterial } from './seleccionEjercicios';
import { exerciseBestProgress, exerciseWeightTrend } from './athleteMetrics';

/* ═══════════════════════════════════════════════════════════════════════════
   Draft de ejercicios

   La lista corta que el coach arma por grupo muscular ANTES de repartir
   series: «de pecho quiero estos cuatro». Después, «Generar rutinas» solo
   elige entre ellos. Aquí vive la lógica sin pantalla.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Draft = NonNullable<Mesocycle['draft']>;

/** Ids elegidos para un grupo, en el orden del coach. */
export function idsDelDraft(draft: Draft | undefined, grupo: MuscleGroup): string[] {
  return draft?.[grupo] ?? [];
}

/** Añade el ejercicio al final si no estaba y lo quita si estaba. */
export function alternarEnDraft(draft: Draft | undefined, grupo: MuscleGroup, id: string): Draft {
  const actuales = idsDelDraft(draft, grupo);
  const siguientes = actuales.includes(id) ? actuales.filter(x => x !== id) : [...actuales, id];
  const resultado: Draft = { ...(draft ?? {}) };
  if (siguientes.length === 0) delete resultado[grupo];
  else resultado[grupo] = siguientes;
  return resultado;
}

/** Mueve un ejercicio una posición arriba (-1) o abajo (+1) dentro de su grupo. */
export function moverEnDraft(draft: Draft | undefined, grupo: MuscleGroup, id: string, delta: -1 | 1): Draft {
  const ids = [...idsDelDraft(draft, grupo)];
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return { ...(draft ?? {}) };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...(draft ?? {}), [grupo]: ids };
}

/**
 * Catálogo con el que se genera un grupo: solo el draft si lo hay (y alguno
 * de sus ids sigue existiendo), el catálogo completo si no. Un id que ya no
 * está en la biblioteca se ignora en silencio: el draft no puede dejar un
 * grupo sin ejercicios.
 */
export function catalogoParaGrupo(catalogo: Exercise[], draft: Draft | undefined, grupo: MuscleGroup): Exercise[] {
  const ids = idsDelDraft(draft, grupo);
  if (ids.length === 0) return catalogo;
  const porId = new Map(catalogo.map(e => [e.id, e]));
  const elegidos = ids.map(id => porId.get(id)).filter((e): e is Exercise => !!e);
  return elegidos.length > 0 ? elegidos : catalogo;
}

/** Cuántos ejercicios hacen falta como mínimo para repartir estas series. */
export function ejerciciosSugeridos(series: number): number {
  if (series <= 0) return 0;
  return Math.max(1, Math.ceil(series / SERIES_MAX_POR_EJERCICIO));
}

export interface HistorialDeEjercicio {
  /** Bloques seguidos (los más recientes) en los que ha aparecido. */
  bloquesSeguidos: number;
  /** Mejor serie reciente: kg × reps, y e1RM. */
  mejor: { peso: number; reps: number; e1rm: number; fecha: string } | null;
  /** Variación del peso máximo respecto a la sesión anterior. */
  deltaKg: number | null;
  /** Peso máximo por sesión, de la más antigua a la más reciente. */
  tendencia: number[];
}

export function historialDeEjercicio(logs: WorkoutLog[], exerciseId: string): HistorialDeEjercicio {
  const progreso = exerciseBestProgress(logs, exerciseId);
  return {
    bloquesSeguidos: bloquesSeguidosCon(exerciseId, logs),
    mejor: progreso
      ? {
          peso: progreso.current.weight,
          reps: progreso.current.reps,
          e1rm: Math.round(progreso.current.e1rm),
          fecha: progreso.current.date,
        }
      : null,
    deltaKg: progreso?.deltaKgVsPrevious ?? null,
    tendencia: exerciseWeightTrend(logs, exerciseId, 8),
  };
}

/** Nombre que el coach ha puesto a la sesión `i`, o `undefined` si no hay. */
export function nombrePropioDeSesion(nombres: string[] | undefined, i: number): string | undefined {
  const n = nombres?.[i]?.trim();
  return n ? n : undefined;
}

/** Pone o quita (cadena vacía) el nombre de la sesión `i`, sin dejar huecos raros. */
export function conNombreDeSesion(nombres: string[] | undefined, i: number, nombre: string, total: number): string[] {
  const base = Array.from({ length: total }, (_, k) => nombres?.[k] ?? '');
  base[i] = nombre;
  return base;
}

/**
 * Línea «Material del atleta» del Draft (12-e): lo que escribió en el alta y
 * cuántos ejercicios de los grupos del bloque no encajan con él, con la misma
 * regla que ordena los candidatos y marca «Sin material compatible».
 */
export function resumenDeMaterial(material: string[], catalogo: Exercise[], grupos: MuscleGroup[]): { material: string[]; noEncajan: number } {
  const suyo = material.map(m => m.trim()).filter(Boolean);
  if (suyo.length === 0) return { material: [], noEncajan: 0 };
  const noEncajan = catalogo.filter(e => !!e.muscleGroup && grupos.includes(e.muscleGroup) && !cubreElMaterial(e, suyo)).length;
  return { material: suyo, noEncajan };
}
