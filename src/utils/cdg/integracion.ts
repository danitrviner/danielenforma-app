/**
 * Seguimiento CDG a partir de los datos de En Forma (logs, mesociclo, grupos).
 *
 * Todo se calcula AL VUELO desde los logs: no se guardan copias de «Gestión» ni
 * de «Datos de rendimiento», así que no pueden quedarse desactualizadas como en
 * la hoja. Las fórmulas viven en seguimiento.ts (validadas contra la hoja); aquí
 * solo se agrupan los datos de la app y se deciden las ventanas de semanas.
 */
import type { WorkoutExercise, WorkoutLog, WorkoutTechnique } from '../../types.js'
import { mesocycleWeekNumber, resolverEjercicioDelMeso } from '../progression.js'
import type { MotorCdg } from './motor.js'
import { cargaProgramada, semanaRealizadaDesdeLogs, type NombreCdgDe } from './adaptadores.js'
import type { ContextoPesoCorporal } from '../pesoCorporal.js'
import { semanaRecortada } from './semanaBase.js'
import {
  avisosCarga, cargaAgudaCronica, calcularSemana, filasGestion,
  SEMANAS_CARGA_CRONICA, SEMANAS_CARGA_MINIMAS, colapsarSemana, colapsarCarga, incrementosAntropometria,
  type CalculoSemana, type FilaGestion, type FilaRendimiento, type SemanaRealizada
} from './seguimiento.js'
// El RM de los registros de la app sale solo de las series válidas (rmValido.ts, 17-11-2026).
import { rendimientoCicloDeRegistros, rendimientoSemanaDeRegistros } from './rendimientoDeRegistros.js'

/** Estrés articular semanal máximo de un atleta en cada articulación (clave = nombre de `motor.articulaciones`). */
export type LimitesArticulares = Partial<Record<string, number>>

export interface UmbralesCarga {
  inferior: number
  superior: number
  /** X1 (17-11-2026): límite semanal de estrés articular por articulación de ESTE
   *  atleta. Viaja y se guarda con sus umbrales (`UserProfile.cdgUmbralesCarga`). */
  limitesArticulares?: LimitesArticulares
}
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
  meso: { id: string; startDate: string } & NonNullable<Parameters<typeof resolverEjercicioDelMeso>[1]>
  cicloDias: number
  vueltas: number
  /** Sesión del microciclo (0-6) a la que pertenece una rutina: `Workout.dayIndex`. */
  sesionDeWorkout: (workoutId: string) => number | undefined
  nombreCdgDe: NombreCdgDe
  motor: MotorCdg
  /** Para sumar el peso corporal a dominadas, fondos… (CR5). Sin él, como siempre. */
  pesoCorporal?: ContextoPesoCorporal | null
  /** Lo programado en el bloque (F15): de ahí sale qué técnica llevaba pautada
   *  cada ejercicio en cada semana. Sin ello, la técnica de las bajadas y
   *  miniseries apuntadas se deduce del peso (`tecnicaDeSegmentos`). */
  grupos?: GrupoDelDia[]
}

/**
 * La técnica que tenía pautada un ejercicio en la semana `semana` del bloque,
 * ya resuelta (cambios por semana, test). Se busca primero en la sesión del
 * registro y, si allí no está, en el resto del bloque. `undefined` = no se sabe.
 */
export function tecnicaPautadaEnElBloque (
  grupos: GrupoDelDia[], meso: Parameters<typeof resolverEjercicioDelMeso>[1], semana: number, sesion: number | undefined, exerciseId: string
): WorkoutTechnique | null | undefined {
  const deLaSesion = (g: GrupoDelDia, i: number) => (g.dayIndex ?? i) === sesion
  const candidatos = [...grupos.filter(deLaSesion), ...grupos.filter((g, i) => !deLaSesion(g, i))]
  for (const g of candidatos) {
    const we = g.exercises.map(x => resolverEjercicioDelMeso(x, meso, semana)).find(x => x.exerciseId === exerciseId)
    if (we) return we.technique ?? null
  }
  return undefined
}

/**
 * Semanas del bloque con sesiones registradas, en orden cronológico.
 * La hoja solo tiene 7 huecos de sesión por semana: los logs de rutinas sin
 * `dayIndex` (rutinas antiguas) o con `dayIndex` > 6 (ciclos de 8-10 días) se
 * cuentan en `descartados` en vez de perderse sin avisar.
 *
 * F15 (17-11-2026): lo realizado lleva las técnicas que el atleta APUNTÓ
 * (bajadas, miniseries), con la misma equivalencia que lo programado. Antes
 * iba siempre sin técnica y el ratio aguda:crónica salía inflado donde las hay.
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
    const grupos = e.grupos
    const realizada = semanaRealizadaDesdeLogs(logs, e.nombreCdgDe, l => e.sesionDeWorkout(l.workoutId), {
      pesoCorporal: e.pesoCorporal ?? null, segmentos: true,
      tecnicaPautadaDe: grupos ? (l, id) => tecnicaPautadaEnElBloque(grupos, e.meso, semana, e.sesionDeWorkout(l.workoutId), id) : undefined
    })
    return {
      semana, realizada, logs: logs.length,
      calculo: calcularSemana(e.motor, realizada),
      gestion: filasGestion(semana, calcularSemana(e.motor, realizada)),
      rendimiento: rendimientoSemanaDeRegistros(`Semana ${semana}`, realizada)
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
      /** Semanas realizadas que NO entran en la crónica por ser de descarga o puente (F15). */
      semanasRecortadas: number[]
      /** Semanas SIN ninguna sesión que entran en la crónica como cero (F15): están en `semanasUsadas`. */
      semanasVacias: number[]
      /** La semana que se compara es de descarga o puente: no se avisa «por debajo». */
      referenciaRecortada: 'descarga' | 'puente' | null
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
 *  - la semana del calendario en curso (`semanaEnCurso`) no cuenta: está a medias;
 *  - las semanas de descarga y de puente tampoco (F15, 17-11-2026): van
 *    recortadas a propósito y bajarían la media, con lo que la vuelta a la carga
 *    normal parecería un salto. Y si la semana que se compara es una de ellas,
 *    no se avisa «por debajo»: quedarse corto es justo lo que se busca.
 * Lo que se estrena (crónica 0, carga esta semana) sale en `avisos.nuevos`, no
 * como ratio 1. De los bloques anteriores no se sabe cuáles fueron descarga.
 *
 * Semanas SIN ninguna sesión (F15, 17-11-2026): la hoja se las salta («últimas
 * semanas realizadas») y aquí ya no. Una semana de vacaciones dentro del bloque
 * baja la crónica de verdad, así que cuenta como CERO si ya ha pasado (anterior
 * a `semanaEnCurso`; sin ese dato, anterior a la última realizada). Las del
 * principio del bloque, antes de su primera sesión, solo cuentan si el atleta
 * ya tenía registros de antes (`semanasAnteriores` trae alguna): si no, son
 * anteriores a su primer registro y no dicen nada de su carga.
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
  const recortada = (s: number) => semanaRecortada(meso ?? {}, s)
  const realizadas = semanas.filter(s => s.semana < ref && s.semana !== args.semanaEnCurso)
  const semanasRecortadas = realizadas.filter(s => recortada(s.semana) != null).map(s => s.semana)
  // Semanas sin sesiones que cuentan como cero (ver arriba).
  const hechas = new Set(semanas.map(s => s.semana))
  const primeraHecha = semanas.length ? semanas[0].semana : Infinity
  const pasadasHasta = args.semanaEnCurso ?? (semanas.length ? semanas[semanas.length - 1].semana : 0)
  const conHistoria = (args.semanasAnteriores?.length ?? 0) > 0
  const semanasVacias: number[] = []
  for (let s = 1; s < ref && s < pasadasHasta; s++) {
    if (hechas.has(s) || recortada(s) != null) continue
    if (s < primeraHecha && !conHistoria) continue
    semanasVacias.push(s)
  }
  const candidatas: Array<{ semana: number; calculo: CalculoSemana }> = [
    ...realizadas.filter(s => recortada(s.semana) == null),
    ...semanasVacias.map(semana => ({ semana, calculo: semanaSinSesiones(motor) })),
  ].sort((a, b) => a.semana - b.semana)
  const previas = candidatas.slice(-SEMANAS_CARGA_CRONICA).reverse()
  const deOtros = previas.length < SEMANAS_CARGA_CRONICA
    ? (args.semanasAnteriores ?? []).slice(0, SEMANAS_CARGA_CRONICA - previas.length)
    : []
  const total = previas.length + deOtros.length
  if (total < SEMANAS_CARGA_MINIMAS) {
    return {
      disponible: false, semanaReferencia: ref,
      motivo: `Hacen falta al menos ${SEMANAS_CARGA_MINIMAS} semanas realizadas para la carga crónica y hay ${total}${semanasRecortadas.length ? ` (sin contar ${semanasRecortadas.map(n => `S${n}`).join(', ')}, de descarga o puente)` : ''}.`
    }
  }
  const cruza = deOtros.length > 0
  const agudaSesiones = cargaProgramada(motor, sesionesProgramadasDeLaSemana(grupos, meso, ref), nombreCdgDe)
  const aguda = cruza ? colapsarCarga(agudaSesiones) : agudaSesiones
  const cronicas = [...previas.map(s => s.calculo), ...deOtros].map(c => (cruza ? colapsarSemana(c) : c))
  const ac = cargaAgudaCronica(aguda, cronicas, SEMANAS_CARGA_MINIMAS)!
  const u = { ...UMBRALES_CARGA_POR_DEFECTO, ...args.umbrales }
  const referenciaRecortada = recortada(ref)
  const avisos = avisosCarga(ac, motor, { ...u, sinAvisoPorDebajo: referenciaRecortada != null })
  // Cruzando bloques, la «sesión 1» colapsada es la semana entera: solo vale el total.
  const soloTotal = <T extends { sesion: string }>(xs: T[]) => (cruza ? xs.filter(x => x.sesion === 'Total de sesiones') : xs)
  return {
    disponible: true, semanaReferencia: ref, semanasUsadas: previas.map(s => s.semana),
    semanasRecortadas, referenciaRecortada, semanasVacias: semanasVacias.filter(v => previas.some(p => p.semana === v)),
    semanasDeOtrosBloques: deOtros.length, fiable: total >= SEMANAS_CARGA_CRONICA, ac,
    // `nuevos` ya es solo del total de la semana.
    avisos: { sesionesIF: soloTotal(avisos.sesionesIF), musculos: soloTotal(avisos.musculos), articulaciones: soloTotal(avisos.articulaciones), nuevos: avisos.nuevos },
  }
}

/** Una semana sin ninguna sesión: todo a cero, con la forma de una realizada. */
export function semanaSinSesiones (motor: MotorCdg): CalculoSemana {
  return calcularSemana(motor, Array.from({ length: 7 }, () => []))
}

/**
 * Semanas realizadas ANTES de un bloque (de bloques anteriores), en tramos de
 * 7 días hacia atrás desde su inicio, la más reciente primero. Todo va a la
 * sesión 1: entre bloques solo se comparan totales.
 *
 * Tramos sin entrenos (F15, 17-11-2026): cuentan como CERO cuando caen DENTRO
 * de un bloque que estaba en marcha, es decir, entre dos sesiones registradas
 * del mismo mesociclo (unas vacaciones a mitad de bloque). Los demás se saltan
 * como antes: el hueco entre el final de un bloque y el inicio del siguiente
 * (no se sabe si seguía en marcha) y todo lo anterior al primer registro.
 * Las bajadas y miniseries apuntadas cuentan también aquí; como de un bloque
 * anterior no se tiene lo pautado, su técnica se deduce del peso.
 */
export function semanasAnterioresAlBloque (e: {
  logs: WorkoutLog[]; inicio: string; motor: MotorCdg; nombreCdgDe: NombreCdgDe; maxSemanas?: number; buscarHasta?: number
  pesoCorporal?: ContextoPesoCorporal | null
}): CalculoSemana[] {
  const max = e.maxSemanas ?? SEMANAS_CARGA_CRONICA
  const tramos = e.buscarHasta ?? 12
  const inicio = Date.parse(`${e.inicio.slice(0, 10)}T00:00:00Z`)
  const dia = (l: WorkoutLog) => Date.parse(`${l.date.slice(0, 10)}T00:00:00Z`)
  // Primer y último registro de cada mesociclo: lo que hay entre medias es bloque en marcha.
  const porBloque = new Map<string, { primero: number; ultimo: number }>()
  for (const l of e.logs) {
    if (!l.mesocycleId) continue
    const t = dia(l); const b = porBloque.get(l.mesocycleId)
    porBloque.set(l.mesocycleId, { primero: Math.min(b?.primero ?? t, t), ultimo: Math.max(b?.ultimo ?? t, t) })
  }
  const dentroDeUnBloque = (desde: number, hasta: number) => [...porBloque.values()].some(b => b.primero < desde && b.ultimo >= hasta)
  const out: CalculoSemana[] = []
  for (let k = 1; k <= tramos && out.length < max; k++) {
    const desde = inicio - k * 7 * 86_400_000
    const hasta = desde + 7 * 86_400_000
    const deLaSemana = e.logs.filter(l => dia(l) >= desde && dia(l) < hasta)
    if (deLaSemana.length === 0) {
      if (dentroDeUnBloque(desde, hasta)) out.push(semanaSinSesiones(e.motor))
      continue
    }
    out.push(calcularSemana(e.motor, semanaRealizadaDesdeLogs(deLaSemana, e.nombreCdgDe, () => 0, { pesoCorporal: e.pesoCorporal ?? null, segmentos: true })))
  }
  return out
}

/** Mejora del ciclo por ejercicio y por categoría (Empuje, Tracción, Brazo, Pierna, Cadera). */
export function rendimientoDelCiclo (motor: MotorCdg, semanas: SemanaSeguimiento[]) {
  return rendimientoCicloDeRegistros(
    semanas.map(s => ({ semana: `Semana ${s.semana}`, filas: s.rendimiento })),
    nombre => motor.descripcion(nombre)?.category
  )
}

/** Incremento inicio → último de los índices antropométricos (los índices ya los calcula utils/anthropometricIndices). */
export const incrementoAntropometria = incrementosAntropometria
