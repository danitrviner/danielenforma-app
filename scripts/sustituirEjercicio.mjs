/**
 * Sustituye un ejercicio por otro en todo lo que lo usa y, con --borrar, borra el viejo.
 *
 * Reescribe cada valor que sea EXACTAMENTE el id viejo (no trozos de texto: así
 * «…-supino» no toca «…-supino-straps») en:
 *   mesocycles, mesocycleTemplates, workouts, workoutLogs, weeklyChallenges, exerciseNotes
 * (el 11-11 se buscó el id en TODAS las colecciones y solo salía en las cuatro primeras).
 * En workoutLogs el historial pasa al ejercicio nuevo: es el mismo gesto con otro nombre.
 *
 * POR DEFECTO ES UN SIMULACRO. Hace falta --aplicar para escribir.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" \
 *     node scripts/sustituirEjercicio.mjs --de <idViejo> --a <idNuevo> [--borrar] [--aplicar]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { abrirDb, marcarCatalogoCambiado } from './_lib/firestoreDb.mjs'

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const DE = arg('--de')
const A = arg('--a')
const BORRAR = process.argv.includes('--borrar')
const APLICAR = process.argv.includes('--aplicar')
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }
if (!DE || !A || DE === A) { console.error('Uso: --de <idViejo> --a <idNuevo> [--borrar] [--aplicar]'); process.exit(1) }

const COLECCIONES = ['mesocycles', 'mesocycleTemplates', 'workouts', 'workoutLogs', 'weeklyChallenges', 'exerciseNotes']
const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))

const viejo = await db.collection('exercises').doc(DE).get()
const nuevo = await db.collection('exercises').doc(A).get()
if (!viejo.exists) { console.error(`Error: no existe el ejercicio ${DE}`); process.exit(1) }
if (!nuevo.exists) { console.error(`Error: no existe el ejercicio ${A}`); process.exit(1) }

/** Copia con los valores === DE cambiados por A. Devuelve [copia, nº de cambios]. */
function reemplazar (v) {
  if (v === DE) return [A, 1]
  if (Array.isArray(v)) {
    let n = 0
    const out = v.map(x => { const [y, k] = reemplazar(x); n += k; return y })
    return [out, n]
  }
  if (v && typeof v === 'object' && v.constructor === Object) {
    let n = 0
    const out = {}
    for (const [k, x] of Object.entries(v)) { const [y, c] = reemplazar(x); n += c; out[k] = y }
    return [out, n]
  }
  return [v, 0] // Timestamps, números, otros textos: tal cual
}

const cambios = []
for (const col of COLECCIONES) {
  const snap = await db.collection(col).get()
  for (const d of snap.docs) {
    const datos = d.data()
    const campos = {}
    let total = 0
    for (const [k, v] of Object.entries(datos)) {
      const [y, n] = reemplazar(v)
      if (n) { campos[k] = y; total += n }
    }
    if (total) cambios.push({ col, id: d.id, campos, total, quien: datos.athleteEmail || datos.athleteId || datos.name || '' })
  }
}

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'}`)
console.log(`  «${viejo.data().name}» → «${nuevo.data().name}»`)
for (const c of cambios) console.log(`  ${c.col.padEnd(19)} ${c.id}  ${String(c.total).padStart(2)} referencia(s)  ${c.quien}`)
console.log(`  ${cambios.length} documentos · ${BORRAR ? 'después se BORRA el ejercicio viejo' : 'el ejercicio viejo se queda'}`)
if (!APLICAR) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(0) }

for (const c of cambios) await db.collection(c.col).doc(c.id).update(c.campos)
if (BORRAR) await db.collection('exercises').doc(DE).delete()
await marcarCatalogoCambiado(db, 'exercises')
console.log('Hecho.')
process.exit(0)
