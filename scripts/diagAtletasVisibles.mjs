/* READ-ONLY: por qué no salen todos los atletas en la app del coach. */
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const auth = getAuth();

// 1. Cuentas de Auth
const authUsers = [];
let page;
do {
  const r = await auth.listUsers(1000, page);
  authUsers.push(...r.users);
  page = r.pageToken;
} while (page);

// 2. Perfiles
const profs = (await db.collection('user_profiles').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const invites = (await db.collection('invites').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const contactos = (await db.collection('crmContactos').get()).docs.map(d => ({ id: d.id, ...d.data() }));

console.log(`Auth: ${authUsers.length} | user_profiles: ${profs.length} | invites: ${invites.length} | crmContactos: ${contactos.length}\n`);

// Perfiles sin email o email raro -> rompen deduplicateByEmail (p.email.toLowerCase())
const sinEmail = profs.filter(p => typeof p.email !== 'string' || !p.email);
console.log(`### Perfiles SIN campo email (rompen la lista entera): ${sinEmail.length}`);
sinEmail.forEach(p => console.log(`   - ${p.id}  displayName=${p.displayName}  role=${p.role}`));

// Duplicados por email
const byEmail = new Map();
for (const p of profs) {
  const k = String(p.email || '').toLowerCase();
  byEmail.set(k, [...(byEmail.get(k) || []), p]);
}
const dups = [...byEmail.entries()].filter(([, v]) => v.length > 1);
console.log(`\n### Emails con más de un perfil (uno se BORRA solo): ${dups.length}`);
dups.forEach(([k, v]) => console.log(`   - ${k}: ${v.map(p => p.id).join(', ')}`));

console.log('\n### Perfiles por rol / estado');
const roles = {};
for (const p of profs) {
  const key = `${p.role || '(sin role)'} | estadoCrm=${p.estadoCrm || '(vacío)'} | anonimizado=${p.anonimizado === true}`;
  roles[key] = (roles[key] || 0) + 1;
}
Object.entries(roles).forEach(([k, n]) => console.log(`   ${n}\t${k}`));

console.log('\n### Cuentas de Auth SIN perfil (nunca entraron -> invisibles para el coach)');
const profIds = new Set(profs.map(p => p.id));
const profEmails = new Set(profs.map(p => String(p.email || '').toLowerCase()));
const huerfanos = authUsers.filter(u => !profIds.has(u.uid) && !profEmails.has(String(u.email || '').toLowerCase()));
huerfanos.forEach(u => console.log(`   - ${u.email}  uid=${u.uid}  creada=${u.metadata.creationTime}  ultimoLogin=${u.metadata.lastSignInTime || 'NUNCA'}`));
console.log(`   total: ${huerfanos.length}`);

console.log('\n### Invitaciones sin perfil');
invites.filter(i => !profEmails.has(String(i.email || i.id).toLowerCase()))
  .forEach(i => console.log(`   - ${i.id}  status=${i.status}  invitedAt=${i.invitedAt}`));

console.log('\n### Listado completo de perfiles');
profs.sort((a, b) => String(a.email).localeCompare(String(b.email)))
  .forEach(p => console.log(`   ${String(p.email).padEnd(38)} role=${String(p.role).padEnd(7)} estadoCrm=${String(p.estadoCrm || '-').padEnd(10)} anon=${p.anonimizado === true} uid=${p.id}`));
