/**
 * Sube los ejercicios propios del catálogo CDG a Firestore:
 * cdgCatalogo/propios = { json, ejercicios, subidoAt }  (ver src/utils/cdg/propios.ts).
 *
 * Origen: scripts/cdg/propios-cdg.json (lo genera scripts/cdg/propuestaPropios.py;
 * ninguno de los dos va al repo). Comprueba que usa los mismos músculos y
 * articulaciones que scripts/cdg/catalogo-cdg.json y que ningún nombre se repite.
 * El documento del Excel (cdgCatalogo/v4) no se toca.
 *
 * POR DEFECTO ES UN SIMULACRO. Hace falta --aplicar para escribir.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/subirPropiosCdg.mjs [--aplicar]
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb } from './_lib/firestoreDb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APLICAR = process.argv.includes('--aplicar')
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }

const catalogo = JSON.parse(readFileSync(resolve(__dirname, 'cdg/catalogo-cdg.json'), 'utf8'))
const propios = JSON.parse(readFileSync(resolve(__dirname, 'cdg/propios-cdg.json'), 'utf8'))
const fallo = (m) => { console.error(`Error: ${m}. No se ha escrito nada.`); process.exit(1) }

if (JSON.stringify(propios.muscles) !== JSON.stringify(catalogo.muscles)) fallo('los músculos no coinciden con el catálogo')
if (JSON.stringify(propios.joints) !== JSON.stringify(catalogo.joints)) fallo('las articulaciones no coinciden con el catálogo')
const nombres = new Set(catalogo.exercises.map(e => e.exercise))
for (const e of propios.exercises) {
  if (nombres.has(e.exercise)) fallo(`nombre repetido: ${e.exercise}`)
  if (e.m.length !== catalogo.muscles.length || e.j.length !== catalogo.joints.length) fallo(`valores incompletos en ${e.exercise}`)
  nombres.add(e.exercise)
}

const json = JSON.stringify(propios)
const ejercicios = propios.exercises.length
const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))
const ref = db.collection('cdgCatalogo').doc('propios')
const previo = await ref.get()

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'}`)
console.log(`  cdgCatalogo/propios: ${ejercicios} ejercicios, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB · ${previo.exists ? `EXISTE (${previo.data().ejercicios}) y se reemplazaría` : 'no existe, se crearía'}`)
if (!APLICAR) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(0) }

await ref.set({ json, ejercicios, subidoAt: new Date().toISOString() })
console.log('Subido.')
process.exit(0)
