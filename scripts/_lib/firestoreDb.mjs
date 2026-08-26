/* Única fuente del databaseId para los scripts.
 *
 * La app NO usa la base `(default)` del proyecto, sino una base NOMBRADA. Un
 * script que llame a `getFirestore()` sin ese id —o con un id `undefined`
 * porque leyó mal la config— no falla: lee y escribe en `(default)`, que existe
 * y está vacía. El resultado es un script que dice "0 documentos" o "importado
 * correctamente" habiendo tocado la base equivocada.
 *
 * Por eso aquí se comprueba el id y se lanza si falta, en vez de dejar que
 * `getFirestore(undefined)` haga lo suyo en silencio.
 *
 * Uso:
 *   import { abrirDb, DATABASE_ID } from './_lib/firestoreDb.mjs';
 *   const db = abrirDb(serviceAccount);
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../firebase-applet-config.json');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

export const DATABASE_ID = config.firestoreDatabaseId;

if (typeof DATABASE_ID !== 'string' || DATABASE_ID.length === 0) {
  throw new Error(
    `firebase-applet-config.json no trae "firestoreDatabaseId". Sin él, ` +
    `getFirestore() apuntaría a la base (default), que NO es la de la app: ` +
    `el script leería vacío o escribiría donde no toca sin dar ningún error.`,
  );
}

/** Inicializa firebase-admin (si hace falta) y devuelve la base NOMBRADA. */
export function abrirDb(serviceAccount) {
  if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
  return getFirestore(DATABASE_ID);
}

/**
 * Invalida la copia local de un catálogo en TODOS los dispositivos.
 *
 * La app sirve `exercises`, `foodItems`, `workouts` y compañía desde la caché
 * del dispositivo mientras el documento `catalogos/{nombre}` siga diciendo la
 * misma versión (src/db/catalogoVersionado.ts). Un script que escriba con el
 * Admin SDK no pasa por ahí, así que si no marca el sello su cambio es
 * INVISIBLE: `importarEjerciciosCatalogo.mjs --aplicar` borra y reemplaza el
 * catálogo entero, y sin esta llamada cada móvil seguiría enseñando los
 * ejercicios viejos —desde su caché, sin un solo error— hasta que el sello
 * cambiara por otra vía.
 *
 * Llamar SIEMPRE después de que la escritura haya terminado.
 */
export async function marcarCatalogoCambiado(db, nombre) {
  await db.collection('catalogos').doc(nombre).set(
    { version: new Date().toISOString() },
    { merge: true },
  );
  console.log(`Sello de versión de '${nombre}' actualizado (las apps releerán el catálogo).`);
}
