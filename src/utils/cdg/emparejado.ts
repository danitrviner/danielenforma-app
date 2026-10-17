/**
 * Emparejado ejercicio de la app ↔ ejercicio del catálogo CDG, para la pantalla
 * «Emparejado CDG» del coach.
 *
 * Misma lógica que scripts/emparejarCdg.mjs (que genera el informe y el CSV):
 *   1. Quita " - Grupos musculares" del nombre CDG y busca coincidencia EXACTA
 *      (sin mayúsculas, tildes ni paréntesis).
 *   2. Si no la hay, el id de los ejercicios del catálogo (sys_<slug>) sale del
 *      nombre CDG ORIGINAL; si ese slug coincide con UN solo nombre CDG, es la
 *      pareja aunque la limpieza haya acortado el nombre.
 *   3. Si tampoco, propone los 3 más parecidos (similitud de palabras).
 * Si se cambia una, hay que cambiar la otra.
 */

export type EstadoEmparejado = 'exacto' | 'probable' | 'ambiguo' | 'revisar'

export interface Candidato { cdgNombre: string; parecido: number }
export interface FilaEmparejado {
  id: string
  nombreApp: string
  estado: EstadoEmparejado
  /** Nombre CDG que se propone (exacto o por id original); null si hay que elegir. */
  propuesto: string | null
  candidatos: Candidato[]
}

export const norm = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()

/** "Nombre (variante) - Grupo1, Grupo2" → "Nombre (variante)". Tolera "déficit- Grupo". */
export function sinMusculos (nombreCdg: string): string {
  const m = nombreCdg.match(/^(.*?)\s*-\s+[^-]*$/)
  return (m ? m[1] : nombreCdg).trim()
}

const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const tokens = (s: string) => new Set(norm(s).split(' ').filter(t => t.length > 1))
const parecido = (a: string, b: string) => {
  const A = tokens(a); const B = tokens(b)
  const inter = [...A].filter(t => B.has(t)).length
  return inter / (A.size + B.size - inter || 1)
}

function agrupar (nombresCdg: string[], clave: (c: string) => string) {
  const m = new Map<string, string[]>()
  for (const c of nombresCdg) {
    const k = clave(c)
    const l = m.get(k)
    if (l) l.push(c); else m.set(k, [c])
  }
  return m
}

export function proponerEmparejados (
  ejercicios: Array<{ id: string; name: string }>,
  nombresCdg: string[]
): FilaEmparejado[] {
  const porNombre = agrupar(nombresCdg, c => norm(sinMusculos(c)))
  const porSlug = agrupar(nombresCdg, c => slug(sinMusculos(c)))
  return ejercicios.map(e => {
    const exactos = porNombre.get(norm(e.name)) ?? []
    if (exactos.length === 1) return { id: e.id, nombreApp: e.name, estado: 'exacto', propuesto: exactos[0], candidatos: [] }
    const porId = exactos.length ? [] : (porSlug.get(slug(e.id.replace(/^sys_/, ''))) ?? [])
    if (porId.length === 1) {
      return { id: e.id, nombreApp: e.name, estado: 'probable', propuesto: porId[0], candidatos: [{ cdgNombre: porId[0], parecido: 1 }] }
    }
    const candidatos = (exactos.length ? exactos : nombresCdg)
      .map(c => ({ cdgNombre: c, parecido: Math.round(parecido(e.name, sinMusculos(c)) * 100) / 100 }))
      .sort((a, b) => b.parecido - a.parecido).slice(0, 3)
    return {
      id: e.id, nombreApp: e.name, propuesto: null, candidatos,
      estado: exactos.length > 1 ? 'ambiguo' : (candidatos[0]?.parecido ?? 0) >= 0.75 ? 'probable' : 'revisar'
    }
  })
}

/** Buscador sobre el catálogo CDG: todas las palabras escritas deben aparecer. */
export function buscarEnCatalogo (nombresCdg: string[], consulta: string, max = 12): string[] {
  const palabras = norm(consulta).split(' ').filter(Boolean)
  if (palabras.length === 0) return []
  return nombresCdg.filter(c => { const n = norm(c); return palabras.every(p => n.includes(p)) }).slice(0, max)
}

/** Decisión del coach sobre un ejercicio: un nombre CDG, o null = «Sin equivalente». */
export type RevisionesCdg = Record<string, string | null>
