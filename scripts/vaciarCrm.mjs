// Vacía el rastro comercial del CRM para empezarlo de cero (Dani, 16-09-2026:
// «limpia el CRM que lo quiero dejar vacío para volverlo a hacer de nuevo»).
//
// Borra: crmServicios, crmPagos, crmSuscripciones, crmReuniones, crmContactos.
// Resetea en user_profiles los campos del CRM: estadoCrm, archivadoCrm,
// origen, fechaBaja. NO toca nada más del perfil (nombre, DNI, dirección,
// teléfono son del atleta, no del CRM) ni ninguna otra colección.
//
// Sin `--aplicar` solo cuenta. Con `--aplicar` borra de verdad, en lotes de
// 400, y deja los sellos de catálogo tocados para que la app del coach no
// siga enseñando lo borrado desde su caché.
import { readFileSync } from 'fs';
import { FieldValue } from 'firebase-admin/firestore';
import { abrirDb } from './_lib/firestoreDb.mjs';

const APLICAR = process.argv.includes('--aplicar');
const db = abrirDb(JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8')));

const COLECCIONES = ['crmServicios', 'crmPagos', 'crmSuscripciones', 'crmReuniones', 'crmContactos'];
const CAMPOS_CRM = ['estadoCrm', 'archivadoCrm', 'origen', 'fechaBaja'];

async function enLotes(refs, fn) {
  for (let i = 0; i < refs.length; i += 400) {
    const b = db.batch();
    for (const r of refs.slice(i, i + 400)) fn(b, r);
    await b.commit();
  }
}

let total = 0;
for (const col of COLECCIONES) {
  const snap = await db.collection(col).get();
  console.log(`${col.padEnd(18)} ${snap.size} documentos${APLICAR ? ' → borrar' : ''}`);
  total += snap.size;
  if (APLICAR && snap.size) await enLotes(snap.docs.map(d => d.ref), (b, r) => b.delete(r));
}

const perfiles = await db.collection('user_profiles').get();
const conCrm = perfiles.docs.filter(d => CAMPOS_CRM.some(k => d.data()[k] !== undefined));
console.log(`user_profiles      ${conCrm.length} de ${perfiles.size} con campos CRM${APLICAR ? ' → resetear' : ''}`);
if (APLICAR && conCrm.length) {
  const limpio = Object.fromEntries(CAMPOS_CRM.map(k => [k, FieldValue.delete()]));
  await enLotes(conCrm.map(d => d.ref), (b, r) => b.update(r, limpio));
}

if (APLICAR) {
  const ts = new Date().toISOString();
  for (const col of COLECCIONES) await db.collection('catalogos').doc(col).set({ version: ts }, { merge: true });
  await db.collection('catalogos').doc('user_profiles').set({ version: ts }, { merge: true });
  console.log(`\nHecho: ${total} documentos borrados y ${conCrm.length} perfiles reseteados.`);
} else {
  console.log(`\nEN SECO. ${total} documentos se borrarían y ${conCrm.length} perfiles se resetearían. Añade --aplicar para hacerlo.`);
}
process.exit(0);
