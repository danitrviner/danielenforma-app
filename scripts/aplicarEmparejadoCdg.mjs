/**
 * Escribe `cdgNombre` en `exercises` a partir de scripts/out/emparejamiento-cdg.json
 * (generado por scripts/emparejarCdg.mjs) y, opcionalmente, de las revisiones
 * hechas en la pantalla «Emparejado CDG» (botón «Exportar revisiones»).
 *
 * POR DEFECTO ES UN SIMULACRO: enseña qué escribiría y no toca nada.
 * Hace falta --aplicar para escribir de verdad.
 *
 * Qué se aplica:
 *   - exactos (nombre idéntico al CDG sin la parte de músculos)             siempre
 *   - probables por id original (el slug del id coincide con UN nombre CDG)  con --incluir-probables
 *   - revisiones de la pantalla (confirmadas / cambiadas / sin equivalente)  con --revisiones fichero.json
 * Las revisiones mandan sobre lo automático. Cada nombre se comprueba contra el
 * catálogo CDG: si no existe, no se escribe. Nunca pisa un `cdgNombre` ya
 * distinto salvo con --sobrescribir.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS="$HOME/Desktop/CLave FIREBASE.json" node scripts/aplicarEmparejadoCdg.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=… node scripts/aplicarEmparejadoCdg.mjs --incluir-probables --revisiones ~/Downloads/revisiones-cdg.json
 *   … añadiendo --aplicar para escribir.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { abrirDb, marcarCatalogoCambiado } from './_lib/firestoreDb.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const INCLUIR_PROBABLES = args.includes('--incluir-probables')
const SOBRESCRIBIR = args.includes('--sobrescribir')
const valorDe = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const rutaRevisiones = valorDe('--revisiones')
const rutaCatalogo = resolve(valorDe('--catalogo') ?? resolve(__dirname, 'cdg/catalogo-cdg.json'))
const rutaEmparejamiento = resolve(valorDe('--emparejamiento') ?? resolve(__dirname, 'out/emparejamiento-cdg.json'))
const BATCH_SIZE = 400

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!SA_PATH) { console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.'); process.exit(1) }

const nombresCdg = new Set(JSON.parse(readFileSync(rutaCatalogo, 'utf8')).exercises.map(e => e.exercise))
const emparejamiento = JSON.parse(readFileSync(rutaEmparejamiento, 'utf8'))
const revisiones = rutaRevisiones ? JSON.parse(readFileSync(resolve(rutaRevisiones), 'utf8')) : {}

// id → { cdgNombre } | { cdgSinEquivalente: true }, con el motivo para el resumen.
const decisiones = new Map()
for (const f of emparejamiento) {
  if (f.estado === 'exacto' && f.cdgNombre) decisiones.set(f.id, { campos: { cdgNombre: f.cdgNombre }, origen: 'exacto' })
  else if (INCLUIR_PROBABLES && f.estado === 'probable' && f.propuesto) decisiones.set(f.id, { campos: { cdgNombre: f.propuesto }, origen: 'probable (id original)' })
}
for (const [id, r] of Object.entries(revisiones)) {
  if (r === null || r === '__sin_equivalente__') decisiones.set(id, { campos: { cdgSinEquivalente: true }, origen: 'revisión: sin equivalente' })
  else decisiones.set(id, { campos: { cdgNombre: r }, origen: 'revisión' })
}

const db = abrirDb(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8')))
const snap = await db.collection('exercises').get()
const existentes = new Map(snap.docs.map(d => [d.id, d.data()]))

const aEscribir = []
const omitidos = { sinDoc: [], nombreInvalido: [], yaIgual: 0, conflicto: [] }
for (const [id, { campos, origen }] of decisiones) {
  const doc = existentes.get(id)
  if (!doc) { omitidos.sinDoc.push(id); continue }
  if (campos.cdgNombre !== undefined) {
    if (!nombresCdg.has(campos.cdgNombre)) { omitidos.nombreInvalido.push(`${id} → ${campos.cdgNombre}`); continue }
    if (doc.cdgNombre === campos.cdgNombre) { omitidos.yaIgual++; continue }
    if (doc.cdgNombre && !SOBRESCRIBIR && origen !== 'revisión') { omitidos.conflicto.push(`${id}: tiene «${doc.cdgNombre}», propuesto «${campos.cdgNombre}»`); continue }
  } else if (doc.cdgSinEquivalente === true) { omitidos.yaIgual++; continue }
  aEscribir.push({ id, nombre: doc.name, campos, origen })
}

const porOrigen = aEscribir.reduce((a, x) => ({ ...a, [x.origen]: (a[x.origen] ?? 0) + 1 }), {})
console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO (no se escribe nada)'} · ${aEscribir.length} ejercicios a actualizar`)
console.log(porOrigen)
console.log(`ya estaban igual: ${omitidos.yaIgual} · sin documento: ${omitidos.sinDoc.length} · nombre CDG inexistente: ${omitidos.nombreInvalido.length} · en conflicto: ${omitidos.conflicto.length}`)
for (const l of omitidos.nombreInvalido) console.log('  ✘ nombre inexistente:', l)
for (const l of omitidos.conflicto) console.log('  ! conflicto (no se pisa):', l)
for (const l of omitidos.sinDoc) console.log('  ? sin documento en exercises:', l)
for (const x of aEscribir.slice(0, 15)) console.log(`  ${x.id.slice(0, 48).padEnd(48)} ${JSON.stringify(x.campos).slice(0, 90)}  [${x.origen}]`)
if (aEscribir.length > 15) console.log(`  … y ${aEscribir.length - 15} más`)

if (!APLICAR) { console.log('\nSimulacro terminado. Añade --aplicar para escribir.'); process.exit(0) }

for (let i = 0; i < aEscribir.length; i += BATCH_SIZE) {
  const batch = db.batch()
  for (const x of aEscribir.slice(i, i + BATCH_SIZE)) batch.update(db.collection('exercises').doc(x.id), x.campos)
  await batch.commit()
  console.log(`  escritos ${Math.min(i + BATCH_SIZE, aEscribir.length)}/${aEscribir.length}`)
}
if (aEscribir.length > 0) await marcarCatalogoCambiado(db, 'exercises')
console.log('Hecho.')
process.exit(0)
