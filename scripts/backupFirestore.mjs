/* Volcado completo de la base NOMBRADA a ficheros JSON locales.
 *
 * Es la copia "en mano" que se hace JUSTO ANTES de cualquier script que escriba
 * en producción, para poder deshacer sin depender de la copia programada de la
 * noche. La copia automática diaria vive en Google (ver docs/copias.md); esta es
 * la de urgencia.
 *
 * COSTE: una lectura por documento. Medido el 15-09-2026: 11.898 documentos en
 * total, de los cuales 8.500 son el recetario, que no cambia nunca. El tope de
 * este proyecto son 50.000 lecturas al día y al superarlo la base se PAUSA en
 * vez de cobrar (ver scripts/diagCuota.mjs), así que un volcado completo cabe
 * con holgura pero NO conviene repetirlo muchas veces el mismo día. Para eso
 * está `--sin-catalogos`, que salta lo que no cambia y baja el coste a ~3.400.
 *
 * Uso:
 *   node scripts/backupFirestore.mjs                    → todo
 *   node scripts/backupFirestore.mjs --sin-catalogos    → solo lo que cambia
 *   node scripts/backupFirestore.mjs --destino ~/copias
 *
 * Restaurar: node scripts/restaurarFirestore.mjs <carpeta>
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { abrirDb, DATABASE_ID } from './_lib/firestoreDb.mjs';
import { aJson } from './_lib/codecFirestore.mjs';

/* Catálogos: se siembran desde scripts y no los edita nadie en el día a día.
 * Saltarlos abarata el volcado en un 70 % sin perder nada recuperable —
 * `importRecetas.mjs` y compañía los vuelven a generar. */
const CATALOGOS = ['recipes', 'exercises', 'foodItems', 'knowledgeBase', 'maquinas'];

const args = process.argv.slice(2);
const sinCatalogos = args.includes('--sin-catalogos');
const iDestino = args.indexOf('--destino');
const raizDestino = iDestino >= 0 && args[iDestino + 1]
  ? resolve(args[iDestino + 1].replace(/^~/, homedir()))
  : resolve(homedir(), 'copias-enforma');

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);

// Sello de la copia: fecha y hora en el nombre de la carpeta, para que convivan
// varias del mismo día sin pisarse.
const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const destino = resolve(raizDestino, sello);
mkdirSync(destino, { recursive: true });

console.log(`Base:    ${DATABASE_ID}`);
console.log(`Destino: ${destino}`);
if (sinCatalogos) console.log(`Saltando catálogos: ${CATALOGOS.join(', ')}`);
console.log('');

const colecciones = await db.listCollections();
let totalDocs = 0;
let totalSubcolecciones = 0;
const resumen = [];

for (const col of colecciones) {
  if (sinCatalogos && CATALOGOS.includes(col.id)) continue;

  const snap = await col.get();
  const docs = [];

  /* Subcolecciones. Ninguna colección de la app las usa hoy (comprobado el
   * 15-09-2026), y preguntar documento a documento son 11.898 llamadas de red:
   * minutos de espera en cada copia para no encontrar nada. Se sondean los 3
   * primeros y, si aparece alguna, se recorre la colección ENTERA. Una copia
   * que ignorase datos en silencio sería peor que no tenerla, pero una que
   * tarda diez minutos es una copia que nadie hace. */
  const muestra = snap.docs.slice(0, 3);
  let tieneSubs = false;
  for (const doc of muestra) {
    if ((await doc.ref.listCollections()).length > 0) { tieneSubs = true; break; }
  }

  for (const doc of snap.docs) {
    let fila;
    try {
      fila = { id: doc.id, data: aJson(doc.data()) };
    } catch (err) {
      throw new Error(`${col.id}/${doc.id}: ${err.message}`);
    }

    if (tieneSubs) {
      const subs = await doc.ref.listCollections();
      if (subs.length > 0) {
        fila.subcolecciones = {};
        for (const sub of subs) {
          const subSnap = await sub.get();
          fila.subcolecciones[sub.id] = subSnap.docs.map(d => ({ id: d.id, data: aJson(d.data()) }));
          totalSubcolecciones += subSnap.size;
        }
      }
    }

    docs.push(fila);
  }
  if (tieneSubs) console.log(`  ⚠️  ${col.id} tiene subcolecciones — copiadas también.`);

  // Un fichero por colección: restaurar una sola es lo normal (te has cargado
  // los servicios del CRM, no la base entera).
  writeFileSync(resolve(destino, `${col.id}.json`), JSON.stringify(docs, null, 2));
  totalDocs += docs.length;
  resumen.push({ coleccion: col.id, n: docs.length });
  process.stdout.write(`  ${col.id} (${docs.length})\n`);
}

// Manifiesto: qué se copió, cuándo y de dónde. `restaurarFirestore.mjs` lo lee
// para negarse a restaurar una copia de otra base.
writeFileSync(resolve(destino, '_manifiesto.json'), JSON.stringify({
  databaseId: DATABASE_ID,
  fecha: new Date().toISOString(),
  sinCatalogos,
  totalDocumentos: totalDocs,
  totalSubcolecciones,
  colecciones: resumen,
}, null, 2));

console.log(`\n${totalDocs} documentos copiados${totalSubcolecciones ? ` (+${totalSubcolecciones} en subcolecciones)` : ''}.`);
console.log(`Lecturas gastadas: ~${totalDocs}. Tope diario: 50.000.`);
console.log(`\nRestaurar:  node scripts/restaurarFirestore.mjs ${destino}`);
