/**
 * Rendimiento (RM y tonelaje) con los registros de la app (D2, 17-11-2026).
 *
 * `calcularRM`, `rendimientoSemana` y `rendimientoCiclo` (seguimiento.ts) son la
 * réplica de la hoja y NO se tocan: sus pruebas comparan contra la hoja real,
 * que hace la media de TODAS las series. Pero con los registros de la app eso
 * mezcla series que no estiman lo mismo: una serie a RIR 5 no tiene RPE en la
 * tabla de la hoja, da RM 0 y hunde la media del ejercicio; una de 20
 * repeticiones a RIR 3 la mueve sin decir nada de la fuerza.
 *
 * Esto es el mismo cálculo con las series filtradas ANTES de pasárselas a las
 * funciones de la hoja, con el criterio de `utils/rmValido.ts` (3-12
 * repeticiones, RIR 2 o menos = RPE 8 o más, RIR apuntado por el atleta). El
 * tonelaje sigue saliendo de todas las series. Un ejercicio sin ninguna serie
 * válida no tiene marca: `rm` 0 con `sinMarca: true`, y no entra en el
 * rendimiento del ciclo.
 *
 * Las series hechas fuera de su gimnasio (`fuera`, utils/sesionFuera.ts) no
 * entran ni en el RM ni en el tonelaje: otras máquinas, otros kilos (Dani,
 * 17-11-2026). Un ejercicio con todas sus series fuera no da fila: no hay
 * dato de fuerza que enseñar, ni un «sin marca» que reclamar. Su estímulo
 * (IEM) sí cuenta, pero eso se calcula en otro sitio (`calcularSemana`).
 *
 * Vive aparte de seguimiento.ts porque `rmValido` importa `oneRepMax`, que
 * importa seguimiento: dentro de él sería una dependencia circular.
 */
import { REPS_MAX_RM, REPS_MIN_RM, RIR_MAX_RM } from '../rmValido.js'
import {
  calcularRM, calcularTonelaje, rendimientoCiclo,
  type CdgSerieRealizada, type FilaRendimiento, type SemanaRealizada
} from './seguimiento.js'

/** RPE mínimo para que una serie valga para el RM: RIR `RIR_MAX_RM` o menos. */
export const RPE_MIN_RM = 10 - RIR_MAX_RM

/** ¿Se hizo la serie fuera de su gimnasio? La marca la pone el adaptador
 *  (`CdgSerieRealizadaDeApp`); las series de la hoja no la llevan nunca. */
export function esSerieCdgFuera (s: CdgSerieRealizada): boolean {
  return (s as { fuera?: unknown }).fuera === true
}

/** ¿Vale la serie (ya en formato de la hoja) para estimar el RM? Mismo filtro que `rmValido.ts`, y nunca una hecha fuera. */
export function esSerieCdgValidaParaRm (s: CdgSerieRealizada): boolean {
  if (esSerieCdgFuera(s)) return false
  const reps = s.repetitions.min
  if (!(Number(s.weight) > 0)) return false
  if (!(reps >= REPS_MIN_RM && reps <= REPS_MAX_RM)) return false
  if (s.rirApuntado === false) return false
  // Sin RPE (un RIR que la tabla de la hoja no tiene, como el 5) no hay RM.
  return typeof s.rpe === 'number' && s.rpe >= RPE_MIN_RM
}

/** Las series del ejercicio que valen para el RM. */
export const seriesCdgValidasParaRm = (sets: CdgSerieRealizada[]) => sets.filter(esSerieCdgValidaParaRm)

/**
 * `rendimientoSemana` para los registros de la app: el RM, solo con las series
 * válidas (media de ellas, como hace la hoja con las que recibe); el tonelaje,
 * con todas las que no se hicieron fuera de su gimnasio.
 */
export function rendimientoSemanaDeRegistros (nombreSemana: string, semana: SemanaRealizada): FilaRendimiento[] {
  const filas: FilaRendimiento[] = []
  semana.forEach((dia, d) => dia.forEach(todas => {
    // La marca va en todas las series de la sesión: o quedan todas o ninguna.
    const sets = todas.filter(s => !esSerieCdgFuera(s))
    if (!sets.length) return
    const validas = seriesCdgValidasParaRm(sets)
    filas.push({
      semana: nombreSemana, sesion: `Sesión ${d + 1}`, ejercicio: sets[0].exerciseName,
      rm: validas.length ? calcularRM(validas) : 0, tonelaje: calcularTonelaje(sets),
      ...(validas.length ? {} : { sinMarca: true })
    })
  }))
  return filas
}

/** `rendimientoCiclo` sin las filas que no tienen marca: un ejercicio sin series válidas no «pierde el 100 %». */
export function rendimientoCicloDeRegistros (semanas: Array<{ semana: string; filas: FilaRendimiento[] }>, categoriaDe: (ejercicio: string) => string | undefined) {
  return rendimientoCiclo(
    semanas.map(s => ({ semana: s.semana, filas: s.filas.filter(f => f.rm > 0) })).filter(s => s.filas.length > 0),
    categoriaDe
  )
}
