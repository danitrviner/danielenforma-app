/* Devuelve a las recetas del catálogo las instrucciones que el importador tiró.
 *
 * Cada paso del recetario original es un enunciado más una lista:
 *   "Coloca en un bol y mezcla bien:" → ["El queso batido", "El cacao en polvo"]
 * y `mapRecipe` solo guardaba el enunciado (`description`). Resultado: 6.308 de
 * las 8.850 recetas muestran la preparación como frases acabadas en dos puntos
 * y nada más — 32.408 líneas perdidas.
 *
 * Esto NO reimporta nada: solo reescribe `stepsText` de las recetas afectadas,
 * leyendo los pasos del volcado original en `public/recetas/`. Todo lo demás
 * del documento se queda como está.
 *
 * Uso:
 *   node scripts/repararPasosRecetas.mjs             → simulacro, no escribe
 *   node scripts/repararPasosRecetas.mjs --aplicar   → escribe
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { abrirDb } from './_lib/firestoreDb.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const aplicar = process.argv.includes('--aplicar');
const db = abrirDb(JSON.parse(readFileSync(resolve(__dirname, '../serviceAccount.json'), 'utf8')));

const DIR = resolve(process.env.RECETAS_DIR ?? resolve(__dirname, '../public/recetas'));
const indice = JSON.parse(readFileSync(resolve(DIR, '00_indice.json'), 'utf8'));
const ficheros = (indice.archivos ?? indice.files ?? []).map(e => e.archivo ?? e.file ?? e);

const pasosPorId = new Map();
for (const f of ficheros) {
  const raw = JSON.parse(readFileSync(resolve(DIR, f), 'utf8'));
  for (const r of (raw.recipes ?? raw.recetas ?? [])) {
    const conItems = (r.steps ?? []).some(s => (s.items ?? []).length > 0);
    if (!conItems) continue;
    pasosPorId.set(r.id, (r.steps ?? []).map(s => ({
      position: s.position,
      description: s.description,
      items: (s.items ?? []).map(i => ({ position: i.position, description: i.description })),
    })));
  }
}

const lineas = [...pasosPorId.values()].reduce((n, ps) => n + ps.reduce((m, p) => m + p.items.length, 0), 0);
console.log(`recetas con instrucciones que recuperar: ${pasosPorId.size}  ·  líneas: ${lineas}`);

if (!aplicar) {
  const [id, pasos] = [...pasosPorId.entries()][0];
  console.log(`\nEjemplo (${id}):`);
  console.log(JSON.stringify(pasos[0], null, 1));
  console.log('\nSIMULACRO. Nada escrito. Repite con --aplicar.');
  process.exit(0);
}

/* En lotes: 8.850 escrituras sueltas son 8.850 viajes de ida y vuelta, y esta
   base ya se ha quedado sin cuota antes por barrer colecciones enteras. */
const TAM_LOTE = 400;
const entradas = [...pasosPorId.entries()];
let escritas = 0;
for (let i = 0; i < entradas.length; i += TAM_LOTE) {
  const lote = db.batch();
  for (const [id, pasos] of entradas.slice(i, i + TAM_LOTE)) {
    lote.update(db.doc(`recipes/${id}`), { stepsText: pasos });
  }
  await lote.commit();
  escritas += Math.min(TAM_LOTE, entradas.length - i);
  console.log(`  ${escritas}/${entradas.length}`);
}
console.log(`\nListo: ${escritas} recetas con su preparación completa.`);
