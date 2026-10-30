/**
 * IEM ESTIMADO para la Distribución (29-10).
 *
 * En la Distribución todavía no hay ejercicios —solo «tantas series de dorsal
 * el día 1»— y el IEM sale de los ejercicios. Para que el coach lo vea mientras
 * reparte, se estima: cada grupo aporta tantas series × lo que da de media UNA
 * serie de ese grupo en las rutinas que el coach ya programa (la mediana, para
 * que un ejercicio raro no tire de la cifra). Es una orientación: el IEM de
 * verdad sale en la vista previa, con los ejercicios elegidos.
 *
 * Puro: no lee nada; recibe el motor y las rutinas.
 */
import type { MuscleGroup, WorkoutExercise } from '../../types'
import type { MotorCdg } from './motor.js'
import { seriesProgramadas, type NombreCdgDe } from './adaptadores.js'

export type IemPorSerie = Partial<Record<MuscleGroup, number>>

const mediana = (xs: number[]): number => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** IEM total (todos los músculos) que da una serie de cada grupo, mediana de las rutinas del coach. */
export function iemPorSerieDeGrupo (o: {
  motor: Pick<MotorCdg, 'calcularSerie' | 'sumar'>
  nombreCdgDe: NombreCdgDe
  grupoDe: (exerciseId: string) => MuscleGroup | undefined
  rutinas: Array<{ exercises: WorkoutExercise[] }>
}): IemPorSerie {
  const porGrupo = new Map<MuscleGroup, number[]>()
  for (const rutina of o.rutinas) {
    for (const we of rutina.exercises) {
      const grupo = o.grupoDe(we.exerciseId)
      if (!grupo) continue
      const series = seriesProgramadas(we, o.nombreCdgDe)
      if (!series.length) continue
      const iem = o.motor.sumar(series.map(o.motor.calcularSerie)).IEM.reduce((a, b) => a + b, 0)
      porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), iem / series.length])
    }
  }
  const out: IemPorSerie = {}
  for (const [g, xs] of porGrupo) out[g] = mediana(xs)
  return out
}

/**
 * IEM estimado de un conjunto de asignaciones (un día, o un grupo en la semana).
 * `incompleto` avisa de que algún grupo no tiene referencia y no suma.
 */
export function iemEstimado (
  asignaciones: Array<{ group: MuscleGroup; series: number }>,
  porSerie: IemPorSerie
): { iem: number; incompleto: boolean } {
  let iem = 0
  let incompleto = false
  for (const a of asignaciones) {
    const v = porSerie[a.group]
    if (v == null) { if (a.series > 0) incompleto = true; continue }
    iem += a.series * v
  }
  return { iem, incompleto }
}
