/**
 * Vincula ejercicios de la biblioteca con el catálogo CDG escribiendo `cdgNombre`
 * en `exercises/{id}`, para que el motor les calcule IEM, IF y estrés articular:
 *   - cada ejercicio de scripts/cdg/propios-cdg.json → su versión «(propio)»;
 *   - DIRECTOS: ejercicios que son el mismo que uno del Excel → ese del Excel;
 *   - RENOMBRAR: corrige el nombre del ejercicio en la app.
 *
 * Antes hay que subir los propios (scripts/subirPropiosCdg.mjs --aplicar): un
 * nombre que no esté en Firestore seguiría contando 0.
 *
 * Nunca pisa un `cdgNombre` distinto que ya exista. POR DEFECTO ES UN SIMULACRO;
 * hace falta --aplicar para escribir.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/vincularPropiosCdg.mjs [--aplicar]
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb, marcarCatalogoCambiado } from './_lib/firestoreDb.mjs'

// 11-11 Dani: «el remo unilateral en banco de remo alineado es lo mismo que el
// remo unilateral en polea media» (que se borra con sustituirEjercicio.mjs).
const DIRECTOS = {
  'sys_remo-unilateral-en-banco-de-remo-alineado': 'Remo unilateral en polea media apoyado en banco agarre supino - Dorsal, deltoides posterior'
}
// 11-11 Dani: es retracción escapular, no rotación.
const RENOMBRAR = {
  'Jalón alto para trapecio con rotación escapular': 'Jalón alto para trapecio con retracción escapular'
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const APLICAR = process.argv.includes('--aplicar')
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }

const propios = JSON.parse(readFileSync(resolve(__dirname, 'cdg/propios-cdg.json'), 'utf8')).exercises
const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))

// Nombres que el motor conocerá: Excel (v4) + propios subidos.
const nombresDe = async (doc) => {
  const s = await db.collection('cdgCatalogo').doc(doc).get()
  return s.exists ? JSON.parse(s.data().json).exercises.map(e => e.exercise) : []
}
const enFirestore = new Set([...(await nombresDe('v4')), ...(await nombresDe('propios'))])

const objetivo = [
  ...propios.map(e => ({ id: e.appId, cdgNombre: e.exercise })),
  ...Object.entries(DIRECTOS).map(([id, cdgNombre]) => ({ id, cdgNombre }))
]
const faltan = objetivo.filter(o => !enFirestore.has(o.cdgNombre))
if (faltan.length) {
  console.log(`Aviso: ${faltan.length} nombres aún no están en Firestore (¿subirPropiosCdg.mjs --aplicar?).`)
  if (APLICAR) { console.error('No se escribe nada.'); process.exit(1) }
}

const aEscribir = []
const avisos = []
for (const o of objetivo) {
  const snap = await db.collection('exercises').doc(o.id).get()
  if (!snap.exists) { avisos.push(`? sin documento: ${o.id}`); continue }
  const d = snap.data()
  const campos = {}
  if (d.cdgNombre !== o.cdgNombre) {
    if (d.cdgNombre) { avisos.push(`! ${d.name} ya tiene «${d.cdgNombre}» (no se pisa)`); continue }
    campos.cdgNombre = o.cdgNombre
  }
  const nuevoNombre = RENOMBRAR[d.name]
  if (nuevoNombre) { campos.name = nuevoNombre; if (d.primaryFocus === d.name) campos.primaryFocus = nuevoNombre }
  if (Object.keys(campos).length) aEscribir.push({ id: o.id, nombre: d.name, campos })
}

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'} · ${aEscribir.length} de ${objetivo.length} ejercicios`)
for (const a of avisos) console.log('  ' + a)
for (const x of aEscribir) console.log(`  ${x.nombre}${x.campos.name ? `  → renombrado «${x.campos.name}»` : ''}`)
if (!APLICAR) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(0) }

const batch = db.batch()
for (const x of aEscribir) batch.update(db.collection('exercises').doc(x.id), x.campos)
if (aEscribir.length) { await batch.commit(); await marcarCatalogoCambiado(db, 'exercises') }
console.log('Hecho.')
process.exit(0)
