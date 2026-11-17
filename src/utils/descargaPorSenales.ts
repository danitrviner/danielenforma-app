import type { Exercise, MuscleGroup, WorkoutLog, WorkoutSetLog } from '../types.js';
import { MUSCLE_LABELS } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { sesionesDelEjercicio } from './comparabilidad.js';
import { UMBRALES_PROTOCOLO } from './cdg/agujetas.js';

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

   17-11-2026 (R3): tres señales más, opcionales, que el protocolo semanal ya
   usaba y aquí no se leían: salir muy cansado de las sesiones, agujetas de 4 o
   más dos semanas seguidas en una zona (escala 1-5) y el aviso de salto de
   carga. Cada una cuenta como UNA señal, igual que las demás.

   17-11-2026 (D6r): el cansancio al salir puede venir de lo apuntado en cada
   sesión (la media de la semana) en vez del cuestionario semanal. Entonces se
   dice también de qué sesión salió peor: sigue siendo una sola señal.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Señales que tienen que coincidir para recomendar descarga. */
export const SENALES_PARA_DESCARGA = 2;
/** Agujetas (escala 1-5) a partir de las cuales una zona «no se recupera» si se repite. */
export const AGUJETAS_ALTAS = 4;
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
  /** Cansancio al salir de las sesiones (0-10): la media de las sesiones de la
   *  semana que lo lleven apuntado o, si no, la última respuesta vigente del
   *  cuestionario. Señal con 8 o más (`UMBRALES_PROTOCOLO.fatigaPostAlta`). */
  cansancioAlSalir?: number;
  /** Con el cansancio por sesión: de cuál salió peor («la del jueves, Pierna A») y su nota. */
  sesionMasCansada?: { etiqueta: string; valor: number };
  /** Agujetas por zona en la escala 1-5 del curso: la de esta semana y la de la
   *  anterior. Señal si alguna zona lleva 4 o más las dos semanas. */
  agujetasPorZona?: readonly { nombre: string; valor: number; anterior?: number }[];
  /** Aviso de salto de carga (aguda:crónica por encima del umbral): lo que se
   *  pasa (zonas, sesiones o «total de la semana»). Vacío = sin aviso. */
  saltoDeCarga?: readonly string[];
}

/** Zonas con agujetas de 4 o más dos semanas seguidas. */
export function zonasQueNoSeRecuperan(agujetas: SenalesDeDescarga['agujetasPorZona'] = []): string[] {
  return agujetas.filter(a => a.valor >= AGUJETAS_ALTAS && a.anterior != null && a.anterior >= AGUJETAS_ALTAS).map(a => a.nombre);
}

function listar(cosas: readonly string[]): string {
  return cosas.length <= 1 ? cosas.join('') : `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}`;
}

/** Las señales que se cumplen, dichas en claro. */
export function senalesActivas(s: SenalesDeDescarga): string[] {
  const t: string[] = [];
  if (s.caidaTransversal) t.push('cae el rendimiento en ejercicios sin relación');
  if (s.recuperacionMala) t.push('sueño y estrés sin margen');
  if ((s.ejerciciosConDiasMalos ?? 0) >= 2) t.push(`${s.ejerciciosConDiasMalos} ejercicios con sesiones seguidas empezando peor`);
  if ((s.gruposConAgujetasCronicas ?? 0) >= 2) t.push(`agujetas que no se van en ${s.gruposConAgujetasCronicas} grupos`);
  if (s.cansancioAlSalir != null && s.cansancioAlSalir >= UMBRALES_PROTOCOLO.fatigaPostAlta) {
    const nota = s.cansancioAlSalir.toLocaleString('es-ES');
    t.push(s.sesionMasCansada
      ? `sale muy cansado de las sesiones (${nota}/10 de media; ${s.sesionMasCansada.etiqueta}: ${s.sesionMasCansada.valor.toLocaleString('es-ES')}/10)`
      : `sale muy cansado de las sesiones (${nota}/10)`);
  }
  const zonas = zonasQueNoSeRecuperan(s.agujetasPorZona);
  if (zonas.length > 0) t.push(`agujetas de ${AGUJETAS_ALTAS} o más dos semanas seguidas en ${listar(zonas.map(z => z.toLowerCase()))}`);
  if ((s.saltoDeCarga?.length ?? 0) > 0) t.push(`salto de carga frente a su media de las últimas semanas (${listar(s.saltoDeCarga!.map(x => x.toLowerCase()))})`);
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
