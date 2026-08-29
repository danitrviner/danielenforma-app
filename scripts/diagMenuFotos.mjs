/**
 * Solo lectura: revisa las fotos de las comidas del menú semanal de un atleta.
 *   node scripts/diagMenuFotos.mjs danielbriz8@gmail.com
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
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const email = process.argv[2] || 'danielbriz8@gmail.com';
const snap = await db.collection('weeklyMenus').where('athleteId', '==', email).get();
console.log(`weeklyMenus de ${email}: ${snap.size}`);
for (const doc of snap.docs) {
  const d = doc.data();
  const meals = (d.days || []).flatMap(day => day.meals || []);
  const conFoto = meals.filter(m => m.recipeImage);
  const hosts = {};
  for (const m of conFoto) { const h = (m.recipeImage.split('/')[2]) || '?'; hosts[h] = (hosts[h]||0)+1; }
  console.log(`\n  menu ${doc.id}  status=${d.status}  publishedAt=${d.publishedAt ?? '-'}  generatedAt=${d.generatedAt ?? '-'}`);
  console.log(`  comidas: ${meals.length} | con recipeImage: ${conFoto.length} | sin: ${meals.length - conFoto.length}`);
  console.log(`  hosts:`, hosts);
  for (const m of meals.slice(0, 4)) console.log(`    - ${m.recipeName?.slice(0,40)}  img=${m.recipeImage ? m.recipeImage.slice(0,70) : '(vacío)'}`);
}
process.exit(0);
