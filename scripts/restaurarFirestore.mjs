/* Restaura una copia hecha con backupFirestore.mjs.
 *
 * Una copia que no se ha restaurado nunca no es una copia: es un directorio con
 * ficheros. Este script existe para que el día malo no haya que improvisar, y
 * para poder ENSAYAR la restauración sin riesgo.
 *
 * Por defecto NO escribe nada: enseña qué haría. Para escribir de verdad hay
 * que pasar `--aplicar` Y escribir el nombre de la base a mano, porque una
 * restauración pisa datos vivos y una tecla de más no puede bastar.
 *
 * Uso:
 *   node scripts/restaurarFirestore.mjs <carpeta>                        → simulacro
 *   node scripts/restaurarFirestore.mjs <carpeta> --coleccion crmServicios
 *   node scripts/restaurarFirestore.mjs <carpeta> --doc crmServicios/abc123
 *   node scripts/restaurarFirestore.mjs <carpeta> --aplicar --confirmar-base <id>
 *
 * Restaurar SUMA, no sustituye: escribe los documentos de la copia encima de lo
 * que haya y deja intacto lo que se creó después. Es lo que quieres cuando has
 * borrado algo; si lo que quieres es volver a un estado exacto, hay que borrar
 * antes a mano, y este script no lo hace por ti a propósito.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { homedir } from 'os';
import { abrirDb, DATABASE_ID } from './_lib/firestoreDb.mjs';
import { deJson } from './_lib/codecFirestore.mjs';

const args = process.argv.slice(2);
const carpeta = args[0] && !args[0].startsWith('--')
  ? resolve(args[0].replace(/^~/, homedir()))
  : null;

if (!carpeta) {
  console.error('Falta la carpeta de la copia.\n');
  console.error('  node scripts/restaurarFirestore.mjs ~/copias-enforma/2026-09-15-12-00-00');
  process.exit(1);
}
if (!existsSync(carpeta)) {
  console.error(`No existe: ${carpeta}`);
  process.exit(1);
}

const aplicar = args.includes('--aplicar');
const valorDe = (bandera) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : null;
};
const soloColeccion = valorDe('--coleccion');
const soloDoc = valorDe('--doc');          // formato coleccion/idDoc
const baseConfirmada = valorDe('--confirmar-base');

// ── El manifiesto es lo que impide restaurar la copia de otra base ──────────
const rutaManifiesto = resolve(carpeta, '_manifiesto.json');
if (!existsSync(rutaManifiesto)) {
  console.error(`${carpeta} no tiene _manifiesto.json: no parece una copia de backupFirestore.mjs.`);
  process.exit(1);
}
const manifiesto = JSON.parse(readFileSync(rutaManifiesto, 'utf8'));

if (manifiesto.databaseId !== DATABASE_ID) {
  console.error(`Esta copia es de la base ${manifiesto.databaseId}, y estás apuntando a ${DATABASE_ID}.`);
  console.error('Restaurar una base sobre otra mezcla datos de dos sitios. Cancelado.');
  process.exit(1);
}

console.log(`Copia:    ${basename(carpeta)}  (${manifiesto.fecha})`);
console.log(`Base:     ${DATABASE_ID}`);
console.log(`Modo:     ${aplicar ? 'APLICAR — se va a escribir' : 'simulacro (no escribe nada)'}`);
if (manifiesto.sinCatalogos) console.log(`Aviso:    esta copia se hizo con --sin-catalogos (no trae recetas ni ejercicios).`);
console.log('');

if (aplicar && baseConfirmada !== DATABASE_ID) {
  console.error('Para escribir de verdad hay que confirmar la base a mano:');
  console.error(`\n  node scripts/restaurarFirestore.mjs ${carpeta} --aplicar --confirmar-base ${DATABASE_ID}\n`);
  process.exit(1);
}

const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));

const ficheros = readdirSync(carpeta)
  .filter(f => f.endsWith('.json') && f !== '_manifiesto.json')
  .filter(f => !soloColeccion || f === `${soloColeccion}.json`)
  .filter(f => !soloDoc || f === `${soloDoc.split('/')[0]}.json`);

if (ficheros.length === 0) {
  console.error('Nada que restaurar con esos filtros.');
  process.exit(1);
}

const idDocBuscado = soloDoc ? soloDoc.split('/').slice(1).join('/') : null;
let escritos = 0;
let subEscritos = 0;

for (const fichero of ficheros) {
  const nombreColeccion = fichero.replace(/\.json$/, '');
  let docs = JSON.parse(readFileSync(resolve(carpeta, fichero), 'utf8'));
  if (idDocBuscado) docs = docs.filter(d => d.id === idDocBuscado);
  if (docs.length === 0) continue;

  console.log(`${nombreColeccion}: ${docs.length} documento(s)`);

  if (!aplicar) {
    for (const d of docs.slice(0, 3)) console.log(`    ${d.id}`);
    if (docs.length > 3) console.log(`    … y ${docs.length - 3} más`);
    escritos += docs.length;
    continue;
  }

  // Lotes de 400 (el tope de Firestore son 500 operaciones por lote).
  for (let i = 0; i < docs.length; i += 400) {
    const lote = db.batch();
    for (const d of docs.slice(i, i + 400)) {
      lote.set(db.collection(nombreColeccion).doc(d.id), deJson(d.data, db));
    }
    await lote.commit();
  }
  escritos += docs.length;

  for (const d of docs) {
    for (const [nombreSub, filas] of Object.entries(d.subcolecciones ?? {})) {
      for (let i = 0; i < filas.length; i += 400) {
        const lote = db.batch();
        for (const s of filas.slice(i, i + 400)) {
          lote.set(db.collection(nombreColeccion).doc(d.id).collection(nombreSub).doc(s.id), deJson(s.data, db));
        }
        await lote.commit();
      }
      subEscritos += filas.length;
    }
  }
}

console.log('');
if (aplicar) {
  console.log(`${escritos} documentos restaurados${subEscritos ? ` (+${subEscritos} de subcolecciones)` : ''}.`);
  /* Los catálogos versionados se sirven desde la caché del dispositivo mientras
   * el sello no cambie (src/db/catalogoVersionado.ts). Una restauración hecha
   * con el Admin SDK no pasa por ahí: sin tocar el sello, las apps seguirían
   * enseñando lo viejo desde su copia local, sin un solo error. */
  const catalogosTocados = ficheros
    .map(f => f.replace(/\.json$/, ''))
    .filter(c => ['recipes', 'exercises', 'foodItems', 'workouts', 'crmServicios', 'crmPagos', 'crmSuscripciones', 'crmReuniones', 'crmContactos'].includes(c));
  if (catalogosTocados.length > 0) {
    console.log(`\nMarcando los catálogos restaurados para que las apps los relean:`);
    for (const c of catalogosTocados) {
      await db.collection('catalogos').doc(c).set({ version: new Date().toISOString() }, { merge: true });
      console.log(`  ${c}`);
    }
  }
} else {
  console.log(`Simulacro: se escribirían ${escritos} documentos. Nada tocado.`);
  console.log(`\nPara hacerlo de verdad:`);
  console.log(`  node scripts/restaurarFirestore.mjs ${carpeta} --aplicar --confirmar-base ${DATABASE_ID}`);
}
