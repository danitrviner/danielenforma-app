import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const firebaseConfig = JSON.parse(readFileSync(resolve(root, 'firebase-applet-config.json'), 'utf8'));
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(root, 'serviceAccount.json');
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const id = process.argv[2] || 'dvL7PqeJGL57CsSz8OrD';
const snap = await db.collection('mesocycles').doc(id).get();
console.log('exists:', snap.exists);
const d = snap.data() ?? {};
console.log(JSON.stringify({
  number: d.number, startDate: d.startDate, weeks: d.weeks,
  daysPerWeek: d.daysPerWeek, cycleDays: d.cycleDays, splitId: d.splitId,
  customOffsets: d.customOffsets,
  distribution: d.distribution ? { generatedAt: d.distribution.generatedAt, days: (d.distribution.days||[]).map(x=>({offset:x.offset, dayOffset:x.dayOffset, assignments:(x.assignments||[]).length})) } : undefined,
  keys: Object.keys(d),
}, null, 2));
process.exit(0);
