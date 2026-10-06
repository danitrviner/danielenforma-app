/**
 * Sube SOLO las recetas básicas a Firestore, sin tocar el resto del recetario.
 *
 * Dos cosas:
 *   1. Las recetas nuevas de `public/recetas/recetas_05_basicas_p01.json` se
 *      escriben enteras (batch.set por id). Los ids son UUID v5 estables, así
 *      que volver a lanzarlo sobreescribe las mismas, no duplica.
 *   2. Las del recetario original que también cuentan como básicas
 *      (`public/recetas/basicas_existentes.json`) solo reciben `basica: true`
 *      con un merge: el resto del documento no se toca.
 *
 * POR DEFECTO ES UN SIMULACRO: no necesita credenciales ni lee Firestore; solo
 * comprueba los ficheros y enseña lo que escribiría. Con --aplicar escribe.
 *
 * Usage:
 *   node scripts/importarBasicas.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarBasicas.mjs --aplicar
 *
 * Después hay que publicar la web: el índice que lista las recetas
 * (`public/recetas-indice.json`) lo regenera `npm run build` a partir de los
 * mismos JSON.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mapRecipe } from './lib/mapearReceta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECETAS_DIR = resolve(__dirname, '../public/recetas');
const APLICAR = process.argv.includes('--aplicar');

const leer = f => JSON.parse(readFileSync(resolve(RECETAS_DIR, f), 'utf8'));

const nuevas = leer('recetas_05_basicas_p01.json').recipes;
const existentes = leer('basicas_existentes.json').ids;

// ── Comprobaciones (también en simulacro) ────────────────────────────────────

const errores = [];
const idsRecetario = new Map();
for (const { archivo } of leer('00_indice.json').archivos) {
  if (archivo === 'recetas_05_basicas_p01.json') continue;
  for (const r of leer(archivo).recipes) idsRecetario.set(r.id, r.name);
}

const vistos = new Set();
for (const r of nuevas) {
  if (vistos.has(r.id)) errores.push(`id repetido entre las nuevas: ${r.id} (${r.name})`);
  vistos.add(r.id);
  if (idsRecetario.has(r.id)) errores.push(`el id de «${r.name}» ya es de «${idsRecetario.get(r.id)}»`);
  if (!r.image) errores.push(`«${r.name}» no tiene foto`);
  if (!r.macros || !r.kcal) errores.push(`«${r.name}» no tiene macros`);
  if (!r.intakeTypes?.length) errores.push(`«${r.name}» no tiene tipo de comida`);
}
for (const id of existentes) {
  if (!idsRecetario.has(id)) errores.push(`la básica existente ${id} no está en el recetario`);
}

const docs = nuevas.map(r => ({ id: r.id, data: mapRecipe(r) }));

console.log(APLICAR ? '⚠️  MODO ESCRITURA\n' : '🔍 SIMULACRO — no se escribe nada.\n');
console.log(`Recetas nuevas a escribir (set):        ${docs.length}`);
console.log(`Recetas existentes a marcar (merge):     ${existentes.length}`);
console.log(`Escrituras en total:                     ${docs.length + existentes.length}`);
const porCategoria = docs.reduce((m, d) => (m[d.data.categoria] = (m[d.data.categoria] ?? 0) + 1, m), {});
console.log(`Por categoría:`, porCategoria);
console.log(`Con foto de Unsplash / del recetario:    ${docs.filter(d => d.data.image.includes('unsplash')).length} / ${docs.filter(d => !d.data.image.includes('unsplash')).length}`);
console.log(`\nEjemplo de documento (${docs[0].id}):`);
console.log(JSON.stringify(docs[0].data, null, 1).slice(0, 1500));
console.log(`\nExistentes que se marcan como básica:`);
for (const id of existentes) console.log(`   ${id}  ${idsRecetario.get(id) ?? '¿?'}`);

if (errores.length) {
  console.error(`\n❌ ${errores.length} problema(s):`);
  for (const e of errores) console.error('   ' + e);
  process.exit(1);
}
console.log('\n✔ Sin problemas en los ficheros.');

if (!APLICAR) {
  console.log('🔍 Simulacro terminado. Vuelve a lanzarlo con --aplicar para escribir.');
  process.exit(0);
}

// ── Escritura ────────────────────────────────────────────────────────────────

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS para escribir.');
  process.exit(1);
}
const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const firebaseConfig = JSON.parse(readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'));
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const col = db.collection('recipes');

// Un merge sobre un id que no existe CREARÍA un documento solo con `basica`;
// se comprueba antes que estén todos.
// (`getAll` sin argumentos lanza: con la lista vacía no hay nada que mirar.)
const snaps = existentes.length ? await db.getAll(...existentes.map(id => col.doc(id))) : [];
const ausentes = snaps.filter(s => !s.exists).map(s => s.id);
if (ausentes.length) {
  console.error(`❌ No están en Firestore: ${ausentes.join(', ')}. No se escribe nada.`);
  process.exit(1);
}

const batch = db.batch();   // 79 escrituras: cabe de sobra en un batch (máx. 500)
for (const { id, data } of docs) batch.set(col.doc(id), data);
for (const id of existentes) batch.update(col.doc(id), { basica: true });
await batch.commit();
console.log(`✍️  Escritas ${docs.length} recetas nuevas y marcadas ${existentes.length} existentes.`);
process.exit(0);
