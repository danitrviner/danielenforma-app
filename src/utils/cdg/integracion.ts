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
import {
  avisosCarga, cargaAgudaCronica, calcularSemana, filasGestion, rendimientoCiclo, rendimientoSemana,
  SEMANAS_CARGA_CRONICA, incrementosAntropometria,
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
    const realizada = semanaRealizadaDesdeLogs(logs, e.nombreCdgDe, l => e.sesionDeWorkout(l.workoutId))
    return {
      semana, realizada, logs: logs.length,
      calculo: calcularSemana(e.motor, realizada),
      gestion: filasGestion(semana, calcularSemana(e.motor, realizada)),
      rendimiento: rendimientoSemana(`Semana ${semana}`, realizada)
    }
  })
  return { semanas, descartados }
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
      /** La semana PROGRAMADA que se compara con las 6 últimas realizadas. */
      semanaReferencia: number
      semanasUsadas: number[]
      ac: NonNullable<ReturnType<typeof cargaAgudaCronica>>
      avisos: ReturnType<typeof avisosCarga>
    }

/**
 * Aguda = lo programado para la semana siguiente a la última realizada.
 * Crónica = media de las 6 últimas semanas realizadas (dentro de este bloque).
 * Con menos de 6 no hay cálculo, y dice cuántas hay.
 */
export function cargaAgudaCronicaDelMeso (args: {
  motor: MotorCdg
  semanas: SemanaSeguimiento[]
  grupos: GrupoDelDia[]
  meso: Parameters<typeof resolverEjercicioDelMeso>[1]
  vueltas: number
  nombreCdgDe: NombreCdgDe
  umbrales?: Partial<UmbralesCarga>
}): CargaAgudaCronicaDelMeso {
  const { motor, semanas, grupos, meso, vueltas, nombreCdgDe } = args
  if (semanas.length === 0) return { disponible: false, motivo: 'Todavía no hay sesiones registradas en este bloque.' }
  const ref = semanas[semanas.length - 1].semana + 1
  if (ref > vueltas) return { disponible: false, motivo: 'La última semana del bloque ya está realizada: no hay semana siguiente que comparar.' }
  const previas = semanas.filter(s => s.semana < ref).slice(-SEMANAS_CARGA_CRONICA).reverse()
  if (previas.length < SEMANAS_CARGA_CRONICA) {
    return {
      disponible: false, semanaReferencia: ref,
      motivo: `Hacen falta ${SEMANAS_CARGA_CRONICA} semanas realizadas para la carga crónica y hay ${previas.length}.`
    }
  }
  const aguda = cargaProgramada(motor, sesionesProgramadasDeLaSemana(grupos, meso, ref), nombreCdgDe)
  const ac = cargaAgudaCronica(aguda, previas.map(s => s.calculo))!
  const u = { ...UMBRALES_CARGA_POR_DEFECTO, ...args.umbrales }
  return { disponible: true, semanaReferencia: ref, semanasUsadas: previas.map(s => s.semana), ac, avisos: avisosCarga(ac, motor, u) }
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
