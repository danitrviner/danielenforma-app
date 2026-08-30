/* Limpieza puntual (2026-08-30): borra `user_profiles/inLfw7oXvVTE6wGqtN0eDokKs1y2`.
 *
 * `sembrarAtletaDemo.mjs` tenía el UID del atleta de demo hardcodeado y se
 * desincronizó del UID real de Auth (arreglado en 24eac70). La última ejecución
 * con el valor viejo escribió los datos de la cuenta de revisión de las tiendas
 * en un `user_profiles/{uid}` que ya no era de nadie: sin `email` y sin `role`.
 *
 * Ese documento tumbaba la lista de atletas ENTERA del coach —
 * `deduplicateByEmail` hacía `p.email.toLowerCase()` sobre un `undefined` y el
 * catch de `getAllUserProfiles` devolvía el atleta de demo (arreglado en
 * 660f1b2). El arreglo de código no llega al binario que Apple está revisando,
 * porque Capacitor empaqueta `dist`; borrar el documento sí.
 *
 * Verifica el contenido antes de tocar nada y guarda una copia.
 *
 * Uso: node scripts/limpiarPerfilHuerfano.mjs [--aplicar]
 */
import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const UID = 'inLfw7oXvVTE6wGqtN0eDokKs1y2';
const APLICAR = process.argv.includes('--aplicar');

const ref = db.collection('user_profiles').doc(UID);
const snap = await ref.get();
if (!snap.exists) { console.log('Ya no existe. Nada que hacer.'); process.exit(0); }
const datos = snap.data();

// ── Comprobaciones: si alguna falla, no se borra nada ──────────────────────
const fallos = [];
if (datos.email !== undefined) fallos.push(`tiene email (${datos.email}): NO es el huérfano esperado`);
if (datos.role !== undefined) fallos.push(`tiene role (${datos.role}): NO es el huérfano esperado`);

try {
  await getAuth().getUser(UID);
  fallos.push('SÍ existe una cuenta de Auth con ese UID: es de alguien');
} catch (e) {
  if (e.code !== 'auth/user-not-found') fallos.push(`no se pudo comprobar Auth: ${e.code}`);
}

// Nadie debe apuntar a este UID en ninguna colección.
for (const col of await db.listCollections()) {
  for (const d of (await col.get()).docs) {
    if (col.id === 'user_profiles' && d.id === UID) continue;
    if (d.id === UID || JSON.stringify(d.data()).includes(UID)) {
      fallos.push(`referenciado desde ${col.id}/${d.id}`);
    }
  }
}

if (fallos.length) {
  console.error('ABORTADO, no coincide con lo esperado:');
  fallos.forEach(f => console.error('  ·', f));
  process.exit(1);
}

const copia = new URL(`../copia-perfil-huerfano-${UID}.json`, import.meta.url);
writeFileSync(copia, JSON.stringify({ uid: UID, datos, guardadoEn: new Date().toISOString() }, null, 2));
console.log('Copia guardada en', copia.pathname);
console.log('Contenido:', JSON.stringify(datos));

if (!APLICAR) { console.log('\nEnsayo. Vuelve a llamarlo con --aplicar para borrarlo de verdad.'); process.exit(0); }
await ref.delete();
console.log('\nBorrado user_profiles/' + UID);
