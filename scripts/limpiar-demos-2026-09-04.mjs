/* ═══════════════════════════════════════════════════════════════════════════
   Limpieza de cuentas · autorizada por Dani el 04-09-2026

   Uso:
     node scripts/limpiar-demos-2026-09-04.mjs --dry     # solo enseña qué haría
     node scripts/limpiar-demos-2026-09-04.mjs           # lo hace de verdad

   Qué hace:
     1. ARCHIVA a Jony y a Sandra (reversible: solo pone `archivadoCrm: true`).
     2. BORRA la cuenta de vídeo demo «Marcos Vídeo» entera —sus ~142
        documentos y su usuario de Auth—. Se puede regenerar con
        scripts/crear-cuenta-video-demo.mjs.
     3. BORRA sin rastro el perfil anonimizado `borrado_c337802d9d34`, resto de
        un borrado de cuenta antiguo. Se comprobó antes de escribir esto: NO
        tiene servicios ni cobros, así que no descuadra nada facturado.

   Qué NO hace, a propósito:
     NO toca `revision.appstore@danielenforma.app` («Cliente Demo»). Es la
     cuenta con la que los revisores de Apple y Google entran en la app, y hay
     una revisión en curso en Play. Si desaparece, el revisor no puede entrar y
     la app se rechaza. Hay además una salvaguarda en el código de abajo:
     cualquier documento que mencione ese correo se salta, pase lo que pase.

   Esto es IRREVERSIBLE y no hay copia de seguridad. Pasa primero el --dry.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const SECO = process.argv.includes('--dry');
const INTOCABLE = 'revision.appstore@danielenforma.app';

const ARCHIVAR = [
  { uid: 'g9y5QYxrXqYkgQX8wPhIXRPXtJz1', quien: 'Jony   (jonyjony6999@gmail.com)' },
  { uid: 'Uq75Q86VdVZBZ2SiscdfFP6XSwF2', quien: 'Sandra (sandrabriz.sb@gmail.com)' },
];
const MARCOS_UID = 'kMO69J7yizNgz9MqZfyngGxVD6N2';
const MARCOS = ['demo.video@danielenforma.app', MARCOS_UID];
const ANONIMO = ['IL3uc6ktl1MWrKlaYY9CmP2CZ372', 'borrado_c337802d9d34'];

async function borrar(claves, etiqueta) {
  console.log(`\n── ${etiqueta} ──`);
  let total = 0;
  for (const col of await db.listCollections()) {
    const refs = [];
    for (const d of (await col.get()).docs) {
      const crudo = d.id + ' ' + JSON.stringify(d.data());
      if (crudo.includes(INTOCABLE)) continue;   // salvaguarda de la cuenta de revisión
      if (claves.some(k => crudo.includes(k))) refs.push(d.ref);
    }
    if (!refs.length) continue;
    if (!SECO) {
      for (let i = 0; i < refs.length; i += 400) {
        const lote = db.batch();
        for (const ref of refs.slice(i, i + 400)) lote.delete(ref);
        await lote.commit();
      }
    }
    console.log(`   ${col.id}: ${refs.length}`);
    total += refs.length;
  }
  console.log(`   ${SECO ? 'SE BORRARÍAN' : 'BORRADOS'}: ${total} documentos`);
  return total;
}

console.log(SECO ? '*** MODO SECO · no se escribe nada ***' : '*** EJECUTANDO DE VERDAD ***');

console.log('\n── Archivar ──');
for (const { uid, quien } of ARCHIVAR) {
  if (!SECO) await db.collection('user_profiles').doc(uid).update({ archivadoCrm: true });
  console.log(`   ${SECO ? 'se archivaría' : 'ARCHIVADO'} · ${quien}`);
}

await borrar(MARCOS, 'Marcos Vídeo · borrado completo');
if (!SECO) {
  try { await getAuth().deleteUser(MARCOS_UID); console.log('   AUTH borrada'); }
  catch (e) { console.log('   AUTH: ' + e.message); }
} else {
  console.log('   se borraría también su usuario de Auth');
}

await borrar(ANONIMO, 'Perfil anonimizado borrado_c337802d9d34 · sin rastro');

console.log(`\nListo.${SECO ? ' Vuelve a lanzarlo SIN --dry para hacerlo de verdad.' : ''}`);
console.log('«Cliente Demo» (revision.appstore@) NO se ha tocado, a propósito.');
