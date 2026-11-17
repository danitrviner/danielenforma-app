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
 *
 * 17-11-2026 (hipótesis del bloque): con `ritmo`, el borrador respeta lo mismo
 * que la semana en firme: entre subida y subida van 2 semanas sostenidas
 * (meseta) y de la segunda subida en adelante se repiten los PUNTOS de la
 * primera, no el porcentaje. Sin `ritmo`, el % cada semana, como antes.
 */
import type { WorkoutExercise, WorkoutLog } from '../../types.js'
import type { MotorCdg } from './motor.js'
import type { NombreCdgDe } from './adaptadores.js'
import type { ZonaIem } from './zonas.js'
import { mesocycleWeekNumber } from '../progression.js'
import {
  proponerProgresionIem, aplicarOperaciones, iemProgramadoPorZona,
  type EjercicioProgramable, type EntradaProgresionIem, type OperacionIem,
} from './progresionIem.js'
import { SEMANAS_ENTRE_SUBIDAS, SUBIDA_MINIMA } from '../hipotesisDeBloque/cifras.js'

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

/**
 * El ritmo de subidas de una zona al empezar el borrador: cuántas semanas
 * normales lleva sostenidas en su nivel (1 si la semana en firme la sube) y
 * los puntos de la primera subida del bloque, si ya la hubo.
 */
export interface RitmoDeZona { sostenidas: number; puntos?: number | null }

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
  /** Zonas con aviso bloqueante: el borrador tampoco las sube (F6). */
  zonasSinSubida?: EntradaProgresionIem['zonasSinSubida']
  /** Meseta y puntos por zona. Las zonas que no vengan aquí suben cada semana, como antes. */
  ritmo?: Partial<Record<ZonaIem, RitmoDeZona>>
}): SemanaBorrador[] {
  let estado = o.ejercicios
  const out: SemanaBorrador[] = []
  // Copia: el ritmo avanza semana a semana dentro del borrador.
  const ritmo = new Map((Object.entries(o.ritmo ?? {}) as Array<[ZonaIem, RitmoDeZona]>).map(([z, r]) => [z, { ...r }]))
  let base = iemProgramadoPorZona(o.motor, o.nombreCdgDe, estado.map(x => x.we))
  for (const semana of o.semanas) {
    const pctPorZona: Partial<Record<ZonaIem, number>> = {}
    for (const [z, pct] of Object.entries(o.pctPorZona) as Array<[ZonaIem, number]>) {
      const rz = ritmo.get(z)
      // En meseta: esta semana sostiene el nivel y no sube.
      if (rz && rz.sostenidas < SEMANAS_ENTRE_SUBIDAS) continue
      const b = base[z] ?? 0
      // Con una subida ya hecha, los mismos puntos (y nunca más que el %).
      const propio = rz?.puntos != null && rz.puntos > 0 && b > 0.005 ? Math.min(pct, Math.max(1, Math.round(rz.puntos / b * 100))) : pct
      const p = pctHastaObjetivo(propio, b, o.objetivos?.[z])
      if (p > 0) pctPorZona[z] = p
    }
    const r = proponerProgresionIem({
      motor: o.motor, nombreCdgDe: o.nombreCdgDe, ejercicios: estado, iemBase: base, pctPorZona,
      palancas: o.palancas, mrvPorGrupo: o.mrvPorGrupo, tiempo: o.tiempo, zonasSinSubida: o.zonasSinSubida,
    })
    const ops = new Map<string, OperacionIem[]>()
    for (const c of r.cambios) ops.set(c.clave, [...(ops.get(c.clave) ?? []), c.op])
    estado = estado.map(x => (ops.has(x.clave) ? { ...x, we: aplicarOperaciones(x.we, ops.get(x.clave)!) } : x))
    const despues = iemProgramadoPorZona(o.motor, o.nombreCdgDe, estado.map(x => x.we))
    for (const [z, rz] of ritmo) {
      const antes = base[z] ?? 0
      const delta = (despues[z] ?? 0) - antes
      // Solo cuenta como subida si de verdad ha subido (puede no haber palancas).
      if (pctPorZona[z] != null && antes > 0.005 && delta >= Math.max(SUBIDA_MINIMA.puntos, antes * SUBIDA_MINIMA.pct / 100)) {
        rz.sostenidas = 1
        if (!(rz.puntos != null && rz.puntos > 0)) rz.puntos = Math.round(delta * 10) / 10
      } else {
        rz.sostenidas++
      }
    }
    base = despues
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
