/* READ-ONLY: cuántos documentos cuelgan de las cuentas de demo, por colección. */
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const CLAVES = {
  'atleta@enforma.com': 0,
  'atleta2@enforma.com': 0,
  '95CZBaXHwEUOAoDOcR95V5dBP5t1': 0,
  'ERZFlxHlbMMqgGMo4VyzYPMWx5C2': 0,
  'n9mTIN89yjbYLLfKOXaHEg0hSnc2': 0,
};

for (const col of await db.listCollections()) {
  const porClave = {};
  for (const d of (await col.get()).docs) {
    const crudo = d.id + ' ' + JSON.stringify(d.data());
    for (const k of Object.keys(CLAVES)) {
      if (crudo.includes(k)) { porClave[k] = (porClave[k] || 0) + 1; CLAVES[k]++; }
    }
  }
  if (Object.keys(porClave).length) {
    console.log(`${col.id.padEnd(26)} ${Object.entries(porClave).map(([k, n]) => `${k}=${n}`).join('  ')}`);
  }
}

console.log('\nTOTAL por clave:');
for (const [k, n] of Object.entries(CLAVES)) console.log(`  ${k.padEnd(34)} ${n}`);

console.log('\n=== Auth ===');
for (const uid of ['95CZBaXHwEUOAoDOcR95V5dBP5t1', 'ERZFlxHlbMMqgGMo4VyzYPMWx5C2']) {
  try {
    const u = await getAuth().getUser(uid);
    console.log(` ${u.email} uid=${uid} verificado=${u.emailVerified} ultimoLogin=${u.metadata.lastSignInTime || 'NUNCA'}`);
  } catch (e) { console.log(` ${uid}: ${e.code}`); }
}
