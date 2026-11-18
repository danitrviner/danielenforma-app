import type { Mesocycle, WorkoutLog } from '../../types.js';
import type { IemSemanal } from '../cdg/iemSemanal.js';
import { ZONAS_IEM, type ZonaIem } from '../cdg/zonas.js';
import { cicloDiasDeMeso } from '../asignacionMesociclo.js';
import { semanasDeCalendarioEnDescarga } from '../cierreMesociclo.js';
import { detectarEstancamiento, type ContextoDeEstancamiento, type Estancamiento } from '../estancamiento.js';
import { mediana } from '../rmValido.js';
import { addDays, diasEntreFechas } from '../trainingWeek.js';
import { redondearIem } from './cifras.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Cómo acabó un bloque: la foto de la que parte la hipótesis del siguiente
   (17-11-2026)

   Por zona, dos números del estímulo (IEM) REALIZADO, no del programado:

     · media   — IEM medio semanal del bloque;
     · final   — con cuánto acabó: la MEDIANA de las 2 últimas semanas que
                 cuentan y en las que entrenó. Un dato suelto no vale: la
                 última semana puede ser justo la que se saltó un día.

   Semanas que NO cuentan, igual que en la comparación de fuerza del cierre
   (`progresionDelBloque.ts`, D3): descarga, puente y test, la semana 1 cuando
   vuelve de un parón (va a RIR 3 o más a propósito) y la semana en curso a
   medias. Una semana normal en la que no entrenó SÍ cuenta para la media, con
   un 0: es estímulo que no se dio, y es justo lo que el veredicto tiene que
   ver para no leer «no responde» donde hubo falta de adherencia. Para el
   «final» no: ahí se mira dónde estaba cuando entrenaba.

   Sirve igual para el bloque que se cierra (el IEM medio del veredicto) que
   para el anterior (de dónde arranca el nuevo). Puro: la entrada es lo que
   devuelve `iemSemanalPorZona` con las semanas del bloque
   (`iniciosDeSemanaDelBloque`) y el mesociclo.
   ═══════════════════════════════════════════════════════════════════════════ */

export type MotivoDeSemanaFuera = 'descarga' | 'puente' | 'test' | 'vuelta_de_paron' | 'en_curso' | 'fuera_del_bloque';

export interface SemanaRealizada {
  /** Semana de calendario del bloque, 1-indexada (7 días desde `startDate`). */
  semana: number;
  inicio: string;
  /** Entra en la media del bloque. */
  cuenta: boolean;
  motivo: MotivoDeSemanaFuera | null;
  /** Registró alguna sesión con ejercicios vinculados al catálogo. */
  entrenada: boolean;
}

export interface EstadoDeZona {
  zona: ZonaIem;
  /** IEM medio semanal realizado, con las semanas que cuentan. */
  iemMedio: number;
  /** IEM semanal con el que acabó: mediana de las 2 últimas semanas que cuentan y entrenó. */
  iemFinal: number;
  /** IEM de cada semana que cuenta, en orden. */
  porSemana: number[];
}

export interface EstadoDelBloque {
  mesocycleId: string;
  semanas: SemanaRealizada[];
  /** Cuántas semanas entran en la media. */
  semanasQueCuentan: number;
  /** De esas, en cuántas no entrenó nada. */
  semanasSinEntrenar: number;
  /** Solo las zonas con algo de estímulo en las semanas que cuentan. */
  porZona: Partial<Record<ZonaIem, EstadoDeZona>>;
}

export type MesoParaEstado = Pick<Mesocycle, 'id' | 'startDate' | 'weeks' | 'daysPerWeek'>
  & Partial<Pick<Mesocycle, 'cycleDays' | 'splitId' | 'reparto' | 'semanasDescarga' | 'semanasPivot' | 'semanasTest' | 'vuelveDeParon'>>;

/** Semanas del «final»: las 2 últimas que cuentan. */
export const SEMANAS_DEL_FINAL = 2;

/** El primer día de cada semana de calendario del bloque, hasta `hasta` (incluido) si se pasa. */
export function iniciosDeSemanaDelBloque(meso: Pick<Mesocycle, 'startDate' | 'weeks'>, hasta?: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.max(0, meso.weeks); i++) {
    const inicio = addDays(meso.startDate, i * 7);
    if (hasta != null && inicio > hasta) break;
    out.push(inicio);
  }
  return out;
}

/**
 * Las semanas de calendario del bloque que no cuentan y por qué. Descargas,
 * puentes y test se guardan en VUELTAS del ciclo: con un ciclo que no es de 7
 * días se traducen a semanas con la misma regla del cierre (mayoría de días).
 */
export function semanasFueraDelBloque(meso: MesoParaEstado): Map<number, MotivoDeSemanaFuera> {
  const ciclo = cicloDiasDeMeso({ daysPerWeek: meso.daysPerWeek, cycleDays: meso.cycleDays, splitId: meso.splitId, reparto: meso.reparto });
  const dias = meso.weeks * 7;
  const aSemanas = (vueltas?: number[]) => semanasDeCalendarioEnDescarga(vueltas ?? [], ciclo, dias);
  const fuera = new Map<number, MotivoDeSemanaFuera>();
  // De menos a más prioridad: si coinciden, manda la descarga (como en `resolverEjercicioDelMeso`).
  if (meso.vuelveDeParon) fuera.set(1, 'vuelta_de_paron');
  for (const s of aSemanas(meso.semanasTest)) fuera.set(s, 'test');
  for (const s of aSemanas(meso.semanasPivot)) fuera.set(s, 'puente');
  for (const s of aSemanas(meso.semanasDescarga)) fuera.set(s, 'descarga');
  return fuera;
}

/**
 * El estado de un bloque por zona. `iem` es `iemSemanalPorZona(...)` con las
 * semanas del bloque; si se le pasó `hoy`, la semana en curso no cuenta.
 */
export function estadoDelBloqueAnterior(o: {
  iem: Pick<IemSemanal, 'semanas' | 'filas' | 'totalPorSemana' | 'enCurso'>;
  meso: MesoParaEstado;
}): EstadoDelBloque {
  const { iem, meso } = o;
  const fuera = semanasFueraDelBloque(meso);
  const semanas: SemanaRealizada[] = iem.semanas.map((inicio, i) => {
    const semana = Math.floor(diasEntreFechas(meso.startDate, inicio) / 7) + 1;
    const motivo: MotivoDeSemanaFuera | null = semana < 1 || semana > meso.weeks ? 'fuera_del_bloque'
      : fuera.get(semana) ?? (iem.enCurso === i ? 'en_curso' : null);
    return { semana, inicio, cuenta: motivo === null, motivo, entrenada: (iem.totalPorSemana[i] ?? 0) > 0.005 };
  });
  const indices = semanas.map((s, i) => (s.cuenta ? i : -1)).filter(i => i >= 0);
  const entrenadas = indices.filter(i => semanas[i].entrenada);

  const porZona: EstadoDelBloque['porZona'] = {};
  for (const z of ZONAS_IEM) {
    const fila = iem.filas.find(f => f.clave === z.clave);
    if (!fila) continue;
    const porSemana = indices.map(i => fila.valores[i] ?? 0);
    if (!porSemana.some(v => v > 0.005)) continue;
    const delFinal = entrenadas.slice(-SEMANAS_DEL_FINAL).map(i => fila.valores[i] ?? 0);
    porZona[z.clave] = {
      zona: z.clave,
      iemMedio: redondearIem(porSemana.reduce((a, b) => a + b, 0) / porSemana.length),
      iemFinal: redondearIem(mediana(delFinal) ?? 0),
      porSemana: porSemana.map(redondearIem),
    };
  }
  return {
    mesocycleId: meso.id,
    semanas,
    semanasQueCuentan: indices.length,
    semanasSinEntrenar: indices.length - entrenadas.length,
    porZona,
  };
}

// ── Por ejercicio: lo que hace falta para decidir qué se cambia al clonar ────

export interface MolestiaDeEjercicio {
  /** Sesiones del bloque en las que apuntó molestia en este ejercicio. */
  veces: number;
  /** La nota más alta (1-10); `null` si solo dijo que le paró una molestia. */
  maxima: number | null;
  /** Día de la última (`YYYY-MM-DD`). */
  ultima: string;
}

export interface EstadoDeEjercicio {
  exerciseId: string;
  /** Sesiones del bloque en las que se hizo. */
  sesiones: number;
  /** Parado 6 semanas o más con la misma tarea (`detectarEstancamiento`, que
   *  desde el 17-11-2026 cuenta semanas y no sesiones); `null` si no. */
  estancamiento: Estancamiento | null;
  molestia: MolestiaDeEjercicio | null;
}

/**
 * El estado de cada ejercicio del bloque. `logs` son TODOS los registros del
 * atleta: el estancamiento se mira sobre el tramo comparable entero (un
 * ejercicio que viene parado del bloque anterior sigue parado), y las
 * molestias solo dentro del bloque.
 */
export function estadoDeLosEjercicios(o: {
  logs: readonly WorkoutLog[];
  meso: Pick<Mesocycle, 'id' | 'startDate' | 'weeks'>;
  /** Último día del bloque (`finDeBloque`); por defecto, `weeks × 7`. */
  hasta?: string;
  /** Solo estos ejercicios; por defecto, todos los que aparecen en el bloque. */
  ejercicios?: readonly string[];
  contextoDe?: (exerciseId: string) => ContextoDeEstancamiento | undefined;
}): EstadoDeEjercicio[] {
  const { meso } = o;
  const hasta = o.hasta ?? addDays(meso.startDate, meso.weeks * 7 - 1);
  const hastaElFinal = o.logs.filter(l => l.date <= hasta);
  const delBloque = hastaElFinal.filter(l => (l.mesocycleId ? l.mesocycleId === meso.id : l.date >= meso.startDate));

  const sesiones = new Map<string, number>();
  const molestias = new Map<string, MolestiaDeEjercicio>();
  for (const l of delBloque) {
    for (const e of l.entries ?? []) {
      sesiones.set(e.exerciseId, (sesiones.get(e.exerciseId) ?? 0) + 1);
      const nota = typeof e.molestia === 'number' && e.molestia > 0 ? e.molestia : null;
      if (nota == null && e.queParo !== 'molestia') continue;
      const m = molestias.get(e.exerciseId);
      molestias.set(e.exerciseId, {
        veces: (m?.veces ?? 0) + 1,
        maxima: nota == null ? m?.maxima ?? null : Math.max(nota, m?.maxima ?? 0),
        ultima: m && m.ultima > l.date ? m.ultima : l.date,
      });
    }
  }
  const ids = o.ejercicios ?? [...sesiones.keys()];
  return ids.map(exerciseId => ({
    exerciseId,
    sesiones: sesiones.get(exerciseId) ?? 0,
    estancamiento: detectarEstancamiento(hastaElFinal, exerciseId, o.contextoDe?.(exerciseId) ?? {}),
    molestia: molestias.get(exerciseId) ?? null,
  }));
}
