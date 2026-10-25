/**
 * Lo que acompaña a la propuesta por IEM en Planificar progresión (13-a, 13-g):
 * el borrador de las semanas siguientes y el tonelaje para el aviso de
 * rendimiento. Puro: no escribe nada.
 *
 * Borrador (Dani, 25-10): la semana siguiente se programa en firme; las de
 * después solo se enseñan en gris, «suponiendo que todo va bien»: el mismo %
 * semanal por zona sobre la semana anterior del borrador, con los mismos topes,
 * sin pasar del objetivo de Volumen. No se guarda: cada semana se vuelve a
 * proponer con lo que haya pasado de verdad.
 */
import type { WorkoutExercise, WorkoutLog } from '../../types'
import type { MotorCdg } from './motor.js'
import type { NombreCdgDe } from './adaptadores.js'
import type { ZonaIem } from './zonas.js'
import { mesocycleWeekNumber } from '../progression.js'
import {
  proponerProgresionIem, aplicarOperaciones, iemProgramadoPorZona,
  type EjercicioProgramable, type EntradaProgresionIem, type OperacionIem,
} from './progresionIem.js'

/** Etiqueta corta del cambio en una casilla: «↓RIR», «+1 serie», «+técnica». */
export function etiquetaOperacion (op: OperacionIem): string {
  if (op.tipo === 'rir') return op.delta < 0 ? '↓RIR' : '↑RIR'
  if (op.tipo === 'serie') return op.delta > 0 ? '+1 serie' : '−1 serie'
  return '+técnica'
}

/** % de la semana sin pasar del objetivo de la zona (0 si ya llega). */
export function pctHastaObjetivo (pct: number, base: number, objetivo?: number): number {
  if (objetivo == null || !(objetivo > 0) || pct <= 0 || !(base > 0.005)) return pct
  if (base >= objetivo - 0.05) return 0
  return Math.min(pct, Math.max(1, Math.floor((objetivo / base - 1) * 100 + 1e-9)))
}

export interface CasillaBorrador { we: WorkoutExercise; motivos: string[] }
export interface SemanaBorrador { semana: number; porEjercicio: Map<string, CasillaBorrador> }

export function borradorDeSemanas (o: {
  motor: MotorCdg
  nombreCdgDe: NombreCdgDe
  /** Los ejercicios de la semana programada, ya con los cambios marcados. */
  ejercicios: EjercicioProgramable[]
  /** % semanal por zona (positivo: sube). Las que bajan o se mantienen no se tocan en el borrador. */
  pctPorZona: Partial<Record<ZonaIem, number>>
  objetivos?: Partial<Record<string, number>>
  semanas: number[]
  palancas?: EntradaProgresionIem['palancas']
  mrvPorGrupo?: EntradaProgresionIem['mrvPorGrupo']
  tiempo?: EntradaProgresionIem['tiempo']
}): SemanaBorrador[] {
  let estado = o.ejercicios
  const out: SemanaBorrador[] = []
  for (const semana of o.semanas) {
    const base = iemProgramadoPorZona(o.motor, o.nombreCdgDe, estado.map(x => x.we))
    const pctPorZona: Partial<Record<ZonaIem, number>> = {}
    for (const [z, pct] of Object.entries(o.pctPorZona) as Array<[ZonaIem, number]>) {
      const p = pctHastaObjetivo(pct, base[z] ?? 0, o.objetivos?.[z])
      if (p > 0) pctPorZona[z] = p
    }
    const r = proponerProgresionIem({
      motor: o.motor, nombreCdgDe: o.nombreCdgDe, ejercicios: estado, iemBase: base, pctPorZona,
      palancas: o.palancas, mrvPorGrupo: o.mrvPorGrupo, tiempo: o.tiempo,
    })
    const ops = new Map<string, OperacionIem[]>()
    for (const c of r.cambios) ops.set(c.clave, [...(ops.get(c.clave) ?? []), c.op])
    estado = estado.map(x => (ops.has(x.clave) ? { ...x, we: aplicarOperaciones(x.we, ops.get(x.clave)!) } : x))
    out.push({
      semana,
      porEjercicio: new Map(estado.filter(x => x.movible !== false).map(x => [x.clave, { we: x.we, motivos: (ops.get(x.clave) ?? []).map(etiquetaOperacion) }])),
    })
  }
  return out
}

/** Tonelaje (kg × reps de las series principales) de unos ejercicios en cada semana del bloque. */
export function tonelajePorSemana (
  logs: WorkoutLog[], meso: { id: string; startDate: string }, cicloDias: number, ejercicios: ReadonlySet<string>, semanas: number[],
): number[] {
  const porSemana = new Map<number, number>()
  for (const l of logs) {
    if (l.mesocycleId !== meso.id || l.date < meso.startDate) continue
    const s = mesocycleWeekNumber(meso.startDate, l.date, cicloDias)
    for (const e of l.entries) {
      if (!ejercicios.has(e.exerciseId)) continue
      const t = e.sets.filter(x => !x.segmento).reduce((a, x) => a + (x.weight > 0 ? x.weight * x.repsDone : 0), 0)
      porSemana.set(s, (porSemana.get(s) ?? 0) + t)
    }
  }
  return semanas.map(s => porSemana.get(s) ?? 0)
}
