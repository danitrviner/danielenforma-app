/**
 * Seguimiento CDG a partir de los datos de En Forma (logs, mesociclo, grupos).
 *
 * Todo se calcula AL VUELO desde los logs: no se guardan copias de «Gestión» ni
 * de «Datos de rendimiento», así que no pueden quedarse desactualizadas como en
 * la hoja. Las fórmulas viven en seguimiento.ts (validadas contra la hoja); aquí
 * solo se agrupan los datos de la app y se deciden las ventanas de semanas.
 */
import type { WorkoutExercise, WorkoutLog } from '../../types'
import { mesocycleWeekNumber, resolverEjercicioDelMeso } from '../progression.js'
import type { MotorCdg } from './motor.js'
import { cargaProgramada, semanaRealizadaDesdeLogs, type NombreCdgDe } from './adaptadores.js'
import type { ContextoPesoCorporal } from '../pesoCorporal.js'
import {
  avisosCarga, cargaAgudaCronica, calcularSemana, filasGestion, rendimientoCiclo, rendimientoSemana,
  SEMANAS_CARGA_CRONICA, SEMANAS_CARGA_MINIMAS, colapsarSemana, colapsarCarga, incrementosAntropometria,
  type CalculoSemana, type FilaGestion, type FilaRendimiento, type SemanaRealizada
} from './seguimiento.js'

export interface UmbralesCarga { inferior: number; superior: number }
export const UMBRALES_CARGA_POR_DEFECTO: UmbralesCarga = { inferior: 0.8, superior: 1.6 }

export interface SemanaSeguimiento {
  semana: number
  realizada: SemanaRealizada
  calculo: CalculoSemana
  gestion: FilaGestion[]
  rendimiento: FilaRendimiento[]
  /** Sesiones registradas esa semana. */
  logs: number
}

export interface EntradaSemanas {
  logs: WorkoutLog[]
  meso: { id: string; startDate: string; semanasDescarga?: number[]; semanasTest?: number[] }
  cicloDias: number
  vueltas: number
  /** Sesión del microciclo (0-6) a la que pertenece una rutina: `Workout.dayIndex`. */
  sesionDeWorkout: (workoutId: string) => number | undefined
  nombreCdgDe: NombreCdgDe
  motor: MotorCdg
  /** Para sumar el peso corporal a dominadas, fondos… (CR5). Sin él, como siempre. */
  pesoCorporal?: ContextoPesoCorporal | null
}

/**
 * Semanas del bloque con sesiones registradas, en orden cronológico.
 * La hoja solo tiene 7 huecos de sesión por semana: los logs de rutinas sin
 * `dayIndex` (rutinas antiguas) o con `dayIndex` > 6 (ciclos de 8-10 días) se
 * cuentan en `descartados` en vez de perderse sin avisar.
 */
export function semanasRealizadasDelMeso (e: EntradaSemanas) {
  const porSemana = new Map<number, WorkoutLog[]>()
  const descartados = { sinSesion: 0, fueraDeSemana: 0 }
  for (const l of e.logs) {
    if (l.mesocycleId !== e.meso.id) continue
    // mesocycleWeekNumber da 1 a cualquier fecha anterior al inicio: se descarta aparte.
    const s = l.date < e.meso.startDate ? 0 : mesocycleWeekNumber(e.meso.startDate, l.date, e.cicloDias)
    if (!(s >= 1 && s <= e.vueltas)) { descartados.fueraDeSemana++; continue }
    const d = e.sesionDeWorkout(l.workoutId)
    if (d == null || d < 0 || d > 6) { descartados.sinSesion++; continue }
    if (!porSemana.has(s)) porSemana.set(s, [])
    porSemana.get(s)!.push(l)
  }
  const semanas: SemanaSeguimiento[] = [...porSemana.keys()].sort((a, b) => a - b).map(semana => {
    const logs = porSemana.get(semana)!
    const realizada = semanaRealizadaDesdeLogs(logs, e.nombreCdgDe, l => e.sesionDeWorkout(l.workoutId), { pesoCorporal: e.pesoCorporal ?? null })
    return {
      semana, realizada, logs: logs.length,
      calculo: calcularSemana(e.motor, realizada),
      gestion: filasGestion(semana, calcularSemana(e.motor, realizada)),
      rendimiento: rendimientoSemana(`Semana ${semana}`, realizada)
    }
  })
  return { semanas, descartados }
}

/**
 * Semana que enseña el seguimiento por defecto: la última con TODAS las
 * sesiones del ciclo registradas. La semana en curso suele tener una o dos
 * sesiones, y compararla con la anterior da «−100 %» en media tabla.
 * Si ninguna está completa, la última.
 */
export function semanaPorDefecto<T extends { logs: number }> (semanas: readonly T[], sesionesPorCiclo: number): T | undefined {
  if (semanas.length === 0) return undefined
  for (let i = semanas.length - 1; i >= 0; i--) if (semanas[i].logs >= sesionesPorCiclo) return semanas[i]
  return semanas[semanas.length - 1]
}

export interface GrupoDelDia { dayIndex?: number; exercises: WorkoutExercise[] }

/** Lo programado para la semana `semana`, ya resuelto (cambios por semana, descarga, test), en 7 huecos. */
export function sesionesProgramadasDeLaSemana (
  grupos: GrupoDelDia[], meso: Parameters<typeof resolverEjercicioDelMeso>[1], semana: number
): WorkoutExercise[][] {
  const out: WorkoutExercise[][] = Array.from({ length: 7 }, () => [])
  grupos.forEach((g, i) => {
    const d = g.dayIndex ?? i
    if (d < 0 || d > 6) return
    out[d] = g.exercises.map(we => resolverEjercicioDelMeso(we, meso, semana))
  })
  return out
}

export type CargaAgudaCronicaDelMeso =
  | { disponible: false; motivo: string; semanaReferencia?: number }
  | {
      disponible: true
      /** La semana PROGRAMADA que se compara con las últimas realizadas. */
      semanaReferencia: number
      /** Semanas de ESTE bloque usadas para la crónica. */
      semanasUsadas: number[]
      /** Semanas de bloques anteriores usadas (E-10): entonces solo cuentan los totales. */
      semanasDeOtrosBloques: number
      /** Menos de 6 semanas: se calcula, pero es poco fiable. */
      fiable: boolean
      ac: NonNullable<ReturnType<typeof cargaAgudaCronica>>
      avisos: ReturnType<typeof avisosCarga>
    }

/**
 * Aguda = lo programado para la semana siguiente a la última realizada (o la
 * semana que se pida en `semanaReferencia`).
 * Crónica = media simple de las 6 últimas semanas realizadas (E-10):
 *  - con 6 del propio bloque, como siempre (sesión a sesión y total);
 *  - si no llegan, se completan con las más recientes de bloques anteriores
 *    (`semanasAnteriores`, la más reciente primero) y solo se comparan los
 *    TOTALES de la semana: las sesiones de otro bloque no se corresponden;
 *  - con 3 a 5 semanas se calcula avisando de que es poco fiable; con menos, no;
 *  - la semana del calendario en curso (`semanaEnCurso`) no cuenta: está a medias.
 */
export function cargaAgudaCronicaDelMeso (args: {
  motor: MotorCdg
  semanas: SemanaSeguimiento[]
  grupos: GrupoDelDia[]
  meso: Parameters<typeof resolverEjercicioDelMeso>[1]
  vueltas: number
  nombreCdgDe: NombreCdgDe
  umbrales?: Partial<UmbralesCarga>
  /** Semanas realizadas de bloques anteriores, la más reciente primero (`semanasAnterioresAlBloque`). */
  semanasAnteriores?: CalculoSemana[]
  /** Semana programada a comparar (la que mira el coach en Volumen, 11-a). Sin ella,
   *  la siguiente a la última realizada, como en Seguimiento. */
  semanaReferencia?: number
  /** La semana del calendario en curso (`mesocycleWeekNumber(startDate, hoy)`): no
   *  entra en la crónica aunque tenga sesiones, porque está a medias y bajaría
   *  la media (decisión de Dani, 27-10). */
  semanaEnCurso?: number
}): CargaAgudaCronicaDelMeso {
  const { motor, semanas, grupos, meso, vueltas, nombreCdgDe } = args
  const elegida = args.semanaReferencia
  if (elegida != null && elegida < 1) return { disponible: false, motivo: 'En Base no hay semana programada que comparar.' }
  if (elegida == null && semanas.length === 0) return { disponible: false, motivo: 'Todavía no hay sesiones registradas en este bloque.' }
  const ref = elegida ?? semanas[semanas.length - 1].semana + 1
  if (ref > vueltas) return { disponible: false, motivo: 'La última semana del bloque ya está realizada: no hay semana siguiente que comparar.' }
  const previas = semanas.filter(s => s.semana < ref && s.semana !== args.semanaEnCurso).slice(-SEMANAS_CARGA_CRONICA).reverse()
  const deOtros = previas.length < SEMANAS_CARGA_CRONICA
    ? (args.semanasAnteriores ?? []).slice(0, SEMANAS_CARGA_CRONICA - previas.length)
    : []
  const total = previas.length + deOtros.length
  if (total < SEMANAS_CARGA_MINIMAS) {
    return {
      disponible: false, semanaReferencia: ref,
      motivo: `Hacen falta al menos ${SEMANAS_CARGA_MINIMAS} semanas realizadas para la carga crónica y hay ${total}.`
    }
  }
  const cruza = deOtros.length > 0
  const agudaSesiones = cargaProgramada(motor, sesionesProgramadasDeLaSemana(grupos, meso, ref), nombreCdgDe)
  const aguda = cruza ? colapsarCarga(agudaSesiones) : agudaSesiones
  const cronicas = [...previas.map(s => s.calculo), ...deOtros].map(c => (cruza ? colapsarSemana(c) : c))
  const ac = cargaAgudaCronica(aguda, cronicas, SEMANAS_CARGA_MINIMAS)!
  const u = { ...UMBRALES_CARGA_POR_DEFECTO, ...args.umbrales }
  const avisos = avisosCarga(ac, motor, u)
  // Cruzando bloques, la «sesión 1» colapsada es la semana entera: solo vale el total.
  const soloTotal = <T extends { sesion: string }>(xs: T[]) => (cruza ? xs.filter(x => x.sesion === 'Total de sesiones') : xs)
  return {
    disponible: true, semanaReferencia: ref, semanasUsadas: previas.map(s => s.semana),
    semanasDeOtrosBloques: deOtros.length, fiable: total >= SEMANAS_CARGA_CRONICA, ac,
    avisos: { sesionesIF: soloTotal(avisos.sesionesIF), musculos: soloTotal(avisos.musculos), articulaciones: soloTotal(avisos.articulaciones) },
  }
}

/**
 * Semanas realizadas ANTES de un bloque (de bloques anteriores), en tramos de
 * 7 días hacia atrás desde su inicio, la más reciente primero. Las semanas sin
 * entrenos no cuentan (como en la hoja: solo semanas realizadas). Todo va a la
 * sesión 1: entre bloques solo se comparan totales.
 */
export function semanasAnterioresAlBloque (e: {
  logs: WorkoutLog[]; inicio: string; motor: MotorCdg; nombreCdgDe: NombreCdgDe; maxSemanas?: number; buscarHasta?: number
  pesoCorporal?: ContextoPesoCorporal | null
}): CalculoSemana[] {
  const max = e.maxSemanas ?? SEMANAS_CARGA_CRONICA
  const tramos = e.buscarHasta ?? 12
  const inicio = Date.parse(`${e.inicio.slice(0, 10)}T00:00:00Z`)
  const out: CalculoSemana[] = []
  for (let k = 1; k <= tramos && out.length < max; k++) {
    const desde = inicio - k * 7 * 86_400_000
    const hasta = desde + 7 * 86_400_000
    const deLaSemana = e.logs.filter(l => {
      const t = Date.parse(`${l.date.slice(0, 10)}T00:00:00Z`)
      return t >= desde && t < hasta
    })
    if (deLaSemana.length === 0) continue
    out.push(calcularSemana(e.motor, semanaRealizadaDesdeLogs(deLaSemana, e.nombreCdgDe, () => 0, { pesoCorporal: e.pesoCorporal ?? null })))
  }
  return out
}

/** Mejora del ciclo por ejercicio y por categoría (Empuje, Tracción, Brazo, Pierna, Cadera). */
export function rendimientoDelCiclo (motor: MotorCdg, semanas: SemanaSeguimiento[]) {
  return rendimientoCiclo(
    semanas.map(s => ({ semana: `Semana ${s.semana}`, filas: s.rendimiento })),
    nombre => motor.descripcion(nombre)?.category
  )
}

/** Incremento inicio → último de los índices antropométricos (los índices ya los calcula utils/anthropometricIndices). */
export const incrementoAntropometria = incrementosAntropometria
