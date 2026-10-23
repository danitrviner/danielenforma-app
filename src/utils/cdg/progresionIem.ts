/**
 * E-08 · Propuesta de la semana siguiente por objetivo de IEM.
 *
 * Determinista y sin escribir nada: el coach marca qué cambios quiere y se
 * programan con las mismas reglas por semana que el resto (`programarCambio`).
 *
 *  1. Cuánto: `pctPorZona` (lo que sale de `propuestaZona`, E-09: agujetas,
 *     contexto, cansancio y tipo de bloque). Objetivo de la zona =
 *     IEM base × (1 + pct). Positivo sube, negativo frena, 0/ausente no se toca.
 *  2. Con qué: en los ejercicios que trabajan la zona se prueban, por separado,
 *     bajar 1 de RIR, +1 serie y —solo si se permite y el ejercicio es de
 *     aislamiento— un drop set en la última serie. Para frenar, subir 1 de RIR o
 *     quitar 1 serie. Cada palanca, una vez por ejercicio y semana.
 *  3. Se elige el cambio que más IEM de la zona da por cada punto de IF (para
 *     frenar, el que más IF quita por punto de IEM), sin pasarse más de lo que
 *     falta, hasta llegar al objetivo o quedarse sin palancas.
 *  4. Tope de series por zona (MRV): se puede superar, pero el cambio lo avisa
 *     (Dani, 23-10).
 *  RIR mínimo 0: nunca propone «al fallo» (eso es una técnica aparte).
 */
import type { MuscleGroup, WorkoutExercise } from '../../types'
import type { MotorCdg } from './motor.js'
import { seriesProgramadas, type NombreCdgDe } from './adaptadores.js'
import { ZONAS_IEM, iemPorZona, type ZonaIem } from './zonas.js'
import { VOLUME_LANDMARKS_DEFAULT } from '../../data/volumeLandmarks.js'
import { syncAggregateFromGroups } from '../setGroups.js'

export interface EjercicioProgramable {
  /** Identifica el ejercicio en el planificador (día + posición). */
  clave: string
  dia: string
  /** Prescripción YA resuelta para la semana a programar. */
  we: WorkoutExercise
  grupo?: MuscleGroup
  /** false = cuenta para el IEM de la zona pero no se toca (no está entre los elegidos). */
  movible?: boolean
}

export type OperacionIem =
  | { tipo: 'rir'; delta: 1 | -1 }
  | { tipo: 'serie'; delta: 1 | -1 }
  | { tipo: 'tecnica' }

export interface CambioIem {
  clave: string
  dia: string
  exerciseId: string
  zona: ZonaIem
  op: OperacionIem
  de: string
  a: string
  /** Cambio del IEM de la zona y del IF del ejercicio. */
  deltaIemZona: number
  deltaIF: number
  /** La zona del ejercicio pasaría de su máximo de series recuperables. */
  superaMrv?: { series: number; mrv: number }
}

export interface ResumenZonaIem {
  zona: ZonaIem
  nombre: string
  pct: number
  base: number
  objetivo: number
  /** IEM programado antes y después de los cambios propuestos. */
  antes: number
  despues: number
  alcanzado: boolean
  nota?: string
}

export interface EntradaProgresionIem {
  motor: MotorCdg
  nombreCdgDe: NombreCdgDe
  ejercicios: EjercicioProgramable[]
  /** IEM por zona de la semana de referencia (realizado o, si no hay, programado). */
  iemBase: Partial<Record<ZonaIem, number>>
  pctPorZona: Partial<Record<ZonaIem, number>>
  palancas?: { rir?: boolean; series?: boolean; tecnica?: boolean }
  rirMinimo?: number
  /** Series máximas recuperables por grupo muscular (por defecto, VOLUME_LANDMARKS_DEFAULT). */
  mrvPorGrupo?: Partial<Record<MuscleGroup, number>>
}

const RIR_MAXIMO = 4 // el motor no admite RIR 5
const ITERACIONES = 12
const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100

function grupos (we: WorkoutExercise) {
  return we.setGroups?.length ? we.setGroups : null
}

function rirMinDe (we: WorkoutExercise): number {
  const g = grupos(we)
  return g ? Math.min(...g.map(x => Number(x.rir))) : Number(we.rir)
}
function rirMaxDe (we: WorkoutExercise): number {
  const g = grupos(we)
  return g ? Math.max(...g.map(x => Number(x.rir))) : Number(we.rir)
}
export function seriesTotales (we: WorkoutExercise): number {
  const g = grupos(we)
  return g ? g.reduce((s, x) => s + Math.max(1, x.sets || 1), 0) : we.sets
}

/** Aplica una operación (pura). Con bloques: el RIR se mueve en todos; la serie, en el último. */
export function aplicarOperacion (we: WorkoutExercise, op: OperacionIem, rirMinimo = 0): WorkoutExercise {
  const g = grupos(we)
  if (op.tipo === 'rir') {
    const mover = (rir: number) => Math.min(RIR_MAXIMO, Math.max(rirMinimo, rir + op.delta))
    if (g) return syncAggregateFromGroups({ ...we, setGroups: g.map(x => ({ ...x, rir: mover(Number(x.rir)) })) })
    return { ...we, rir: mover(Number(we.rir)) }
  }
  if (op.tipo === 'serie') {
    if (g) {
      const ult = g.length - 1
      return syncAggregateFromGroups({ ...we, setGroups: g.map((x, i) => (i === ult ? { ...x, sets: Math.max(1, x.sets + op.delta) } : x)) })
    }
    return { ...we, sets: Math.max(1, we.sets + op.delta) }
  }
  return { ...we, technique: 'dropset', tecnicaAjustes: undefined }
}

/** Aplica varias operaciones en orden (las que el coach haya marcado). */
export function aplicarOperaciones (we: WorkoutExercise, ops: OperacionIem[], rirMinimo = 0): WorkoutExercise {
  return ops.reduce((w, op) => aplicarOperacion(w, op, rirMinimo), we)
}

function describir (we: WorkoutExercise, op: OperacionIem): { de: string; a: string } {
  if (op.tipo === 'rir') {
    const n = aplicarOperacion(we, op)
    return { de: `RIR ${rirMinDe(we)}`, a: `RIR ${rirMinDe(n)}` }
  }
  if (op.tipo === 'serie') return { de: `${seriesTotales(we)} series`, a: `${seriesTotales(we) + op.delta} series` }
  return { de: 'sin técnica', a: 'drop set en la última serie' }
}

/** IEM por zona de unos ejercicios programados (ya resueltos para su semana). */
export function iemProgramadoPorZona (motor: MotorCdg, nombreCdgDe: NombreCdgDe, ejercicios: WorkoutExercise[]): Record<ZonaIem, number> {
  const res = motor.sumar(ejercicios.flatMap(we => seriesProgramadas(we, nombreCdgDe)).map(motor.calcularSerie))
  return iemPorZona(motor, res.IEM.length ? res.IEM : new Array(motor.musculos.length).fill(0))
}

export function proponerProgresionIem (e: EntradaProgresionIem): { cambios: CambioIem[]; zonas: ResumenZonaIem[] } {
  const { motor, nombreCdgDe } = e
  const palancas = { rir: true, series: true, tecnica: false, ...e.palancas }
  const rirMinimo = e.rirMinimo ?? 0
  const mrvDe = (g?: MuscleGroup) => (g ? e.mrvPorGrupo?.[g] ?? VOLUME_LANDMARKS_DEFAULT[g]?.mrv : undefined)

  const calc = (we: WorkoutExercise) => {
    const res = motor.sumar(seriesProgramadas(we, nombreCdgDe).map(motor.calcularSerie))
    return { IF: res.IF, zonas: iemPorZona(motor, res.IEM.length ? res.IEM : new Array(motor.musculos.length).fill(0)) }
  }
  const actual = new Map(e.ejercicios.map(x => [x.clave, x.we]))
  const cache = new Map<WorkoutExercise, ReturnType<typeof calc>>()
  const calcCache = (we: WorkoutExercise) => { let c = cache.get(we); if (!c) { c = calc(we); cache.set(we, c) } return c }
  const totalZona = (z: ZonaIem) => e.ejercicios.reduce((s, x) => s + calcCache(actual.get(x.clave)!).zonas[z], 0)
  const seriesDeLaZonaDelGrupo = (g: MuscleGroup) => {
    const zona = ZONAS_IEM.find(z => (z.grupos as readonly string[]).includes(g))
    if (!zona) return 0
    return e.ejercicios.filter(x => x.grupo && (zona.grupos as readonly string[]).includes(x.grupo))
      .reduce((s, x) => s + seriesTotales(actual.get(x.clave)!), 0)
  }
  /** Aislamiento: el 70 % o más de su IEM cae en una sola zona. */
  const esAislamiento = (we: WorkoutExercise) => {
    const z = Object.values(calcCache(we).zonas)
    const total = z.reduce((a, b) => a + b, 0)
    return total > 0 && Math.max(...z) / total >= 0.7
  }

  const usado = new Set<string>() // `${clave}:${tipo}`
  const cambios: CambioIem[] = []
  const resumen: ResumenZonaIem[] = []

  const zonasOrdenadas = ZONAS_IEM
    .filter(z => (e.pctPorZona[z.clave] ?? 0) !== 0)
    .sort((a, b) => Math.abs(e.pctPorZona[b.clave]!) - Math.abs(e.pctPorZona[a.clave]!))

  for (const z of zonasOrdenadas) {
    const pct = e.pctPorZona[z.clave]!
    const base = e.iemBase[z.clave] ?? 0
    const antes = totalZona(z.clave)
    if (base <= 0.005) {
      resumen.push({ zona: z.clave, nombre: z.nombre, pct, base, objetivo: 0, antes: r1(antes), despues: r1(antes), alcanzado: false, nota: 'Sin IEM de referencia: no se puede calcular el objetivo.' })
      continue
    }
    const objetivo = base * (1 + pct / 100)
    const tol = Math.max(0.5, objetivo * 0.03)
    for (let it = 0; it < ITERACIONES; it++) {
      const falta = objetivo - totalZona(z.clave)
      if (Math.abs(falta) <= tol) break
      const dir = Math.sign(falta)
      let mejor: { x: EjercicioProgramable; op: OperacionIem; nuevo: WorkoutExercise; dz: number; dIF: number; score: number } | null = null
      for (const x of e.ejercicios) {
        const we = actual.get(x.clave)!
        const c = calcCache(we)
        if (x.movible === false || c.zonas[z.clave] <= 0.005) continue
        const ops: OperacionIem[] = []
        if (dir > 0) {
          if (palancas.rir && !usado.has(`${x.clave}:rir`) && rirMinDe(we) > rirMinimo) ops.push({ tipo: 'rir', delta: -1 })
          if (palancas.series && !usado.has(`${x.clave}:serie`)) ops.push({ tipo: 'serie', delta: 1 })
          if (palancas.tecnica && !usado.has(`${x.clave}:tecnica`) && !we.technique && esAislamiento(we)) ops.push({ tipo: 'tecnica' })
        } else {
          if (palancas.rir && !usado.has(`${x.clave}:rir`) && rirMaxDe(we) < RIR_MAXIMO) ops.push({ tipo: 'rir', delta: 1 })
          if (palancas.series && !usado.has(`${x.clave}:serie`) && seriesTotales(we) > 1) ops.push({ tipo: 'serie', delta: -1 })
        }
        for (const op of ops) {
          const nuevo = aplicarOperacion(we, op, rirMinimo)
          const cn = calcCache(nuevo)
          const dz = cn.zonas[z.clave] - c.zonas[z.clave]
          const dIF = cn.IF - c.IF
          if (dz * dir <= 0.005) continue
          // No vale pasarse más de lo que faltaba.
          if (Math.abs(falta - dz) >= Math.abs(falta)) continue
          // Subir: menos IF por punto de IEM. Frenar: más IF quitado por punto de IEM quitado.
          const score = dir > 0 ? dIF / dz : -(dIF / dz)
          // Desempate estable: el orden de los ejercicios y de las palancas.
          if (!mejor || score < mejor.score - 1e-9) mejor = { x, op, nuevo, dz, dIF, score }
        }
      }
      if (!mejor) break
      const weAntes = actual.get(mejor.x.clave)!
      const { de, a } = describir(weAntes, mejor.op)
      actual.set(mejor.x.clave, mejor.nuevo)
      usado.add(`${mejor.x.clave}:${mejor.op.tipo}`)
      const cambio: CambioIem = {
        clave: mejor.x.clave, dia: mejor.x.dia, exerciseId: weAntes.exerciseId, zona: z.clave, op: mejor.op,
        de, a, deltaIemZona: r2(mejor.dz), deltaIF: r2(mejor.dIF),
      }
      if (mejor.op.tipo === 'serie' && mejor.op.delta > 0 && mejor.x.grupo) {
        const mrv = mrvDe(mejor.x.grupo)
        const series = seriesDeLaZonaDelGrupo(mejor.x.grupo)
        if (mrv != null && series > mrv) cambio.superaMrv = { series, mrv }
      }
      cambios.push(cambio)
    }
    const despues = totalZona(z.clave)
    const alcanzado = Math.abs(objetivo - despues) <= tol
    resumen.push({
      zona: z.clave, nombre: z.nombre, pct, base: r1(base), objetivo: r1(objetivo), antes: r1(antes), despues: r1(despues), alcanzado,
      ...(alcanzado ? {} : { nota: pct > 0 ? 'No llega con las palancas permitidas.' : 'No baja lo suficiente con las palancas permitidas.' }),
    })
  }
  return { cambios, zonas: resumen }
}
