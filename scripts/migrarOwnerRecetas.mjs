/**
 * Migra `ownerId` del recetario importado: 'indya' → 'recetas'.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarOwnerRecetas.mjs
 *   ... --dry-run    solo cuenta, no escribe
 *
 * POR QUÉ EXISTE. `ownerId` no es un identificador de código, es un valor
 * guardado en los ~8.850 documentos de `recipes` que distingue el recetario
 * importado de las recetas que escribe un coach o un atleta (esas llevan su UID).
 * Al quitar el nombre antiguo del código hubo que decidir qué hacer con el dato,
 * y la respuesta fue migrarlo en vez de dejar el nombre enterrado en la base.
 *
 * SEGURO DE REPETIR. Solo toca documentos cuyo `ownerId` sigue siendo el valor
 * antiguo, así que relanzarlo tras un corte continúa donde se quedó y volver a
 * lanzarlo cuando ya está hecho no escribe nada. Va por lotes de 400 (el límite
 * de un batch de Firestore es 500) y pagina con `startAfter`, así que no se carga
 * la colección entera en memoria.
 *
 * MIENTRAS CORRE NO SE CAE NADA: `db/recipes.ts` lee con
 * `where('ownerId','in',[nuevo, viejo])`, así que los documentos ya migrados y
 * los que quedan se ven igual. Cuando esto termine y se confirme el recuento a 0,
 * se puede borrar `OWNER_RECETARIO_LEGACY` de ese fichero y volver al `==`.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VIEJO = 'indya';
const NUEVO = 'recetas';
const LOTE = 400;
const SECO = process.argv.includes('--dry-run');

const firebaseConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../firebase-applet-config.json'), 'utf8'),
);

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!SA_PATH) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS con la ruta al serviceAccount.json.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function main() {
  console.log(SECO ? '— Ensayo, no se escribe nada —' : '— Migrando —');

  let ultimo = null;
  let vistos = 0;
  let migrados = 0;

  for (;;) {
    let q = db.collection('recipes').where('ownerId', '==', VIEJO).limit(LOTE);
    if (ultimo) q = q.startAfter(ultimo);

    const snap = await q.get();
    if (snap.empty) break;

    vistos += snap.size;
    ultimo = snap.docs[snap.docs.length - 1];

    if (!SECO) {
      const batch = db.batch();
      for (const d of snap.docs) batch.update(d.ref, { ownerId: NUEVO });
      await batch.commit();
      migrados += snap.size;
      // Con el valor ya cambiado, la misma consulta deja de verlos: el cursor se
      // reinicia para no paginar sobre un resultado que se vacía por detrás.
      ultimo = null;
    }

    console.log(`  ${SECO ? 'contados' : 'migrados'}: ${SECO ? vistos : migrados}`);
    if (SECO && snap.size < LOTE) break;
  }

  console.log(
    SECO
      ? `\nQuedan ${vistos} documentos con ownerId='${VIEJO}'.`
      : `\nHecho: ${migrados} documentos pasados a ownerId='${NUEVO}'.`,
  );
  console.log('Comprueba con --dry-run que el recuento queda en 0.');
}

main().catch(err => {
  console.error('\nLa migración se ha detenido:', err);
  console.error('Es seguro relanzarla: solo toca lo que sigue con el valor antiguo.');
  process.exit(1);
});
