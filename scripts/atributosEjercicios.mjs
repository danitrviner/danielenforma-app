/**
 * E-03 · Atributos de los ejercicios (material, lateralidad, goma, guiado).
 *
 * EN SECO por defecto: lee `exercises`, calcula los atributos con
 * scripts/_lib/atributosEjercicio.mjs, escribe un informe y NO toca Firestore.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" \
 *     node scripts/atributosEjercicios.mjs [informe.json]
 *
 * `--aplicar` escribe, y solo rellena lo que está vacío: nunca pisa un
 * `equipment` que el coach ya haya puesto ni un atributo ya definido. Se
 * ejecuta tras revisar el informe en seco.
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { abrirDb } from './_lib/firestoreDb.mjs'
import { atributosDeEjercicio } from './_lib/atributosEjercicio.mjs'

const aplicar = process.argv.includes('--aplicar')
const salida = process.argv.slice(2).find(a => !a.startsWith('--')) ?? resolve('scripts/out/atributos-ejercicios.json')
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }
const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))

const snap = await db.collection('exercises').get()
const filas = snap.docs.map(d => {
  const x = d.data()
  const propuesta = atributosDeEjercicio(x.name)
  const cambios = {}
  if (!(x.equipment?.length) && propuesta.equipment.length) cambios.equipment = propuesta.equipment
  if (x.lateralidad === undefined) cambios.lateralidad = propuesta.lateralidad
  if (x.goma === undefined) cambios.goma = propuesta.goma
  if (x.guiado === undefined) cambios.guiado = propuesta.guiado
  return { id: d.id, name: x.name, equipmentActual: x.equipment ?? [], propuesta, cambios }
})

const total = filas.length
const conMaterial = filas.filter(f => (f.equipmentActual.length || f.propuesta.equipment.length) > 0).length
const sinMaterial = filas.filter(f => !f.equipmentActual.length && !f.propuesta.equipment.length)
const porMaterial = {}
for (const f of filas) for (const m of (f.equipmentActual.length ? f.equipmentActual : f.propuesta.equipment)) porMaterial[m] = (porMaterial[m] ?? 0) + 1
const resumen = {
  total,
  coberturaMaterial: `${conMaterial}/${total} (${Math.round(1000 * conMaterial / total) / 10} %)`,
  porMaterial,
  unilaterales: filas.filter(f => f.propuesta.lateralidad === 'uni').length,
  conGoma: filas.filter(f => f.propuesta.goma).length,
  guiados: filas.filter(f => f.propuesta.guiado).length,
  sinMaterial: sinMaterial.map(f => f.name),
}
writeFileSync(salida, JSON.stringify({ resumen, filas }, null, 2))
console.log(JSON.stringify({ ...resumen, sinMaterial: `${sinMaterial.length} (ver informe)` }, null, 2))
console.log(`Informe: ${salida}`)

if (!aplicar) { console.log('EN SECO: no se ha escrito nada. Usa --aplicar para escribir.'); process.exit(0) }

let escritos = 0
for (let i = 0; i < filas.length; i += 400) {
  const lote = db.batch()
  for (const f of filas.slice(i, i + 400)) {
    if (Object.keys(f.cambios).length === 0) continue
    lote.update(db.collection('exercises').doc(f.id), f.cambios)
    escritos++
  }
  await lote.commit()
}
console.log(`Escritos ${escritos} ejercicios.`)
process.exit(0)
