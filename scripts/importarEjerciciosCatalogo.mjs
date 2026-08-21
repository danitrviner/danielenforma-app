/**
 * Reemplaza el catálogo de ejercicios en Firestore por los 840 del Excel
 * curado a mano (tarea: reemplazo del catálogo, agosto 2026). Lee
 * scripts/out/ejercicios-catalogo.json (generado por
 * normalizarEjerciciosExcel.py) — no vuelve a leer el Excel.
 *
 * POR DEFECTO ES UN SIMULACRO: informa cuántos documentos borraría/crearía en
 * cada colección y NO escribe nada. Hace falta --aplicar para escribir de
 * verdad.
 *
 * Confirmado con Dani (no hay clientes reales en el sistema todavía): --aplicar
 * borra TODO lo que pueda referenciar el catálogo viejo — exercises,
 * exerciseNotes, mesocycles, mesocycleTemplates, workouts, workoutAssignments,
 * workoutLogs — y después escribe los 840 ejercicios nuevos con ID
 * determinista (mismo slug que ya trae el JSON), así que reimportar es
 * idempotente.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarEjerciciosCatalogo.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarEjerciciosCatalogo.mjs --aplicar
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATALOGO_PATH = resolve(__dirname, 'out/ejercicios-catalogo.json');
const BATCH_SIZE = 499;
const APLICAR = process.argv.includes('--aplicar');

// Colecciones que pueden referenciar el catálogo viejo por exerciseId. Se
// borran enteras porque no hay clientes reales todavía (confirmado con Dani).
const COLECCIONES_A_LIMPIAR = [
  'exercises', 'exerciseNotes', 'mesocycles', 'mesocycleTemplates',
  'workouts', 'workoutAssignments', 'workoutLogs',
];

const firebaseConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
);

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Error: falta GOOGLE_APPLICATION_CREDENTIALS.');
  console.error('Ejemplo: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/importarEjerciciosCatalogo.mjs');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function contarColeccion(nombre) {
  const snap = await db.collection(nombre).count().get();
  return snap.data().count;
}

async function borrarColeccion(nombre) {
  const col = db.collection(nombre);
  let total = 0;
  // Paginado: fetch+delete en tandas de BATCH_SIZE hasta vaciar la colección.
  while (true) {
    const snap = await col.limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    total += snap.size;
    process.stdout.write(`  ${nombre}: ${total} borrados…\r`);
  }
  if (total > 0) process.stdout.write('\n');
  return total;
}

async function escribirEjercicios(ejercicios) {
  const col = db.collection('exercises');
  let escritos = 0;
  for (let i = 0; i < ejercicios.length; i += BATCH_SIZE) {
    const chunk = ejercicios.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { id, ...data } of chunk) {
      batch.set(col.doc(id), data);
    }
    await batch.commit();
    escritos += chunk.length;
    process.stdout.write(`  exercises: ${escritos}/${ejercicios.length} escritos…\r`);
  }
  process.stdout.write('\n');
  return escritos;
}

async function main() {
  const ejercicios = JSON.parse(readFileSync(CATALOGO_PATH, 'utf8'));

  console.log(APLICAR
    ? '⚠️  MODO ESCRITURA — se va a borrar y reemplazar el catálogo en producción.\n'
    : '🔍 SIMULACRO — no se escribe nada. Añade --aplicar para escribir.\n');

  console.log('Documentos que se borrarían (colecciones que pueden referenciar el catálogo viejo):');
  const conteos = {};
  for (const col of COLECCIONES_A_LIMPIAR) {
    conteos[col] = await contarColeccion(col);
    console.log(`  ${col}: ${conteos[col]}`);
  }
  console.log(`\nEjercicios nuevos a escribir: ${ejercicios.length}`);
  const conGrupo = ejercicios.filter(e => e.muscleGroup).length;
  const conSecundarios = ejercicios.filter(e => (e.secondaryMuscleGroups ?? []).length > 0).length;
  console.log(`  con grupo muscular principal: ${conGrupo}`);
  console.log(`  con grupo(s) secundario(s): ${conSecundarios}`);
  console.log(`  sin grupo (fullbody): ${ejercicios.length - conGrupo}`);

  if (!APLICAR) {
    console.log('\nNada escrito (simulacro). Corre con --aplicar para ejecutar de verdad.');
    return;
  }

  console.log('\nBorrando colecciones…');
  for (const col of COLECCIONES_A_LIMPIAR) {
    await borrarColeccion(col);
  }

  console.log('\nEscribiendo catálogo nuevo…');
  const escritos = await escribirEjercicios(ejercicios);

  console.log(`\nHecho. ${escritos} ejercicios escritos en 'exercises'.`);
}

main().catch(err => {
  console.error('Importación falló:', err);
  process.exit(1);
});
