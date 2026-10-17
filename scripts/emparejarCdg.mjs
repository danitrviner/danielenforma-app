/**
 * Empareja los ejercicios de la app con el catálogo CDG (CulturaDeGym).
 *
 * Los ejercicios de la app salen del Excel de CDG quitando " - Grupos musculares"
 * del nombre (scripts/normalizarEjerciciosExcel.py), y luego la limpieza fusionó
 * o renombró algunos (scripts/out/reporte-limpieza-ejercicios.md). Este script:
 *   1. Quita la parte de músculos de cada nombre CDG.
 *   2. Busca coincidencia EXACTA (ignorando mayúsculas, tildes y espacios).
 *   3. Si no la hay, propone las 3 más parecidas para revisión manual.
 *
 * NO escribe en Firestore. Solo genera:
 *   scripts/out/emparejamiento-cdg.json  (exerciseId → cdgNombre | null, con estado)
 *   scripts/out/emparejamiento-cdg.csv   (para revisar a ojo en Sheets)
 *
 * Uso:
 *   node scripts/emparejarCdg.mjs [ruta/catalogo-cdg.json] [ruta/ejercicios-app.json]
 *   (por defecto: scripts/cdg/catalogo-cdg.json y scripts/out/ejercicios-catalogo-limpio.json)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rutaCdg = resolve(process.argv[2] ?? resolve(__dirname, 'cdg/catalogo-cdg.json'))
const rutaApp = resolve(process.argv[3] ?? resolve(__dirname, 'out/ejercicios-catalogo-limpio.json'))

const cdg = JSON.parse(readFileSync(rutaCdg, 'utf8')).exercises.map(e => e.exercise)
const app = JSON.parse(readFileSync(rutaApp, 'utf8')) // [{ id, name, ... }]

export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()

/** "Nombre (variante) - Grupo1, Grupo2" → "Nombre (variante)". Tolera "déficit- Grupo". */
export function sinMusculos (nombreCdg) {
  const m = nombreCdg.match(/^(.*?)\s*-\s+[^-]*$/)
  return (m ? m[1] : nombreCdg).trim()
}

const tokens = s => new Set(norm(s).split(' ').filter(t => t.length > 1))
const parecido = (a, b) => {
  const A = tokens(a); const B = tokens(b)
  const inter = [...A].filter(t => B.has(t)).length
  return inter / (A.size + B.size - inter || 1)
}

const indice = new Map()
for (const c of cdg) {
  const k = norm(sinMusculos(c))
  if (!indice.has(k)) indice.set(k, [])
  indice.get(k).push(c)
}

// El id de los ejercicios del catálogo (sys_<slug>) sale del nombre CDG ORIGINAL, y la limpieza
// después acortó muchos nombres ("(caja torácica plana)", "(mayor dorsiflexión)"…). Si el slug
// del id coincide con UN solo nombre CDG, esa es una pareja fiable aunque el nombre haya cambiado.
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const indicePorSlug = new Map()
for (const c of cdg) {
  const k = slug(sinMusculos(c))
  if (!indicePorSlug.has(k)) indicePorSlug.set(k, [])
  indicePorSlug.get(k).push(c)
}

const filas = app.map(e => {
  const exactos = indice.get(norm(e.name)) ?? []
  if (exactos.length === 1) return { id: e.id, nombreApp: e.name, cdgNombre: exactos[0], estado: 'exacto', candidatos: [] }
  const porId = exactos.length ? [] : (indicePorSlug.get(slug(String(e.id).replace(/^sys_/, ''))) ?? [])
  if (porId.length === 1) {
    return { id: e.id, nombreApp: e.name, cdgNombre: null, propuesto: porId[0], motivo: 'id original', estado: 'probable',
      candidatos: [{ cdgNombre: porId[0], parecido: 1 }] }
  }
  const candidatos = (exactos.length ? exactos : cdg)
    .map(c => ({ c, p: parecido(e.name, sinMusculos(c)) }))
    .sort((a, b) => b.p - a.p).slice(0, 3)
  return {
    id: e.id, nombreApp: e.name, cdgNombre: null,
    estado: exactos.length > 1 ? 'ambiguo' : candidatos[0]?.p >= 0.75 ? 'probable' : 'revisar',
    candidatos: candidatos.map(x => ({ cdgNombre: x.c, parecido: Math.round(x.p * 100) / 100 }))
  }
})

mkdirSync(resolve(__dirname, 'out'), { recursive: true })
writeFileSync(resolve(__dirname, 'out/emparejamiento-cdg.json'), JSON.stringify(filas, null, 2))
const csv = ['id;nombreApp;estado;cdgNombre;candidato1;parecido1;candidato2;candidato3',
  ...filas.map(f => [f.id, f.nombreApp, f.estado, f.cdgNombre ?? '', f.candidatos[0]?.cdgNombre ?? '', f.candidatos[0]?.parecido ?? '',
    f.candidatos[1]?.cdgNombre ?? '', f.candidatos[2]?.cdgNombre ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))]
writeFileSync(resolve(__dirname, 'out/emparejamiento-cdg.csv'), csv.join('\n'))

const cuenta = filas.reduce((a, f) => ({ ...a, [f.estado]: (a[f.estado] ?? 0) + 1 }), {})
console.log(`App: ${app.length} ejercicios · CDG: ${cdg.length}`)
console.log(cuenta)
