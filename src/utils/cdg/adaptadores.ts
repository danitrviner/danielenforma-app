/**
 * Puente entre los tipos de En Forma (Workout, WorkoutLog…) y el motor CDG.
 *
 * Lo único que la app tiene que aportar es `nombreCdgDe(exerciseId)`: el nombre
 * EXACTO del ejercicio en el catálogo CDG (p.ej. guardado en un campo nuevo
 * `Exercise.cdgNombre`). Sin ese vínculo el ejercicio cuenta 0, igual que en la
 * hoja cuando el nombre no coincide.
 */
import type { WorkoutExercise, WorkoutLog, WorkoutTechnique } from '../../types'
import { parsearReps, rirARpe, type CdgSerie, type CdgTecnica, type MotorCdg } from './motor.js'
import type { CdgSerieRealizada, SemanaRealizada, CargaPorSesion } from './seguimiento.js'
import { seriesPrincipales } from '../seriesPrincipales.js'
import { seriesConTecnica } from '../tecnicaDeSerie.js'
import { pesoDeSerie, type ContextoPesoCorporal } from '../pesoCorporal.js'

export type NombreCdgDe = (exerciseId: string) => string | undefined

/**
 * Cómo se traduce la técnica de En Forma (una por ejercicio) a la de la hoja
 * (por serie). Decisión de Dani: por defecto se aplica a la ÚLTIMA serie.
 * `null` = no tiene equivalente y cuenta como serie normal.
 */
export const TECNICA_POR_DEFECTO: Record<WorkoutTechnique, CdgTecnica | null> = {
  dropset: 'Drop 1',
  myoreps: 'Myo rep',
  restpause: 'Rest Pause 1',
  amrap: null,
  fallo: null
}

/** "AMRAP", "" o texto sin número → no se puede calcular (la hoja tampoco lo acepta). */
function repsSeguras (reps: string) {
  try { return parsearReps(reps) } catch { return null }
}

/** Series PROGRAMADAS de un ejercicio de una sesión (ya resuelta la semana con utils/progression). */
export function seriesProgramadas (
  we: WorkoutExercise,
  nombreCdgDe: NombreCdgDe,
  tecnicas: Record<WorkoutTechnique, CdgTecnica | null> = TECNICA_POR_DEFECTO
): CdgSerie[] {
  const nombre = nombreCdgDe(we.exerciseId)
  if (!nombre) return []
  const grupos = we.setGroups?.length ? we.setGroups : [{ sets: we.sets, reps: we.reps, rir: we.rir }]
  const out: CdgSerie[] = []
  for (const g of grupos) {
    const reps = repsSeguras(g.reps)
    if (!reps) continue
    for (let i = 0; i < g.sets; i++) out.push({ exerciseName: nombre, rpe: rirARpe(g.rir), repetitions: reps, intensificationTechnique: 'Normal' })
  }
  // La técnica va en las series que diga el ejercicio (E-06); sin ajustes, en la
  // última, que es como se leía antes.
  const tec = we.technique ? tecnicas[we.technique] : null
  if (tec) for (const n of seriesConTecnica(we, out.length)) out[n - 1].intensificationTechnique = tec
  return out
}

/**
 * Series REALIZADAS de un log (equivalente a la Semana X). Igual que la hoja
 * (decisión de Dani, 16-10-2026):
 *  - `alFallo` cuenta como RIR 0 (la hoja no distingue fallo de RIR 0).
 *  - Las series sin kg (peso corporal = 0 kg en la app) NO cuentan, como en la
 *    hoja. `contarSinPeso: true` las incluiría.
 */
export function seriesRealizadas (
  entry: WorkoutLog['entries'][number],
  nombreCdgDe: NombreCdgDe,
  { contarSinPeso = false, tecnica = null as CdgTecnica | null, pesoCorporal = null as ContextoPesoCorporal | null } = {}
): CdgSerieRealizada[] {
  const nombre = nombreCdgDe(entry.exerciseId)
  if (!nombre) return []
  const out: CdgSerieRealizada[] = []
  for (const s of seriesPrincipales(entry.sets)) {
    if (!s.repsDone) continue
    // Dominadas, fondos…: lo apuntado más el peso del atleta, si se conoce (CR5).
    const kg = pesoDeSerie(s.weight, entry.exerciseId, pesoCorporal)
    if (!contarSinPeso && !kg) continue
    out.push({
      exerciseName: nombre,
      repetitions: { min: s.repsDone, max: s.repsDone, raw: String(s.repsDone) },
      weight: kg,
      rpe: rirARpe(s.alFallo ? 0 : s.rir),
      intensification: ''
    })
  }
  if (tecnica && out.length) out[out.length - 1].intensification = tecnica
  if (out[0]) out[0].intensificationList = []
  return out
}

/**
 * Una semana realizada (7 huecos, uno por sesión del microciclo) a partir de los
 * logs. `sesionDe(log)` devuelve el índice 0-6 de la sesión (p.ej. Workout.dayIndex).
 */
export function semanaRealizadaDesdeLogs (
  logs: WorkoutLog[],
  nombreCdgDe: NombreCdgDe,
  sesionDe: (log: WorkoutLog) => number | undefined,
  opciones?: Parameters<typeof seriesRealizadas>[2]
): SemanaRealizada {
  const semana: SemanaRealizada = Array.from({ length: 7 }, () => [])
  for (const log of logs) {
    const d = sesionDe(log)
    if (d == null || d < 0 || d > 6) continue
    for (const entry of log.entries) {
      const sets = seriesRealizadas(entry, nombreCdgDe, opciones)
      if (sets.length) semana[d].push(sets)
    }
  }
  return semana
}

/** Carga AGUDA = lo programado: totales por sesión (hasta 7) + total semana. */
export function cargaProgramada (motor: MotorCdg, sesiones: WorkoutExercise[][], nombreCdgDe: NombreCdgDe): CargaPorSesion {
  const nM = motor.musculos.length; const nJ = motor.articulaciones.length
  const dias = Array.from({ length: 7 }, (_, i) => sesiones[i] ?? [])
  const porDia = dias.map(ejs => motor.sumar(ejs.flatMap(we => seriesProgramadas(we, nombreCdgDe)).map(motor.calcularSerie)))
  const tot = motor.sumar(porDia)
  return {
    IF: [...porDia.map(d => d.IF), tot.IF],
    IEM: [...porDia.map(d => (d.IEM.length ? d.IEM : new Array(nM).fill(0))), tot.IEM],
    estresArticular: [...porDia.map(d => (d.estresArticular.length ? d.estresArticular : new Array(nJ).fill(0))), tot.estresArticular]
  }
}
