/**
 * SOLO LECTURA. Exporta la colección `exercises` a scripts/out/ejercicios-app-actual.json
 * para emparejarla con el catálogo CDG (scripts/emparejarCdg.mjs).
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/exportarEjerciciosCdg.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb } from './_lib/firestoreDb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }
const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))

const snap = await db.collection('exercises').get()
const lista = snap.docs.map(d => {
  const x = d.data()
  return { id: d.id, name: x.name, ownerId: x.ownerId ?? null, cdgNombre: x.cdgNombre ?? null }
})
mkdirSync(resolve(__dirname, 'out'), { recursive: true })
const destino = resolve(__dirname, 'out/ejercicios-app-actual.json')
writeFileSync(destino, JSON.stringify(lista, null, 2))
console.log(`${lista.length} ejercicios → ${destino}`)
process.exit(0)
