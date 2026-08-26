/**
 * Borra los check-ins FALSOS que la app sembraba en cada cuenta nueva.
 *
 * Qué pasó: `seedInitialCheckinsIfEmpty` escribía 3 check-ins inventados en la
 * cuenta de todo atleta que estrenara la app — con pesos que nadie había
 * pesado (77,2 / 76,8 / 76,5 kg), notas en primera persona que el atleta no
 * había escrito («Me siento con muchísima fuerza. Bajé 300g.») y, lo peor,
 * feedback firmado por el coach que el coach nunca dio. El código ya no está
 * (commit a32a665), pero lo que se escribió en las cuentas sigue ahí.
 *
 * Identificación EXACTA, sin heurística: los tres documentos se escribían con
 * `setDoc` y un id determinista `seed_checkin_{1,2,3}_{userId}`. Los check-ins
 * de verdad se crean con `addDoc`, que genera ids aleatorios de Firestore — un
 * id que empiece por `seed_checkin_` no puede ser de un check-in real.
 *
 * Sobre la copia local: cada atleta tiene además estos 3 en el localStorage de
 * su móvil. No hace falta hacer nada — `getCheckIns` sobrescribe la copia local
 * con lo que devuelve Firestore, así que desaparecen solos la próxima vez que
 * el atleta abra la pantalla con conexión.
 *
 * Uso (SIMULACRO, no escribe nada — enseña qué se borraría y de quién):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/limpiarCheckinsSembrados.mjs
 *
 * Uso (BORRAR de verdad):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/limpiarCheckinsSembrados.mjs --aplicar
 */
import { readFileSync } from 'fs';
import { FieldPath } from 'firebase-admin/firestore';
import { abrirDb } from './_lib/firestoreDb.mjs';

const APLICAR = process.argv.includes('--aplicar');
const PREFIJO = 'seed_checkin_';
const TAMANO_LOTE = 500; // límite duro de Firestore por batch

const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!cred) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS. Ejemplo:');
  console.error('  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/limpiarCheckinsSembrados.mjs');
  process.exit(1);
}
const db = abrirDb(JSON.parse(readFileSync(cred, 'utf8')));

/* Huella de los tres documentos tal y como los escribía la app. Sirve solo
   para AVISAR: si alguno no encaja, se enseña aparte para que se pueda mirar
   antes de borrarlo, en vez de borrarlo callando. */
const HUELLA = {
  1: { weight: 77.2, mood: '😐', adherence: 'Parcial' },
  2: { weight: 76.8, mood: '😊', adherence: 'Sí' },
  3: { weight: 76.5, mood: '🔥', adherence: 'Sí' },
};

function encajaConLaHuella(id, datos) {
  const n = Number(id.slice(PREFIJO.length).split('_')[0]);
  const esperado = HUELLA[n];
  if (!esperado) return false;
  return datos.weight === esperado.weight
    && datos.mood === esperado.mood
    && datos.adherence === esperado.adherence;
}

async function main() {
  console.log(APLICAR
    ? '⚠️  MODO ESCRITURA — se van a borrar documentos de producción.\n'
    : '🔍 SIMULACRO — no se borra nada. Añade --aplicar para borrar de verdad.\n');

  // Consulta por rango sobre el id: trae solo los `seed_checkin_*` en vez de
  // leer la colección `checkins` entera (que es de las que más crecen).
  const snap = await db.collection('checkins')
    .orderBy(FieldPath.documentId())
    .startAt(PREFIJO)
    .endAt(PREFIJO + '\uf8ff') // cierra el prefijo: cualquier id que empiece por el
    .get();

  if (snap.empty) {
    console.log('No queda ni un check-in sembrado. Nada que hacer.');
    return;
  }

  // Agrupado por persona, que es como se entiende el alcance de verdad.
  const porCuenta = new Map();
  const raros = [];
  for (const d of snap.docs) {
    const datos = d.data();
    const cuenta = datos.email ?? datos.userId ?? '(sin identificar)';
    if (!porCuenta.has(cuenta)) porCuenta.set(cuenta, []);
    porCuenta.get(cuenta).push(d);
    if (!encajaConLaHuella(d.id, datos)) raros.push({ id: d.id, cuenta, datos });
  }

  console.log(`${snap.size} check-ins sembrados en ${porCuenta.size} cuenta(s):\n`);
  for (const [cuenta, docs] of [...porCuenta].sort()) {
    console.log(`  ${cuenta} — ${docs.length}`);
    for (const d of docs) {
      const x = d.data();
      console.log(`      ${d.id}  ${x.dateStr ?? '?'}  ${x.weight ?? '?'} kg  ${x.mood ?? ''}`);
    }
  }

  if (raros.length > 0) {
    console.log(`\n⚠️  ${raros.length} no coinciden con los valores que sembraba la app.`);
    console.log('   Siguen siendo falsos (el id solo lo generaba la siembra), pero míralos');
    console.log('   antes de correr con --aplicar por si alguien los editó:');
    for (const r of raros) {
      console.log(`      ${r.id} (${r.cuenta}): ${JSON.stringify({
        weight: r.datos.weight, mood: r.datos.mood, adherence: r.datos.adherence,
      })}`);
    }
  }

  if (!APLICAR) {
    console.log('\nNada borrado (simulacro). Corre con --aplicar para ejecutarlo de verdad.');
    return;
  }

  let borrados = 0;
  for (let i = 0; i < snap.docs.length; i += TAMANO_LOTE) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + TAMANO_LOTE)) batch.delete(d.ref);
    await batch.commit();
    borrados += Math.min(TAMANO_LOTE, snap.docs.length - i);
  }

  console.log(`\nHecho. ${borrados} check-ins falsos borrados de ${porCuenta.size} cuenta(s).`);
  console.log('Las copias locales de los móviles se corrigen solas al abrir la pantalla con conexión.');
}

main().catch(err => { console.error('Fallo:', err); process.exit(1); });
