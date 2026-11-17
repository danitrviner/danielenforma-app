/**
 * Puente entre los tipos de En Forma (Workout, WorkoutLog…) y el motor CDG.
 *
 * Lo único que la app tiene que aportar es `nombreCdgDe(exerciseId)`: el nombre
 * EXACTO del ejercicio en el catálogo CDG (p.ej. guardado en un campo nuevo
 * `Exercise.cdgNombre`). Sin ese vínculo el ejercicio cuenta 0, igual que en la
 * hoja cuando el nombre no coincide.
 */
import type { WorkoutExercise, WorkoutLog, WorkoutTechnique } from '../../types.js'
import { parsearReps, rirARpe, type CdgSerie, type CdgTecnica, type MotorCdg } from './motor.js'
import type { CdgSerieRealizada, SemanaRealizada, CargaPorSesion } from './seguimiento.js'
import { seriesPrincipales } from '../seriesPrincipales.js'
import { llevaSegmentos, serieDelSegmento, seriesConTecnica } from '../tecnicaDeSerie.js'
import { pesoDeSerie, type ContextoPesoCorporal } from '../pesoCorporal.js'

export type NombreCdgDe = (exerciseId: string) => string | undefined

/**
 * Serie realizada tal como sale de los registros de la app: la de la hoja más
 * la marca `fuera` (sesión hecha fuera de su gimnasio, utils/sesionFuera.ts).
 * La hoja no la tiene, así que no va en `CdgSerieRealizada`: el estímulo (IEM)
 * la ignora y la cuenta, que es lo que se quiere (el esfuerzo fue real); el
 * rendimiento la mira para dejarla fuera del RM y del tonelaje
 * (rendimientoDeRegistros.ts).
 */
export interface CdgSerieRealizadaDeApp extends CdgSerieRealizada {
  fuera?: true
}

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

export interface OpcionesDeRealizadas {
  contarSinPeso?: boolean
  /** Técnica fija en la última serie, se haya apuntado o no (lo de antes de F15). */
  tecnica?: CdgTecnica | null
  pesoCorporal?: ContextoPesoCorporal | null
  /**
   * F15 (17-11-2026): que las bajadas y miniseries APUNTADAS (`WorkoutSetLog.segmento`)
   * lleguen a lo realizado como técnica de la serie tras la que se hicieron.
   * Sin esto lo realizado iba siempre «Normal» mientras lo programado multiplica
   * la técnica, y el ratio aguda:crónica salía inflado donde hay técnicas.
   * Apagado por defecto: quien no lo pide sigue leyendo lo de siempre.
   */
  segmentos?: boolean
  /** La técnica que tenía pautada el ejercicio (`WorkoutExercise.technique`), si se conoce. */
  tecnicaPautada?: WorkoutTechnique | null
}

/**
 * Qué técnica del motor le toca a una serie con bajadas o miniseries apuntadas.
 *
 * El registro guarda QUE se hicieron y tras qué serie, pero no qué técnica era:
 * con eso solo no se reconstruye con fidelidad. Así que:
 *  - si se sabe la técnica pautada del ejercicio, es esa, con la MISMA
 *    equivalencia que lo programado (`TECNICA_POR_DEFECTO`: un drop set es
 *    «Drop 1» tenga una bajada o dos). Aguda y crónica cuentan igual la misma
 *    técnica, que es lo que necesita el ratio;
 *  - si no se sabe (bloques anteriores, ejercicio que ya no está en la rutina),
 *    se deduce del peso: segmentos con menos kg que su serie son un drop set;
 *    con los mismos, miniseries. Es una aproximación y se dice en pantalla.
 */
export function tecnicaDeSegmentos (
  pautada: WorkoutTechnique | null | undefined,
  pesoSerie: number,
  segmentos: ReadonlyArray<{ weight: number }>,
  tecnicas: Record<WorkoutTechnique, CdgTecnica | null> = TECNICA_POR_DEFECTO
): CdgTecnica | null {
  if (segmentos.length === 0) return null
  if (pautada && llevaSegmentos(pautada)) return tecnicas[pautada]
  return segmentos.every(g => g.weight < pesoSerie) ? tecnicas.dropset : tecnicas.myoreps
}

/**
 * Series REALIZADAS de un log (equivalente a la Semana X). Igual que la hoja
 * (decisión de Dani, 16-10-2026):
 *  - `alFallo` cuenta como RIR 0 (la hoja no distingue fallo de RIR 0).
 *  - Las series sin kg (peso corporal = 0 kg en la app) NO cuentan, como en la
 *    hoja. `contarSinPeso: true` las incluiría.
 * Con `segmentos: true`, la serie principal tras la que hay bajadas o
 * miniseries HECHAS (con repeticiones) lleva su técnica; una técnica pautada
 * que el atleta no apuntó no cuenta: no consta que la hiciera.
 * Una serie hecha fuera de su gimnasio sale con `fuera: true`
 * (`CdgSerieRealizadaDeApp`).
 */
export function seriesRealizadas (
  entry: WorkoutLog['entries'][number],
  nombreCdgDe: NombreCdgDe,
  { contarSinPeso = false, tecnica = null, pesoCorporal = null, segmentos = false, tecnicaPautada = null }: OpcionesDeRealizadas = {}
): CdgSerieRealizadaDeApp[] {
  const nombre = nombreCdgDe(entry.exerciseId)
  if (!nombre) return []
  const out: CdgSerieRealizadaDeApp[] = []
  const principales = seriesPrincipales(entry.sets)
  // Bajadas y miniseries hechas, por la serie principal (1 = la primera) a la que pertenecen.
  const hechos = new Map<number, Array<{ weight: number }>>()
  if (segmentos) {
    for (const s of entry.sets) {
      const n = s.repsDone ? serieDelSegmento(s, principales.length) : null
      if (n != null) hechos.set(n, [...(hechos.get(n) ?? []), s])
    }
  }
  for (const [i, s] of principales.entries()) {
    if (!s.repsDone) continue
    // Dominadas, fondos…: lo apuntado más el peso del atleta, si se conoce (CR5).
    const kg = pesoDeSerie(s.weight, entry.exerciseId, pesoCorporal)
    if (!contarSinPeso && !kg) continue
    out.push({
      exerciseName: nombre,
      repetitions: { min: s.repsDone, max: s.repsDone, raw: String(s.repsDone) },
      weight: kg,
      rpe: rirARpe(s.alFallo ? 0 : s.rir),
      intensification: tecnicaDeSegmentos(tecnicaPautada, s.weight, hechos.get(i + 1) ?? []) ?? '',
      // RIR pautado sin tocar: la serie cuenta para el estímulo y el tonelaje,
      // pero no para el RM (rendimientoDeRegistros.ts).
      ...(s.rirApuntado === false && !s.alFallo ? { rirApuntado: false } : {}),
      // Fuera de su gimnasio: estímulo sí; RM y tonelaje, no (17-11-2026).
      ...(s.fuera === true ? { fuera: true as const } : {})
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
  opciones?: Omit<OpcionesDeRealizadas, 'tecnicaPautada'> & {
    /** Técnica pautada de cada ejercicio de cada registro (F15); solo se mira con `segmentos`. */
    tecnicaPautadaDe?: (log: WorkoutLog, exerciseId: string) => WorkoutTechnique | null | undefined
  }
): SemanaRealizada {
  const semana: SemanaRealizada = Array.from({ length: 7 }, () => [])
  for (const log of logs) {
    const d = sesionDe(log)
    if (d == null || d < 0 || d > 6) continue
    for (const entry of log.entries) {
      const sets = seriesRealizadas(entry, nombreCdgDe, {
        ...opciones, tecnicaPautada: opciones?.segmentos ? opciones.tecnicaPautadaDe?.(log, entry.exerciseId) ?? null : null
      })
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
