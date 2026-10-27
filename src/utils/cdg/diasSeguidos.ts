/**
 * P2 · Articulaciones cargadas en días seguidos.
 *
 * El curso insiste en que dos sesiones pegadas no pueden cargar los mismos
 * tejidos pasivos sin ~48 h entre medias. La tabla de estrés articular da el
 * número por sesión, pero nadie lo ve de un vistazo entre 11 filas × N
 * columnas: aquí se marcan las parejas de sesiones en días consecutivos del
 * ciclo (`dayIndex` seguidos) en las que la misma articulación pasa del
 * umbral en las dos. Umbral orientativo (unidades de estrés articular de la
 * hoja); no es una regla del curso, solo un resaltado.
 */
export interface SesionArticular { nombre: string; dayIndex?: number; estresArticular: number[] }
export interface AvisoDiasSeguidos { articulacion: string; j: number; sesiones: [number, number]; valores: [number, number] }

export const UMBRAL_DIAS_SEGUIDOS = 5

export function articulacionesEnDiasSeguidos (
  articulaciones: readonly string[], sesiones: SesionArticular[], umbral = UMBRAL_DIAS_SEGUIDOS
): AvisoDiasSeguidos[] {
  const out: AvisoDiasSeguidos[] = []
  const conDia = sesiones.map((s, i) => ({ i, dia: s.dayIndex })).filter(x => x.dia != null) as Array<{ i: number; dia: number }>
  conDia.sort((a, b) => a.dia - b.dia)
  for (let k = 0; k + 1 < conDia.length; k++) {
    const a = conDia[k]; const b = conDia[k + 1]
    if (b.dia - a.dia !== 1) continue
    articulaciones.forEach((articulacion, j) => {
      const va = sesiones[a.i].estresArticular[j] ?? 0
      const vb = sesiones[b.i].estresArticular[j] ?? 0
      if (va >= umbral && vb >= umbral) out.push({ articulacion, j, sesiones: [a.i, b.i], valores: [va, vb] })
    })
  }
  return out
}
