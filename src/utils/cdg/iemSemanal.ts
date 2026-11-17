/**
 * IEM REALIZADO por semana y por zona, para Revisión. Sustituye al bloque de
 * «series por semana y grupo»: contar series trata igual una serie a RIR 4 de
 * 15 repeticiones que una a RIR 1 de 6, y la zona de MEV/MAV salía de un
 * número genérico. El IEM es el estímulo de la plantilla CDG —por músculo, con
 * el RIR y las repeticiones dentro—, sumado en las zonas del curso (las mismas
 * con las que se preguntan las agujetas).
 */
import type { WorkoutLog } from '../../types.js'
import type { MotorCdg } from './motor.js'
import type { NombreCdgDe } from './adaptadores.js'
import { iemDeLogs } from './estimulo.js'
import { ZONAS_IEM, iemPorZona, type ZonaIem } from './zonas.js'
import { semanaDelBloque } from '../semanaDelBloque.js'

export interface FilaIemSemanal {
  clave: ZonaIem
  nombre: string
  sensible: boolean
  /** IEM de cada semana (índice = columna). */
  valores: number[]
  total: number
  /** Última semana COMPLETA frente a la anterior, en %. `null` si no hay dos o la anterior es 0. */
  variacionPct: number | null
}

export interface IemSemanal {
  /** Lunes (o inicio) de cada semana. */
  semanas: string[]
  filas: FilaIemSemanal[]
  totalPorSemana: number[]
  /** Índice de la semana que aún no ha terminado (contiene `hoy`), o `null`. */
  enCurso: number | null
  /** Ejercicios registrados sin vínculo CDG: no cuentan. */
  sinVinculo: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

function sumarDias (fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const f = new Date(y, m - 1, d + dias)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

/** `inicios`: el primer día de cada semana, en orden. Cada semana son 7 días desde ese inicio. */
export function iemSemanalPorZona (motor: MotorCdg, logs: WorkoutLog[], nombreCdgDe: NombreCdgDe, inicios: string[], hoy?: string): IemSemanal {
  // La semana en curso sale corta por definición: no entra en la variación.
  const iEnCurso = hoy ? inicios.findIndex(ini => ini <= hoy && sumarDias(ini, 6) >= hoy) : -1
  const ultimaCompleta = iEnCurso >= 0 ? iEnCurso - 1 : inicios.length - 1
  const sinVinculo = new Set<string>()
  const porSemana = inicios.map(ini => {
    const fin = sumarDias(ini, 6)
    const delaSemana = logs.filter(l => l.date >= ini && l.date <= fin)
    const r = iemDeLogs(motor, delaSemana, nombreCdgDe)
    r.sinVinculo.forEach(id => sinVinculo.add(id))
    return iemPorZona(motor, r.IEM)
  })
  const filas: FilaIemSemanal[] = ZONAS_IEM.map(z => {
    const valores = porSemana.map(s => r2(s[z.clave] ?? 0))
    const ult = ultimaCompleta >= 0 ? valores[ultimaCompleta] : 0
    const prev = ultimaCompleta >= 1 ? valores[ultimaCompleta - 1] : 0
    return {
      clave: z.clave, nombre: z.nombre, sensible: z.sensible, valores,
      total: r2(valores.reduce((a, b) => a + b, 0)),
      variacionPct: prev > 0 ? Math.round(((ult - prev) / prev) * 100) : null
    }
  })
    .filter(f => f.total > 0.005)
    .sort((a, b) => b.total - a.total)
  return {
    semanas: inicios,
    filas,
    totalPorSemana: inicios.map((_, i) => r2(filas.reduce((a, f) => a + f.valores[i], 0))),
    enCurso: iEnCurso >= 0 ? iEnCurso : null,
    sinVinculo: [...sinVinculo]
  }
}

/**
 * Los inicios de semana que enseña Revisión y, cuando son de un bloque, el
 * número REAL de cada una dentro de él (`numeros`, alineado con la lista).
 * Va como propiedad no enumerable de la propia lista para que quien solo quiere
 * las fechas la siga usando como un `string[]` cualquiera.
 */
export type SemanasDeRevision = string[] & { readonly numeros?: number[] }

/** Cuántas columnas caben en la tabla de Revisión: de un bloque largo, las últimas. */
export const SEMANAS_EN_REVISION = 8

/** «S3», el rótulo de la columna `i`: su semana del bloque si se sabe; si no, su posición. */
export function numeroDeSemana (semanas: SemanasDeRevision, i: number): number {
  return semanas.numeros?.[i] ?? i + 1
}

/**
 * Las semanas que enseña Revisión: las del bloque en curso si se mira el
 * bloque; si no, las `n` últimas (de lunes a domingo) hasta `hasta`.
 *
 * F5 (17-11-2026): de un bloque se enseñan las 8 últimas, pero cada una lleva
 * su número de semana del bloque (`semanaDelBloque`, la misma cuenta que
 * Rutinas y el Road map). Antes se rotulaban por posición y en un bloque de 10
 * semanas la S3 salía como «S1». Las columnas siguen siendo tramos de 7 días
 * desde el inicio del bloque; con `cicloDias` distinto de 7 el número es el de
 * la vuelta del ciclo en la que EMPIEZA cada tramo.
 */
export function semanasDeLaRevision (o: { hasta: string; inicioBloque?: string | null; n?: number; cicloDias?: number }): SemanasDeRevision {
  const n = o.n ?? 6
  if (o.inicioBloque && o.inicioBloque <= o.hasta) {
    const todas: string[] = []
    for (let s = o.inicioBloque; s <= o.hasta; s = sumarDias(s, 7)) todas.push(s)
    const out = todas.slice(-SEMANAS_EN_REVISION)
    const bloque = { startDate: o.inicioBloque }
    const numeros = out.map(s => semanaDelBloque(bloque, s, o.cicloDias && o.cicloDias > 0 ? o.cicloDias : 7))
    return Object.defineProperty(out, 'numeros', { value: numeros, enumerable: false }) as SemanasDeRevision
  }
  const [y, m, d] = o.hasta.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay()
  const lunes = sumarDias(o.hasta, dia === 0 ? -6 : 1 - dia)
  return Array.from({ length: n }, (_, i) => sumarDias(lunes, -7 * (n - 1 - i)))
}
