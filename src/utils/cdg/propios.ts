/**
 * Ejercicios «propios» del catálogo CDG (11-11).
 *
 * Son ejercicios de la biblioteca que no están en el Excel de CulturaDeGym. Se
 * les dan los valores (33 músculos, 11 articulaciones, inestabilidad) de uno
 * parecido del catálogo, con matices a mano. Viven en un documento aparte,
 * `cdgCatalogo/propios`, con el mismo formato compacto, para no tocar el del
 * Excel (`cdgCatalogo/v4`). Al leer, se unen: el motor no distingue unos de otros.
 *
 * Llevan «(propio)» al final del nombre y subcategoría «Propio».
 */
import type { CdgCatalogoCompacto } from './motor.js'

export const CDG_PROPIOS_DOC = 'propios'

/** Devuelve el catálogo con los propios añadidos. Si los propios no encajan, el catálogo tal cual. */
export function unirPropios (jsonCatalogo: string, jsonPropios: string | null | undefined): string {
  if (!jsonPropios) return jsonCatalogo
  let c: CdgCatalogoCompacto, p: CdgCatalogoCompacto
  try {
    c = JSON.parse(jsonCatalogo)
    p = JSON.parse(jsonPropios)
  } catch {
    return jsonCatalogo
  }
  if (!Array.isArray(p?.exercises) || !p.exercises.length) return jsonCatalogo
  // Mismo orden de músculos y articulaciones, o los valores caerían en otro músculo.
  if (JSON.stringify(p.muscles) !== JSON.stringify(c.muscles) || JSON.stringify(p.joints) !== JSON.stringify(c.joints)) {
    console.warn('[cdg] Los ejercicios propios no usan los mismos músculos/articulaciones que el catálogo: se ignoran.')
    return jsonCatalogo
  }
  const nombres = new Set(c.exercises.map(e => e.exercise))
  const nuevos = p.exercises.filter(e =>
    !nombres.has(e.exercise) && e.m?.length === c.muscles.length && e.j?.length === c.joints.length)
  return nuevos.length ? JSON.stringify({ ...c, exercises: [...c.exercises, ...nuevos] }) : jsonCatalogo
}
