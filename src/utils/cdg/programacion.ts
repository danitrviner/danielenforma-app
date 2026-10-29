/**
 * Resumen de una sesión programada (lo que enseña el panel del editor de mesociclo).
 *
 * Recibe los ejercicios YA resueltos para la semana (utils/progression:
 * `resolverEjercicioDelMeso`) y suma IF, IEM, estrés articular y tiempo con el
 * motor CDG. No cambia ninguna fórmula: solo agrupa lo que el motor ya calcula.
 */
import type { WorkoutExercise } from '../../types.js'
import { SEGUNDOS_BASE_SERIE, TECNICA_SEGUNDOS, iemCompuesto, type MotorCdg } from './motor.js'
import { seriesProgramadas, type NombreCdgDe } from './adaptadores.js'

export interface ResumenSesionCdg {
  IF: number
  IEM: number[]
  /** Columnas «IEM [COMPUESTO]» de Programación (suma de porciones). */
  compuestos: Record<string, number>
  estresArticular: number[]
  tiempoSeg: number
  porEjercicio: Array<{ exerciseId: string; IF: number; IEM: number[] }>
  /** Ejercicios sin `cdgNombre`: cuentan 0. */
  sinVinculo: string[]
  /** Con `cdgNombre` que no existe en el catálogo cargado: cuentan 0. */
  fueraDeCatalogo: string[]
  /** RIR 5: la plantilla no lo admite, IF e IEM salen 0. */
  rir5: string[]
}

/** ¿Algún bloque de series del ejercicio va a RIR 5? */
export function usaRir5 (we: WorkoutExercise): boolean {
  const grupos = we.setGroups?.length ? we.setGroups : [{ rir: we.rir }]
  return grupos.some(g => Number(g.rir) === 5)
}

/** Segundos de la sesión como los cuenta la hoja: 60 + pausa + extra de la técnica, por serie. */
export function tiempoEjercicioSeg (we: WorkoutExercise, nombreCdg: string, series: ReturnType<typeof seriesProgramadas>): number {
  const pausa = Number(we.restSeconds) || 0
  const seg = series.reduce((a, s) => a + SEGUNDOS_BASE_SERIE + pausa + (TECNICA_SEGUNDOS[s.intensificationTechnique as keyof typeof TECNICA_SEGUNDOS] ?? 0), 0)
  // RAREZA DEL ORIGINAL: «unilateral» se detecta por la palabra en el nombre.
  return seg * (nombreCdg.includes('unilateral') ? 2 : 1)
}

export function resumenSesion (motor: MotorCdg, ejercicios: WorkoutExercise[], nombreCdgDe: NombreCdgDe): ResumenSesionCdg {
  const sinVinculo: string[] = []; const fueraDeCatalogo: string[] = []; const rir5: string[] = []
  const porEjercicio: ResumenSesionCdg['porEjercicio'] = []
  const resultados: Array<ReturnType<MotorCdg['calcularSerie']>> = []
  let tiempoSeg = 0

  for (const we of ejercicios) {
    if (usaRir5(we)) rir5.push(we.exerciseId)
    const nombre = nombreCdgDe(we.exerciseId)
    if (!nombre) { sinVinculo.push(we.exerciseId); porEjercicio.push({ exerciseId: we.exerciseId, IF: 0, IEM: [] }); continue }
    if (!motor.existe(nombre)) fueraDeCatalogo.push(we.exerciseId)
    const series = seriesProgramadas(we, nombreCdgDe)
    const res = series.map(motor.calcularSerie)
    resultados.push(...res)
    const suma = motor.sumar(res)
    porEjercicio.push({ exerciseId: we.exerciseId, IF: suma.IF, IEM: suma.IEM })
    tiempoSeg += tiempoEjercicioSeg(we, nombre, series)
  }

  const total = motor.sumar(resultados)
  return {
    IF: total.IF,
    IEM: total.IEM,
    compuestos: iemCompuesto(total.IEM),
    estresArticular: total.estresArticular,
    tiempoSeg,
    porEjercicio,
    sinVinculo,
    fueraDeCatalogo,
    rir5
  }
}

/** Suma de varias sesiones (total de la semana). */
export function sumarSesiones (motor: MotorCdg, resumenes: ResumenSesionCdg[]) {
  const total = motor.sumar(resumenes.map(r => ({ IF: r.IF, IEM: r.IEM, estresArticular: r.estresArticular })))
  return { ...total, compuestos: iemCompuesto(total.IEM), tiempoSeg: resumenes.reduce((a, r) => a + r.tiempoSeg, 0) }
}

export const formatearTiempo = (seg: number) => {
  const min = Math.round(seg / 60)
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`
}
