/**
 * Series PRINCIPALES de un ejercicio: sin las bajadas (dropset) ni miniseries
 * (myoreps) o pausas (rest-pause) añadidas tras la última serie (`segmento: true`).
 *
 * Una técnica de intensidad se SUMA a la serie, no es una serie más. Para todo
 * lo que cuenta series —volumen, estímulo, RIR medio, series hechas frente a
 * pautadas— se usa esto. Para lo que cuenta carga real (tonelaje, 1RM, mejor
 * serie) se siguen usando todas las filas: levantar ese peso fue real.
 */
export function seriesPrincipales<T extends { segmento?: boolean }>(sets: readonly T[]): T[] {
  return sets.filter(s => !s.segmento);
}
