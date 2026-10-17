/**
 * Sube el catálogo CDG a Firestore: cdgCatalogo/v4 = { json, ejercicios, subidoAt }.
 * Lectura SOLO para el coach (firestore.rules → match /cdgCatalogo). Hay que
 * desplegar esas reglas ANTES de que la app intente leerlo.
 *
 * POR DEFECTO ES UN SIMULACRO. Hace falta --aplicar para escribir.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/subirCatalogoCdg.mjs
 *   … añadiendo --aplicar para escribir.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb } from './_lib/firestoreDb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APLICAR = process.argv.includes('--aplicar')
const rutaCatalogo = resolve(__dirname, 'cdg/catalogo-cdg.json')
const LIMITE_BYTES = 900 * 1024 // un documento admite 1 MiB; margen para el resto de campos

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }

const json = readFileSync(rutaCatalogo, 'utf8')
const compacto = JSON.parse(json)
const ejercicios = compacto.exercises.length
const bytes = Buffer.byteLength(json, 'utf8')
if (ejercicios !== 1034) { console.error(`Error: se esperaban 1.034 ejercicios y hay ${ejercicios}.`); process.exit(1) }
if (bytes > LIMITE_BYTES) {
  console.error(`Error: el catálogo pesa ${bytes} bytes (> ${LIMITE_BYTES}). Hay que partirlo en varios documentos; no se ha escrito nada.`)
  process.exit(1)
}

const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))
const ref = db.collection('cdgCatalogo').doc('v4')
const previo = await ref.get()

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'}`)
console.log(`  cdgCatalogo/v4: ${ejercicios} ejercicios, ${(bytes / 1024).toFixed(0)} KB · ${previo.exists ? 'EXISTE y se reemplazaría' : 'no existe, se crearía'}`)
if (!APLICAR) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(0) }

await ref.set({ json, ejercicios, subidoAt: new Date().toISOString() })
console.log('Subido.')
process.exit(0)
