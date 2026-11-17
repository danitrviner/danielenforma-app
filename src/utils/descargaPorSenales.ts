import type { Exercise, MuscleGroup, WorkoutLog, WorkoutSetLog } from '../types.js';
import { MUSCLE_LABELS } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { sesionesDelEjercicio } from './comparabilidad.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Descarga por señales y recorte inteligente (S7, 11-11-2026)

   La descarga no va por calendario (doctrina §11): va cuando varias señales
   coinciden. Y antes de regalar una semana entera suele bastar con recortar,
   pero recortar BIEN: quitar a todos por igual es quitarle también a lo que
   está funcionando. El orden es:

     1. la última serie que se desploma (ya no estimula, solo cansa);
     2. la variante redundante (dos ejercicios de la misma sesión que trabajan
        lo mismo);
     3. lo que está en mantenimiento y lleva más series de las que necesita.

   Una señal sola no pide descarga; dos o más, sí.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Señales que tienen que coincidir para recomendar descarga. */
export const SENALES_PARA_DESCARGA = 2;
/** La última serie «se desploma» si conserva menos de esto frente a la primera. */
export const ULTIMA_SERIE_MINIMO = 0.7;
const SESIONES_A_MIRAR = 3;
const SESIONES_QUE_COINCIDEN = 2;

export interface SenalesDeDescarga {
  /** S2: caída transversal. */
  caidaTransversal?: boolean;
  /** Índice de recuperación en negativo. */
  recuperacionMala?: boolean;
  /** Ejercicios con dos o más sesiones seguidas empezando peor (F1). */
  ejerciciosConDiasMalos?: number;
  /** Grupos con agujetas que no se van. */
  gruposConAgujetasCronicas?: number;
}

/** Las señales que se cumplen, dichas en claro. */
export function senalesActivas(s: SenalesDeDescarga): string[] {
  const t: string[] = [];
  if (s.caidaTransversal) t.push('cae el rendimiento en ejercicios sin relación');
  if (s.recuperacionMala) t.push('sueño y estrés sin margen');
  if ((s.ejerciciosConDiasMalos ?? 0) >= 2) t.push(`${s.ejerciciosConDiasMalos} ejercicios con sesiones seguidas empezando peor`);
  if ((s.gruposConAgujetasCronicas ?? 0) >= 2) t.push(`agujetas que no se van en ${s.gruposConAgujetasCronicas} grupos`);
  return t;
}

export type TipoDeRecorte = 'ultima_serie' | 'redundante' | 'mantenimiento';

export interface Recorte {
  tipo: TipoDeRecorte;
  /** Ejercicio o ejercicios afectados (vacío en el de mantenimiento). */
  ejercicios: string[];
  grupo?: MuscleGroup;
  texto: string;
}

type Serie = Pick<WorkoutSetLog, 'weight' | 'repsDone' | 'rir' | 'alFallo'>;

/** Lo que conserva la última serie frente a la primera, con el mismo peso. `null` si no es comparable. */
export function ultimaFrenteAPrimera(sets: readonly Serie[]): number | null {
  const s = sets.filter(x => x.weight > 0 && x.repsDone > 0);
  if (s.length < 3) return null; // con dos series, quitar la última es dejarlo en una
  const [a, z] = [s[0], s[s.length - 1]];
  if (a.weight !== z.weight || a.repsDone < 5) return null;
  return z.repsDone / a.repsDone;
}

type Ej = Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'secondaryMuscleGroups'>;

const mismoPerfil = (a: Ej, b: Ej) => {
  if (!a.muscleGroup || a.muscleGroup !== b.muscleGroup) return false;
  const sa = [...(a.secondaryMuscleGroups ?? [])].sort().join('|');
  const sb = [...(b.secondaryMuscleGroups ?? [])].sort().join('|');
  return sa === sb;
};

/**
 * Qué recortar primero, en orden. `logs` es el historial hasta hoy;
 * `ejercicios`, los de la ventana; `mantenimiento`, los grupos en prioridad
 * baja con sus series semanales hechas y las que bastan para mantener.
 */
export function recortesPosibles(params: {
  logs: readonly WorkoutLog[];
  ejercicios: readonly string[];
  catalogo: readonly Ej[];
  mantenimiento?: readonly { grupo: MuscleGroup; hechas: number; bastan: number }[];
}): Recorte[] {
  const { logs, ejercicios, catalogo, mantenimiento = [] } = params;
  const porId = new Map(catalogo.map(e => [e.id, e]));
  const nombre = (id: string) => porId.get(id)?.name ?? 'un ejercicio';
  const recortes: Recorte[] = [];

  // 1. La última serie que se desploma.
  for (const id of ejercicios) {
    const ultimas = sesionesDelEjercicio(logs, id).slice(-SESIONES_A_MIRAR)
      .map(s => ultimaFrenteAPrimera(seriesPrincipales(s.entry.sets)))
      .filter((v): v is number => v != null);
    const cae = ultimas.filter(v => v < ULTIMA_SERIE_MINIMO).length;
    if (ultimas.length >= SESIONES_QUE_COINCIDEN && cae >= SESIONES_QUE_COINCIDEN) {
      const pct = Math.round((ultimas.reduce((a, b) => a + b, 0) / ultimas.length) * 100);
      recortes.push({ tipo: 'ultima_serie', ejercicios: [id], texto: `quita la última serie de ${nombre(id)} (se queda en el ${pct} % de la primera)` });
    }
  }

  // 2. Variantes redundantes: mismo perfil muscular en la misma sesión reciente.
  const vistas = new Set<string>();
  const ultimoLog = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const log of ultimoLog.slice(0, 8)) {
    const ids = log.entries.map(e => e.exerciseId).filter(id => ejercicios.includes(id));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [porId.get(ids[i]), porId.get(ids[j])];
        if (!a || !b || a.id === b.id || !mismoPerfil(a, b)) continue;
        const clave = [a.id, b.id].sort().join('|');
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        recortes.push({
          tipo: 'redundante', ejercicios: [a.id, b.id], grupo: a.muscleGroup,
          texto: `${a.name} y ${b.name} trabajan lo mismo en la misma sesión: deja uno`,
        });
      }
    }
  }

  // 3. Lo que está en mantenimiento y lleva de más.
  for (const m of mantenimiento) {
    if (m.hechas >= m.bastan + 2) {
      recortes.push({
        tipo: 'mantenimiento', ejercicios: [], grupo: m.grupo,
        texto: `${MUSCLE_LABELS[m.grupo]} está en mantenimiento y lleva ${Math.round(m.hechas)} series por semana: con ${m.bastan} basta`,
      });
    }
  }
  return recortes;
}
