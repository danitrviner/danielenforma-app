/* Diagnóstico READ-ONLY: por qué un atleta sigue viendo "Dani está montando
 * tu plan" aunque tenga rutinas asignadas.
 *
 * Uso:
 *   node scripts/diagPlanAtleta.mjs "brisocho"
 *   node scripts/diagPlanAtleta.mjs "correo@exacto.com"
 *
 * No escribe nada.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { abrirDb } from './_lib/firestoreDb.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(resolve(__dirname, '../serviceAccount.json'), 'utf8'));
const db = abrirDb(serviceAccount);

const needle = (process.argv[2] || '').toLowerCase();
if (!needle) { console.error('Pasa un nombre o email'); process.exit(1); }

const profs = await db.collection('user_profiles').get();
const matches = profs.docs.filter(d => {
  const p = d.data();
  return [p.email, p.displayName, p.name, d.id].filter(Boolean).some(v => String(v).toLowerCase().includes(needle));
});

if (!matches.length) { console.log('Sin perfiles que casen con', needle); process.exit(0); }

for (const doc of matches) {
  const p = doc.data();
  console.log('\n════════════════════════════════════════');
  console.log('userProfiles/' + doc.id);
  console.log('  displayName :', p.displayName ?? p.name);
  console.log('  email       :', p.email);
  console.log('  userId(uid) :', p.userId, p.userId && !String(p.userId).includes('@') ? '' : '  <-- OJO: no parece un UID');
  console.log('  role        :', p.role);
  console.log('  createdAt   :', p.createdAt);

  const uid = p.userId;
  const email = p.email;

  // Réplica de la consulta de HomeScreen: where athleteId in [email, uid]
  const claves = [email, uid].filter(Boolean);
  const q = await db.collection('workoutAssignments').where('athleteId', 'in', claves).get();
  console.log(`\n  workoutAssignments where athleteId in [${claves.join(', ')}]  ->  ${q.size} docs`);
  const byKey = {};
  q.docs.forEach(d => { const k = d.data().athleteId; byKey[k] = (byKey[k] || 0) + 1; });
  console.log('    desglose por athleteId:', JSON.stringify(byKey));
  q.docs.slice(0, 5).forEach(d => {
    const a = d.data();
    console.log(`    - ${d.id}  date=${a.date} status=${a.status} workoutId=${a.workoutId} mesocycleId=${a.mesocycleId ?? '-'}`);
  });

  // ¿Hay asignaciones suyas por email aunque sea con otra grafía / por uid viejo?
  const porEmailExacto = await db.collection('workoutAssignments').where('athleteId', '==', email).get();
  const porUid = uid ? await db.collection('workoutAssignments').where('athleteId', '==', uid).get() : { size: 0 };
  console.log(`    (athleteId == email exacto: ${porEmailExacto.size} | athleteId == uid: ${porUid.size})`);

  // Auth: ¿email verificado? Es lo que exige la regla para la rama "email".
  try {
    const { getAuth } = await import('firebase-admin/auth');
    let userRec = null;
    if (uid && !String(uid).includes('@')) {
      try { userRec = await getAuth().getUser(uid); } catch {}
    }
    if (!userRec && email) {
      try { userRec = await getAuth().getUserByEmail(email); } catch {}
    }
    if (userRec) {
      console.log('\n  Firebase Auth:');
      console.log('    uid           :', userRec.uid, userRec.uid === uid ? '(coincide con profile.userId)' : '  <-- DISTINTO de profile.userId');
      console.log('    email         :', userRec.email);
      console.log('    emailVerified :', userRec.emailVerified, userRec.emailVerified ? '' : '  <-- LA REGLA BLOQUEA LA LECTURA (rama email exige email_verified==true)');
      console.log('    providers     :', userRec.providerData.map(x => x.providerId).join(', '));
      console.log('    disabled      :', userRec.disabled);
    } else {
      console.log('\n  Firebase Auth: no se encontró usuario por uid ni por email');
    }
  } catch (e) {
    console.log('\n  (no se pudo consultar Auth:', e.message, ')');
  }
}
process.exit(0);
