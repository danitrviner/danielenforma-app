import type { Exercise } from '../types.js';
import { normalizarTexto } from './busqueda.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Ejercicios a peso corporal (CR5, 26-10-2026)

   Una dominada se registra a 0 kg (o solo con el lastre), así que para el 1RM,
   el tonelaje y el CDG contaba 0: un atleta de dominadas y fondos no tenía
   IEM, ni tonelaje, ni un solo récord. Aquí se decide qué ejercicios son de
   peso corporal (el campo `Exercise.pesoCorporal` o, si no lo trae, el
   nombre) y cuánto pesa de verdad una serie: lo apuntado más el peso del
   atleta, cuando se conoce.
   ═══════════════════════════════════════════════════════════════════════════ */

const NOMBRES_PESO_CORPORAL = /\b(dominada|dominadas|fondo|fondos|flexion|flexiones|muscle ?up|pino|remo invertido|australian|pull ?up|chin ?up|push ?up|dips?|hollow|l ?sit|pistol|sentadilla a una pierna)\b/;

/** ¿Mueve el atleta su propio peso en este ejercicio? */
export function esEjercicioDePesoCorporal(e: Pick<Exercise, 'name' | 'pesoCorporal'> | undefined): boolean {
  if (!e) return false;
  if (e.pesoCorporal !== undefined) return e.pesoCorporal;
  return NOMBRES_PESO_CORPORAL.test(normalizarTexto(e.name));
}

export interface ContextoPesoCorporal {
  /** Ejercicio por id, para saber si es de peso corporal. */
  ejercicioDe: (exerciseId: string) => Pick<Exercise, 'name' | 'pesoCorporal'> | undefined;
  /** Peso del atleta en kg. Sin él, las series de peso corporal siguen valiendo lo apuntado. */
  pesoCorporalKg?: number | null;
}

/** Kilos que mueve una serie: lo apuntado más el peso corporal si el ejercicio lo es. */
export function pesoDeSerie(weight: number | string | null | undefined, exerciseId: string, ctx?: ContextoPesoCorporal | null): number {
  const w = Number(weight) || 0;
  if (!ctx?.pesoCorporalKg || ctx.pesoCorporalKg <= 0) return w;
  return esEjercicioDePesoCorporal(ctx.ejercicioDe(exerciseId)) ? w + ctx.pesoCorporalKg : w;
}

/** Contexto a partir de la lista de ejercicios y el último peso conocido. */
export function contextoPesoCorporal(exercises: readonly Pick<Exercise, 'id' | 'name' | 'pesoCorporal'>[], pesoCorporalKg?: number | null): ContextoPesoCorporal {
  const porId = new Map(exercises.map(e => [e.id, e]));
  return { ejercicioDe: id => porId.get(id), pesoCorporalKg: pesoCorporalKg ?? null };
}
