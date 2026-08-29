/**
 * Diagnóstico de solo lectura: lista las workoutAssignments de un atleta.
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/diagAssignments.mjs danielbriz8@gmail.com
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const firebaseConfig = JSON.parse(readFileSync(resolve(root, 'firebase-applet-config.json'), 'utf8'));
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(root, 'serviceAccount.json');
const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const emailArg = process.argv[2] || 'danielbriz8@gmail.com';

const workoutsSnap = await db.collection('workouts').get();
const workoutName = new Map(workoutsSnap.docs.map(d => [d.id, d.data().name ?? '(sin nombre)']));

for (const key of ['athleteId', 'athleteEmail']) {
  const snap = await db.collection('workoutAssignments').where(key, '==', emailArg).get();
  if (snap.empty) continue;
  console.log(`\n=== workoutAssignments where ${key} == ${emailArg}  (${snap.size}) ===`);
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const r of rows) {
    const dow = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '?';
    const nm = workoutName.get(r.workoutId) ?? '??';
    console.log(`${r.date} (${dow.padEnd(9)})  "${nm}"  meso=${r.mesocycleId ?? '-'}  by=${r.createdBy ?? '-'}  at=${r.createdAt ?? '-'}  id=${r.id}`);
  }
}
process.exit(0);
