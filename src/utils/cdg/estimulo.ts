/**
 * Estímulo muscular (IEM) de lo REALIZADO, para el cierre del mesociclo y las
 * correlaciones. Sustituye al «IEA = Índice de Estímulo Acumulado» antiguo de la
 * app (series efectivas × RIR medio / 10): ahora el estímulo es el IEM de la
 * plantilla CDG, por músculo (33) y por grupo compuesto, con la misma fórmula
 * que la hoja. «IEA» queda reservado al estrés ARTICULAR.
 */
import type { WorkoutLog } from '../../types'
import { COMPUESTOS, iemCompuesto, type MotorCdg } from './motor.js'
import { semanaRealizadaDesdeLogs, type NombreCdgDe } from './adaptadores.js'
import { calcularSemana } from './seguimiento.js'

/** IEM total (33 músculos) de un conjunto de logs. Series sin kg no cuentan (como la hoja). */
export function iemDeLogs (motor: MotorCdg, logs: WorkoutLog[], nombreCdgDe: NombreCdgDe) {
  // Todo el periodo cabe en «un día»: calcularSemana suma ejercicios y series tal cual lo hace la hoja.
  const semana = semanaRealizadaDesdeLogs(logs, nombreCdgDe, () => 0)
  const calculo = calcularSemana(motor, semana)
  const IEM = calculo.IEM[0] ?? new Array<number>(motor.musculos.length).fill(0)
  const sinVinculo = new Set<string>()
  for (const l of logs) for (const e of l.entries) if (!nombreCdgDe(e.exerciseId)) sinVinculo.add(e.exerciseId)
  return { IEM, compuestos: iemCompuesto(IEM), sinVinculo: [...sinVinculo] }
}

export interface FilaIEM { nombre: string; valor: number; compuesto: boolean }

/** Filas para una tabla: primero los grupos compuestos, luego los músculos con valor, de más a menos. */
export function filasIEM (motor: MotorCdg, IEM: number[]): FilaIEM[] {
  const compuestos = Object.entries(iemCompuesto(IEM)).map(([nombre, valor]) => ({ nombre, valor, compuesto: true }))
  const musculos = motor.musculos.map((nombre, i) => ({ nombre, valor: IEM[i] ?? 0, compuesto: false }))
  return [
    ...compuestos.filter(f => f.valor > 0.005).sort((a, b) => b.valor - a.valor),
    ...musculos.filter(f => f.valor > 0.005).sort((a, b) => b.valor - a.valor)
  ]
}

export interface SerieIEM { clave: string; label: string; points: Array<{ date: string; value: number }> }

/**
 * IEM por semana natural (`semanaDe` = utils/seriesCorrelation::weekKey) para cruzarlo con peso, sueño o
 * adherencia. Una serie por grupo compuesto y por músculo que aparezca en al menos 2 semanas.
 */
export function seriesIEMPorSemana (motor: MotorCdg, logs: WorkoutLog[], nombreCdgDe: NombreCdgDe, semanaDe: (fecha: string) => string): SerieIEM[] {
  const porSemana = new Map<string, WorkoutLog[]>()
  for (const l of logs) {
    const k = semanaDe(l.date)
    if (!porSemana.has(k)) porSemana.set(k, [])
    porSemana.get(k)!.push(l)
  }
  const claves = [...porSemana.keys()].sort()
  const series = new Map<string, SerieIEM>()
  const poner = (clave: string, label: string, date: string, value: number) => {
    if (!(value > 0.005)) return
    if (!series.has(clave)) series.set(clave, { clave, label, points: [] })
    series.get(clave)!.points.push({ date, value: Math.round(value * 100) / 100 })
  }
  for (const k of claves) {
    const { IEM, compuestos } = iemDeLogs(motor, porSemana.get(k)!, nombreCdgDe)
    for (const [nombre, v] of Object.entries(compuestos)) poner(`c:${nombre}`, nombre, k, v)
    motor.musculos.forEach((m, i) => poner(`m:${m}`, m, k, IEM[i] ?? 0))
  }
  const compuestos = Object.keys(COMPUESTOS)
  return [...series.values()]
    .filter(s => s.clave.startsWith('c:') || s.points.length >= 2)
    .sort((a, b) => Number(b.clave.startsWith('c:')) - Number(a.clave.startsWith('c:')) || a.label.localeCompare(b.label))
    .map(s => (compuestos.includes(s.label) && s.clave.startsWith('c:') ? { ...s, label: `${s.label} (grupo)` } : s))
}
