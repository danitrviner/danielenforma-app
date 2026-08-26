/**
 * Limpieza puntual (2026-08-21): borra los 3 check-ins duplicados de la
 * cuenta de QA (danitrviner@gmail.com), consecuencia del bug de
 * seedInitialCheckinsIfEmpty ya corregido en src/db/profiles.ts (usaba
 * addDoc con id aleatorio en vez de setDoc con id estable, así que dos
 * llamadas casi simultáneas duplicaban los 3 check-ins de siembra).
 *
 * Verifica cada par por peso+mood+adherence+diferencia de timestamp < 1s
 * antes de borrar el más nuevo de cada pareja.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/limpiarCheckinsDuplicados.mjs
 */
import { readFileSync } from 'fs';
import { abrirDb } from './_lib/firestoreDb.mjs';

const cfg = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const db = abrirDb(sa);

async function main() {
  const snap = await db.collection('checkins')
    .where('email', '==', 'danitrviner@gmail.com').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const seen = new Map(); // key = weight|mood|adherence -> doc más antiguo conservado
  const toDelete = [];
  for (const d of docs.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis())) {
    const key = `${d.weight}|${d.mood}|${d.adherence}`;
    if (seen.has(key)) {
      const original = seen.get(key);
      const deltaMs = d.timestamp.toMillis() - original.timestamp.toMillis();
      if (deltaMs > 1000) { console.error('ABORTADO, no parece un duplicado:', d.id, deltaMs, 'ms'); process.exit(1); }
      toDelete.push(d.id);
    } else {
      seen.set(key, d);
    }
  }

  if (toDelete.length === 0) { console.log('No hay duplicados que borrar.'); return; }

  const batch = db.batch();
  toDelete.forEach(id => batch.delete(db.collection('checkins').doc(id)));
  await batch.commit();
  console.log('Borrados', toDelete.length, 'check-ins duplicados:', toDelete.join(', '));
}

main().catch(err => { console.error('Fallo:', err); process.exit(1); });
