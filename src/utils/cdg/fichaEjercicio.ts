import type { MuscleGroup } from '../../types'
import { parsearEsfuerzo, parsearReps, type MotorCdg } from './motor'
import { ZONAS_IEM, iemPorZona } from './zonas'

/* ═══════════════════════════════════════════════════════════════════════════
   Valores de UNA serie de un ejercicio, para su ficha (E-05)

   Serie de referencia fija: 8-12 repeticiones a RIR 1 (la de la lámina 12). No
   son totales de sesión ni de semana: es lo que el catálogo CDG dice que aporta
   una sola serie. Sin fórmulas propias: todo sale de `motor.calcularSerie`.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SERIE_DE_REFERENCIA = { reps: '8-12', rir: 1 } as const;

export interface FichaCdg {
  /** `false` = el nombre CDG no está en el catálogo (o no hay vínculo). */
  encontrado: boolean;
  IF: number;
  /** IEM total de una serie (suma de los 33 músculos). */
  IEMTotal: number;
  /** Músculos con estímulo, de mayor a menor. */
  musculos: Array<{ nombre: string; valor: number }>;
  /** La articulación más cargada, o `null` si ninguna. */
  articulacion: { nombre: string; valor: number } | null;
}

const VACIA: FichaCdg = { encontrado: false, IF: 0, IEMTotal: 0, musculos: [], articulacion: null };

/** Por debajo de este IEM un músculo no merece barra (ruido de la matriz). */
const IEM_MINIMO = 0.05;

export function fichaPorSerie(motor: MotorCdg, cdgNombre: string | undefined): FichaCdg {
  if (!cdgNombre || !motor.existe(cdgNombre)) return VACIA;
  const r = motor.calcularSerie({
    exerciseName: cdgNombre,
    rpe: parsearEsfuerzo(1, `1x${SERIE_DE_REFERENCIA.rir}`, 'RIR')[0],
    repetitions: parsearReps(SERIE_DE_REFERENCIA.reps),
  });
  const musculos = motor.musculos
    .map((nombre, i) => ({ nombre, valor: r.IEM[i] ?? 0 }))
    .filter(m => m.valor > IEM_MINIMO)
    .sort((a, b) => b.valor - a.valor);
  let articulacion: FichaCdg['articulacion'] = null;
  motor.articulaciones.forEach((nombre, i) => {
    const valor = r.estresArticular[i] ?? 0;
    if (valor > 0.005 && (!articulacion || valor > articulacion.valor)) articulacion = { nombre, valor };
  });
  return {
    encontrado: r.encontrado,
    IF: r.IF,
    IEMTotal: r.IEM.reduce((a, v) => a + v, 0),
    musculos,
    articulacion,
  };
}

/**
 * Lo que una serie de referencia aporta a la zona de un grupo (12-c), para las
 * etiquetas del Draft: el IEM de la zona que entrena ese grupo y el IF de la
 * serie. `null` si no hay vínculo CDG o el nombre no está en el catálogo.
 */
export interface ZonaPorSerie {
  zona: string; IEM: number; IF: number;
  /** La zona que más trabaja según el CDG, si no es la del grupo (para 12-d). */
  principal?: { zona: string; IEM: number };
  /** La zona del grupo recibe menos de la mitad que la que más trabaja: clasificación dudosa (12-d). */
  dudosa: boolean;
}
const corto = (nombre: string) => nombre.replace(/\s*\(.*\)$/, '').toLowerCase();
export function zonaPorSerie(motor: MotorCdg, cdgNombre: string | undefined, grupo: MuscleGroup): ZonaPorSerie | null {
  if (!cdgNombre || !motor.existe(cdgNombre)) return null
  const z = ZONAS_IEM.find(x => (x.grupos as readonly MuscleGroup[]).includes(grupo))
  if (!z) return null
  const r = motor.calcularSerie({
    exerciseName: cdgNombre,
    rpe: parsearEsfuerzo(1, `1x${SERIE_DE_REFERENCIA.rir}`, 'RIR')[0],
    repetitions: parsearReps(SERIE_DE_REFERENCIA.reps),
  })
  if (!r.encontrado) return null
  // «Bíceps (flexores de codo)» → «bíceps»: la etiqueta es corta.
  const porZona = iemPorZona(motor, r.IEM)
  const IEM = porZona[z.clave] ?? 0
  const top = ZONAS_IEM.reduce((m, x) => ((porZona[x.clave] ?? 0) > (porZona[m.clave] ?? 0) ? x : m), z)
  const topIEM = porZona[top.clave] ?? 0
  const dudosa = top.clave !== z.clave && topIEM > 0.005 && IEM < topIEM * 0.5
  return { zona: corto(z.nombre), IEM, IF: r.IF, dudosa, ...(top.clave !== z.clave ? { principal: { zona: corto(top.nombre), IEM: topIEM } } : {}) }
}
