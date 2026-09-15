/* Limpia los perfiles duplicados por email de `user_profiles`.
 *
 * Por qué existe: hasta 09-2026 esto lo hacía `getAllUserProfiles()` (src/db/profiles.ts)
 * en CADA lectura — y esa lectura la hacen la parrilla de clientes, la paleta de
 * comandos y casi todas las herramientas del asistente. O sea: abrir una pantalla
 * borraba documentos en producción, sin registro y sin que nadie lo viera. Una
 * lectura no escribe nunca. El descarte de duplicados sigue estando ahí (la lista
 * que devuelve trae uno por email), pero el BORRADO vive aquí, se ejecuta a
 * propósito y enseña lo que va a hacer antes de hacerlo.
 *
 * Qué borra: solo perfiles que TIENEN email y han perdido contra otro con el mismo
 * email. El criterio del ganador es el mismo que el de la app (`deduplicateByEmail`):
 * se prefiere un UID real de Firebase sobre uno de los `mock_*`/`user_*` de prueba.
 *
 * Qué NO borra:
 *  · Documentos sin email. Quedan fuera de la lista de la app igual, pero guardan
 *    datos (pesos, fechas de plan) y borrarlos de refilón los destruiría. Se
 *    limpian a mano, uno a uno, como en `limpiarPerfilHuerfano.mjs`.
 *  · Perdedores referenciados desde otra colección. Si algo apunta a ese UID,
 *    borrarlo dejaría datos huérfanos: se avisa y se salta.
 *
 * Uso:
 *   node scripts/limpiarPerfilesDuplicados.mjs             ← ensayo, no toca nada
 *   node scripts/limpiarPerfilesDuplicados.mjs --aplicar   ← borra de verdad
 */
import { readFileSync, writeFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
const APLICAR = process.argv.includes('--aplicar');

/** Mismo criterio que `isDefaultUserId` en src/db/profiles.ts. */
function esUidDePrueba(uid) {
  return typeof uid === 'string' && (uid.startsWith('mock_') || uid.startsWith('user_'));
}

const snap = await db.collection('user_profiles').get();
const perfiles = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
console.log(`${perfiles.length} documentos en user_profiles.`);

// ── Agrupar por email ───────────────────────────────────────────────────────
const sinEmail = perfiles.filter(p => typeof p.email !== 'string' || p.email.length === 0);
const porEmail = new Map();
for (const p of perfiles) {
  if (typeof p.email !== 'string' || p.email.length === 0) continue;
  const clave = p.email.toLowerCase();
  if (!porEmail.has(clave)) porEmail.set(clave, []);
  porEmail.get(clave).push(p);
}

const grupos = [...porEmail.entries()].filter(([, lista]) => lista.length > 1);
if (sinEmail.length > 0) {
  console.log(`\n${sinEmail.length} documento(s) SIN email — no se tocan aquí:`);
  sinEmail.forEach(p => console.log(`  · ${p.uid}`));
}
if (grupos.length === 0) {
  console.log('\nNo hay duplicados por email. Nada que hacer.');
  process.exit(0);
}

// ── Decidir ganador y perdedores, con el mismo criterio que la app ──────────
const aBorrar = [];
console.log(`\n${grupos.length} email(s) con más de un documento:`);
for (const [email, lista] of grupos) {
  let ganador = lista[0];
  for (const p of lista.slice(1)) {
    if (esUidDePrueba(ganador.uid) && !esUidDePrueba(p.uid)) ganador = p;
  }
  const perdedores = lista.filter(p => p.uid !== ganador.uid);
  console.log(`\n  ${email}`);
  console.log(`    se queda: ${ganador.uid}${esUidDePrueba(ganador.uid) ? ' (uid de prueba)' : ''}`);
  for (const p of perdedores) console.log(`    se iría:  ${p.uid}`);
  aBorrar.push(...perdedores);
}

// ── Nadie debe apuntar a un perdedor desde otra colección ───────────────────
const uids = new Set(aBorrar.map(p => p.uid));
const referenciados = new Map();
for (const col of await db.listCollections()) {
  for (const d of (await col.get()).docs) {
    const texto = JSON.stringify(d.data());
    for (const uid of uids) {
      if (col.id === 'user_profiles' && d.id === uid) continue;
      if (d.id === uid || texto.includes(uid)) {
        if (!referenciados.has(uid)) referenciados.set(uid, []);
        referenciados.get(uid).push(`${col.id}/${d.id}`);
      }
    }
  }
}

const seguros = aBorrar.filter(p => !referenciados.has(p.uid));
if (referenciados.size > 0) {
  console.log(`\n${referenciados.size} perdedor(es) están referenciados desde otra colección — se SALTAN:`);
  for (const [uid, refs] of referenciados) {
    console.log(`  · ${uid} ← ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ` y ${refs.length - 5} más` : ''}`);
  }
}

if (seguros.length === 0) {
  console.log('\nNo queda ningún duplicado que se pueda borrar sin dejar datos huérfanos.');
  process.exit(0);
}

// ── Copia antes de tocar nada ───────────────────────────────────────────────
const copia = new URL(`../copia-perfiles-duplicados-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
writeFileSync(copia, JSON.stringify({ guardadoEn: new Date().toISOString(), perfiles: seguros }, null, 2));
console.log(`\nCopia de los ${seguros.length} documentos a borrar en ${copia.pathname}`);

if (!APLICAR) {
  console.log('\nEnsayo. Vuelve a llamarlo con --aplicar para borrarlos de verdad.');
  process.exit(0);
}

for (const p of seguros) {
  await db.collection('user_profiles').doc(p.uid).delete();
  console.log(`  borrado user_profiles/${p.uid}`);
}
console.log(`\n${seguros.length} duplicado(s) borrado(s).`);
