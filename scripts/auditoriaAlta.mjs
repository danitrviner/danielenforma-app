/* READ-ONLY: auditoría del proceso de alta de un atleta.
 *
 * Comprueba, para cada cuenta de Auth, que las piezas que el alta debe dejar
 * montadas están de verdad ahí: perfil, invitación marcada, onboarding,
 * gimnasio, y los datos que el atleta escribe él mismo. Un hueco aquí es un
 * atleta que entra pero no puede usar la app.
 *
 * Uso: node scripts/auditoriaAlta.mjs
 */
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const users = [];
let page;
do {
  const r = await getAuth().listUsers(1000, page);
  users.push(...r.users);
  page = r.pageToken;
} while (page);

const perfiles = new Map();
for (const d of (await db.collection('user_profiles').get()).docs) perfiles.set(d.id, d.data());
const invites = new Map();
for (const d of (await db.collection('invites').get()).docs) invites.set(d.id.toLowerCase(), d.data());

const porEmail = async (col, email) => {
  const d = await db.collection(col).doc(email).get();
  return d.exists ? d.data() : null;
};
const contar = async (col, campo, valor) => {
  try { return (await db.collection(col).where(campo, '==', valor).limit(50).get()).size; }
  catch { return '?'; }
};

for (const u of users.sort((a, b) => a.metadata.creationTime.localeCompare(b.metadata.creationTime))) {
  const email = (u.email || '').toLowerCase();
  const p = perfiles.get(u.uid);
  console.log(`\n━━ ${email}`);
  console.log(`   uid ${u.uid}`);
  console.log(`   Auth: emailVerified=${u.emailVerified} | creada ${u.metadata.creationTime} | login ${u.metadata.lastSignInTime || 'NUNCA'}`);
  console.log(`   invites/: ${invites.has(email) ? invites.get(email).status : 'NO EXISTE'}`);
  if (!p) { console.log('   user_profiles: ✗ NO EXISTE — invisible para el coach'); continue; }
  console.log(`   user_profiles: role=${p.role} displayName=${p.displayName} emailEnDoc=${p.email} lastLoginAt=${p.lastLoginAt || '-'}`);
  const faltan = ['email', 'role', 'displayName', 'userId'].filter(k => p[k] === undefined);
  if (faltan.length) console.log(`   ⚠ campos ausentes en el perfil: ${faltan.join(', ')}`);
  const onb = await porEmail('onboarding', email);
  const gim = await porEmail('gimnasios', email);
  console.log(`   onboarding: ${onb ? (onb.completedAt ? 'completado ' + onb.completedAt : 'empezado sin completar') : 'sin empezar'}`);
  console.log(`   gimnasio: ${gim ? `${(gim.maquinas || []).length} máquinas` : 'sin tocar'}`);
  console.log(`   asignaciones=${await contar('workoutAssignments', 'athleteId', email)}` +
    ` dietas=${await contar('diets', 'athleteId', email)}` +
    ` checkins=${await contar('checkins', 'userId', u.uid)}` +
    ` logs=${await contar('workoutLogs', 'athleteId', email)}`);
}

console.log('\n\n═══ Perfiles SIN cuenta de Auth (basura o cuentas borradas) ═══');
const uids = new Set(users.map(u => u.uid));
for (const [id, p] of perfiles) if (!uids.has(id)) console.log(`   ${id}  email=${p.email}  role=${p.role}`);
