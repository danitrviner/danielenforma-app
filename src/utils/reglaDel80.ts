import type { WorkoutLog, WorkoutSetLog } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { descansoRealDelEjercicio } from './tiemposDeSerie.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La regla del 80 %, automática (S4, 11-11-2026)

   Estaba escrita en la doctrina (§9) pero solo la conocía el asistente: nadie
   la calculaba. Compara las repeticiones de la 2.ª serie con las de la 1.ª:

     · conserva menos del 80 %  → el descanso se queda corto: +30-60 s
     · conserva el 90-100 %     → si la sesión se alarga, se puede recortar

   Solo vale si las dos series son comparables: mismo peso y esfuerzo parecido.
   Una serie a RIR 2 contra otra al fallo no dice nada del descanso. Y no se
   decide con una sesión: hace falta que el patrón se repita.

   Es una herramienta práctica de coaching, no una ley: por eso el resultado es
   un aviso con sus datos al lado, nunca un cambio que se aplique solo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Por debajo de esto, la 2.ª serie ha perdido demasiado. */
export const UMBRAL_CORTO = 0.8;
/** A partir de esto, el descanso da de sobra. */
export const UMBRAL_SOBRADO = 0.9;
/** Sesiones recientes del ejercicio que se miran. */
export const SESIONES_A_MIRAR = 3;
/** Cuántas de ellas tienen que coincidir para avisar. */
export const SESIONES_PARA_AVISAR = 2;
/** Con menos repeticiones en la 1.ª serie, una sola de diferencia mueve demasiado el porcentaje. */
export const REPS_MINIMAS = 5;

type Serie = Pick<WorkoutSetLog, 'weight' | 'repsDone' | 'rir' | 'alFallo' | 'segmento' | 'hechaEn'>;

/**
 * Fracción de repeticiones que conserva la 2.ª serie respecto a la 1.ª, o
 * `null` si no son comparables (distinto peso, esfuerzo distinto, pocas reps).
 */
export function rendimientoConservado(sets: readonly Serie[]): number | null {
  const [a, b] = seriesPrincipales(sets);
  if (!a || !b) return null;
  if (!(a.weight > 0) || a.weight !== b.weight) return null;
  if (a.repsDone < REPS_MINIMAS || !(b.repsDone > 0)) return null;
  // Esfuerzo comparable: las dos al fallo, o ninguna y con un RIR de diferencia como mucho.
  if (!!a.alFallo !== !!b.alFallo) return null;
  if (!a.alFallo && Math.abs(a.rir - b.rir) > 1) return null;
  return b.repsDone / a.repsDone;
}

export interface AvisoDeDescanso {
  exerciseId: string;
  /** 'corto' = súbele descanso · 'sobrado' = se puede recortar. */
  tipo: 'corto' | 'sobrado';
  /** Sesiones comparables que se han mirado y cuántas cumplen el patrón. */
  sesiones: number;
  coinciden: number;
  /** Media de lo conservado en las sesiones miradas, en % (redondeado). */
  conservadoPct: number;
  /** Descanso real típico (D1), si las series traen hora. En segundos. */
  descansoRealSeg: number | null;
}

/**
 * Avisos de descanso por ejercicio, a partir de las últimas sesiones
 * comparables de cada uno. `ejercicios` limita a los que interesan (los de la
 * ventana de la revisión); sin él, todos.
 */
export function avisosDeDescanso(logs: readonly WorkoutLog[], ejercicios?: readonly string[]): AvisoDeDescanso[] {
  const filtro = ejercicios ? new Set(ejercicios) : null;
  const porEjercicio = new Map<string, { conservado: number; descanso: number | null }[]>();
  for (const log of [...logs].sort((x, y) => y.date.localeCompare(x.date))) {
    for (const entry of log.entries) {
      if (filtro && !filtro.has(entry.exerciseId)) continue;
      const lista = porEjercicio.get(entry.exerciseId) ?? [];
      if (lista.length >= SESIONES_A_MIRAR) continue;
      const conservado = rendimientoConservado(entry.sets);
      if (conservado == null) continue;
      lista.push({ conservado, descanso: descansoRealDelEjercicio(entry.sets) });
      porEjercicio.set(entry.exerciseId, lista);
    }
  }

  const avisos: AvisoDeDescanso[] = [];
  for (const [exerciseId, lista] of porEjercicio) {
    if (lista.length < SESIONES_PARA_AVISAR) continue;
    const cortas = lista.filter(s => s.conservado < UMBRAL_CORTO).length;
    const sobradas = lista.filter(s => s.conservado >= UMBRAL_SOBRADO).length;
    const tipo = cortas >= SESIONES_PARA_AVISAR ? 'corto' : sobradas === lista.length ? 'sobrado' : null;
    if (!tipo) continue;
    const descansos = lista.map(s => s.descanso).filter((d): d is number => d != null);
    avisos.push({
      exerciseId, tipo,
      sesiones: lista.length,
      coinciden: tipo === 'corto' ? cortas : sobradas,
      conservadoPct: Math.round((lista.reduce((s, x) => s + x.conservado, 0) / lista.length) * 100),
      descansoRealSeg: descansos.length ? Math.round(descansos.reduce((s, d) => s + d, 0) / descansos.length) : null,
    });
  }
  // Lo que más pierde, primero.
  return avisos.sort((a, b) => a.conservadoPct - b.conservadoPct);
}
