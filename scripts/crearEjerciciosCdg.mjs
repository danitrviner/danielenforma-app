#!/usr/bin/env node
/**
 * Crea en `exercises` los ejercicios del catálogo CDG que la app todavía no
 * tiene (ningún ejercicio con ese `cdgNombre`), para poder elegirlos al programar.
 *
 * Cada uno nace como los del sistema: ownerId 'system', isCustom false, tipo
 * fuerza, `cdgNombre` exacto, vídeo del catálogo y nombre = nombre CDG sin la
 * lista de músculos (se conservan goma, caja torácica, straps… para distinguir
 * variantes). Grupo principal y secundarios: de la lista de músculos del nombre
 * CDG (el orden del autor); si no la trae (fullbody, «Pull over en máquina»),
 * de los pesos de músculo del catálogo.
 *
 * Simulacro por defecto. Con --aplicar usa `create()` (nunca pisa un documento)
 * y marca el catálogo como cambiado para que las apps lo relean.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=… node scripts/crearEjerciciosCdg.mjs [--aplicar]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb, marcarCatalogoCambiado } from './_lib/firestoreDb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APLICAR = process.argv.includes('--aplicar')
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Falta GOOGLE_APPLICATION_CREDENTIALS'); process.exit(1) }

const catalogo = JSON.parse(readFileSync(resolve(__dirname, 'cdg/catalogo-cdg.json'), 'utf8'))
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Palabra del nombre CDG → MuscleGroup de la app.
const POR_PALABRA = {
  'pectoral': 'pecho', 'dorsal': 'dorsal', 'trapecio': 'trapecio', 'complejo escapular': 'trapecio',
  'deltoides anterior': 'deltoide_ant', 'deltoides medial': 'deltoide_lat', 'deltoides posterior': 'deltoide_post',
  'biceps': 'biceps', 'triceps': 'triceps', 'antebrazo': 'antebrazo',
  'cuadriceps': 'cuadriceps', 'isquios': 'isquios', 'gluteo': 'gluteo', 'gluteo (gluteo medio)': 'gluteo',
  'aductores': 'aductores', 'gemelos': 'gemelo', 'soleos': 'gemelo',
  'abdomen': 'core', 'oblicuos': 'core', 'psoas iliaco': 'core',
  'lumbares': 'lumbares', 'erectores espinales': 'lumbares',
  'rotadores externos': 'rotadores', 'rotadores internos': 'rotadores', 'manguito rotador': 'rotadores',
}
// Índice de músculo CDG (orden de catalogo.muscles) → MuscleGroup, para el respaldo por pesos.
const POR_MUSCULO = {
  'Complejo escapular': 'trapecio', 'Rotadores externos hombro': 'rotadores',
  'Deltoides anterior': 'deltoide_ant', 'Deltoides medial': 'deltoide_lat', 'Deltoides posterior': 'deltoide_post',
  'Erectores espinales dorsales': 'lumbares', 'Erectores espinales lumbares': 'lumbares',
  'Abdomen': 'core', 'Oblicuos': 'core', 'Psoas ilíaco': 'core', 'Aductores': 'aductores', 'Isquios': 'isquios',
  'Rotadores externos cadera': 'gluteo',
}
const grupoDeMusculo = m => POR_MUSCULO[m] ?? (
  m.startsWith('Pectoral') ? 'pecho' : m.startsWith('Dorsal') ? 'dorsal' : m.startsWith('Flexores de codo') ? 'biceps'
    : m.startsWith('Triceps') ? 'triceps' : m.startsWith('Antebrazo') ? 'antebrazo' : m.startsWith('Cuádriceps') ? 'cuadriceps'
      : m.startsWith('Glúteo') ? 'gluteo' : m.startsWith('Plantiflexores') ? 'gemelo' : null)

/** «Nombre (variante) - Músculo, músculo» → { nombre, palabras }. Tolera «déficit- X», «-Fullbody» y sin guion. */
function partir (cdg) {
  let i = cdg.lastIndexOf(' - ')
  if (i < 0) { const m = cdg.match(/^(.*?)\s*-\s*([^-()]+)$/); if (m) return { nombre: m[1].trim(), palabras: m[2] } }
  if (i >= 0) {
    let nombre = cdg.slice(0, i).trim(); let resto = cdg.slice(i + 3)
    // «Spoto press en multipower - (caja torácica amplia) Pectoral, …»: la variante va tras el guion.
    const v = resto.match(/^\s*(\([^)]*\))\s*(.*)$/); if (v) { nombre = `${nombre} ${v[1]}`; resto = v[2] }
    return { nombre, palabras: resto }
  }
  const p = cdg.lastIndexOf(')')
  if (p >= 0 && p < cdg.length - 1) return { nombre: cdg.slice(0, p + 1).trim(), palabras: cdg.slice(p + 1) }
  return { nombre: cdg.trim(), palabras: '' }
}

function grupos (cdg, pesos) {
  const { palabras } = partir(cdg)
  const lista = []
  for (const w of palabras.split(',').map(x => norm(x).trim()).filter(Boolean)) {
    const g = POR_PALABRA[w]
    if (g && !lista.includes(g)) lista.push(g)
  }
  if (lista.length) return { muscleGroup: lista[0], secundarios: lista.slice(1), fuente: 'nombre' }
  const suma = {}
  catalogo.muscles.forEach((m, i) => { const g = grupoDeMusculo(m.muscle); if (g) suma[g] = (suma[g] ?? 0) + (pesos[i] ?? 0) })
  const orden = Object.entries(suma).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (!orden.length) return { muscleGroup: undefined, secundarios: [], fuente: 'ninguna' }
  const max = orden[0][1]
  return { muscleGroup: orden[0][0], secundarios: orden.slice(1).filter(([, v]) => v >= max * 0.5).slice(0, 3).map(([g]) => g), fuente: 'pesos' }
}

const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))
const snap = await db.collection('exercises').get()
const existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
const idsUsados = new Set(existentes.map(e => e.id))
const nombresUsados = new Map(existentes.map(e => [norm(e.name ?? ''), e.id]))
const vinculados = new Set(existentes.map(e => e.cdgNombre).filter(Boolean))

const nuevos = []; const avisos = []
for (const c of catalogo.exercises) {
  if (vinculados.has(c.exercise)) continue
  const { nombre } = partir(c.exercise)
  const g = grupos(c.exercise, c.m)
  let id = `sys_${slug(nombre)}`
  if (idsUsados.has(id)) id = `${id}-cdg`
  let n = 2; while (idsUsados.has(id)) id = `sys_${slug(nombre)}-cdg${n++}`
  idsUsados.add(id)
  if (nombresUsados.has(norm(nombre))) avisos.push(`Nombre ya usado por ${nombresUsados.get(norm(nombre))}: «${nombre}»`)
  if (g.fuente !== 'nombre') avisos.push(`Grupo por ${g.fuente}: «${c.exercise}» → ${g.muscleGroup ?? '—'} ${g.secundarios.join(',')}`)
  const doc = {
    ownerId: 'system', name: nombre, primaryFocus: nombre, type: 'fuerza', isCustom: false, cdgNombre: c.exercise,
    ...(c.link ? { videoUrl: c.link } : {}),
    ...(g.muscleGroup ? { muscleGroup: g.muscleGroup } : {}),
    ...(g.secundarios.length ? { secondaryMuscleGroups: g.secundarios } : {}),
  }
  nuevos.push({ id, doc })
}

const porGrupo = {}
for (const { doc } of nuevos) porGrupo[doc.muscleGroup ?? '(sin grupo)'] = (porGrupo[doc.muscleGroup ?? '(sin grupo)'] ?? 0) + 1
console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'} · ${existentes.length} ejercicios en la app · ${catalogo.exercises.length} en CDG · ${nuevos.length} a crear`)
console.log(porGrupo)
for (const a of avisos) console.log('  aviso:', a)
for (const { id, doc } of nuevos.slice(0, 12)) console.log(' ', id.padEnd(60), doc.name, '·', doc.muscleGroup, (doc.secondaryMuscleGroups ?? []).join(','))
if (nuevos.length > 12) console.log(`  … y ${nuevos.length - 12} más`)
mkdirSync(resolve(__dirname, 'out'), { recursive: true })
writeFileSync(resolve(__dirname, 'out/ejercicios-cdg-a-crear.json'), JSON.stringify(nuevos, null, 1))
console.log('Lista completa en scripts/out/ejercicios-cdg-a-crear.json')

if (!APLICAR) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(0) }
for (let i = 0; i < nuevos.length; i += 400) {
  const batch = db.batch()
  for (const { id, doc } of nuevos.slice(i, i + 400)) batch.create(db.collection('exercises').doc(id), doc)
  await batch.commit()
  console.log(`  creados ${Math.min(i + 400, nuevos.length)}/${nuevos.length}`)
}
await marcarCatalogoCambiado(db, 'exercises')
console.log("Sello de versión de 'exercises' actualizado. Hecho.")
