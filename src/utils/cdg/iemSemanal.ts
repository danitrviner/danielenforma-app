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
 * Las semanas que enseña Revisión: las del bloque en curso si se mira el
 * bloque; si no, las `n` últimas (de lunes a domingo) hasta `hasta`.
 */
export function semanasDeLaRevision (o: { hasta: string; inicioBloque?: string | null; n?: number }): string[] {
  const n = o.n ?? 6
  if (o.inicioBloque && o.inicioBloque <= o.hasta) {
    const out: string[] = []
    for (let s = o.inicioBloque; s <= o.hasta; s = sumarDias(s, 7)) out.push(s)
    return out.slice(-8)
  }
  const [y, m, d] = o.hasta.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay()
  const lunes = sumarDias(o.hasta, dia === 0 ? -6 : 1 - dia)
  return Array.from({ length: n }, (_, i) => sumarDias(lunes, -7 * (n - 1 - i)))
}
