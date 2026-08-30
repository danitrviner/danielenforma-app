/* Limpieza puntual (2026-08-30): borra las cuentas de demo rotas
 * `atleta@enforma.com` y `atleta2@enforma.com`.
 *
 * Las dos tienen `emailVerified: false` y no tienen documento en `invites`, así
 * que `firestore.rules` les deniega crear su `user_profiles`: entran en la app
 * en modo local con el aviso rojo de «tu cuenta no tiene permiso» y no guardan
 * nada. Son restos de pruebas viejas, no atletas.
 *
 * Además arrastran un perfil fantasma (`n9mTIN89…`, email atleta@enforma.com)
 * cuya cuenta de Auth ya no existe y que sale en el CRM del coach como cliente
 * activo, y varios meses de historial de entrenamiento sembrado.
 *
 * NO hace barridos de colección: usa consultas dirigidas por el email y el uid,
 * sobre el mismo mapa de colecciones que `api/delete-account.ts`. Un barrido
 * completo de las 44 colecciones basta para provocar un RESOURCE_EXHAUSTED.
 *
 * Uso:
 *   node scripts/limpiarCuentasDemo.mjs              (ensayo: solo cuenta)
 *   node scripts/limpiarCuentasDemo.mjs --aplicar    (borra de verdad)
 */
import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url), 'utf8'));
const db = abrirDb(sa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });

const APLICAR = process.argv.includes('--aplicar');

// Mismo mapa que api/delete-account.ts.
const POR_ID_EMAIL = [
  'onboarding', 'gimnasios', 'roadmaps', 'nutritionPrograms', 'athleteDietConfigs',
  'athleteNutritionConfigs', 'athleteNutritionConfig', 'recipeFavorites', 'academyAccess',
  'academyProgress', 'athleteCardioProfile', 'invites',
];
const POR_CAMPO = [
  'checkins', 'workoutLogs', 'workoutAssignments', 'diets', 'weeklyMenus',
  'dietCompletionLogs', 'menuCompletionLogs', 'bodyweightLogs', 'bodyMeasurements',
  'stepLogs', 'progressPhotos', 'photoAssignments', 'questionnaireAssignments',
  'questionnaireResponses', 'exerciseNotes', 'mesocycles', 'weeklyChallenges',
  'notifications', 'tasks', 'coachNotes', 'coachClientTasks', 'athleteStatus',
  'coachReports', 'cardioAssignments', 'cardioSessions', 'cardioWeeklyGoals',
  'hrTests', 'hrvReadings', 'aiChats', 'aiProposals', 'coachDayNotes',
];
const CAMPOS = ['userId', 'athleteId', 'email'];

// Las cuentas a borrar. Los uid de Auth y el perfil fantasma van explícitos
// para no depender de ninguna búsqueda.
const OBJETIVOS = [
  { email: 'atleta@enforma.com',  uids: ['95CZBaXHwEUOAoDOcR95V5dBP5t1', 'n9mTIN89yjbYLLfKOXaHEg0hSnc2'] },
  { email: 'atleta2@enforma.com', uids: ['ERZFlxHlbMMqgGMo4VyzYPMWx5C2'] },
];

// Cortafuegos: solo se toca lo que empiece por "atleta" en @enforma.com.
for (const o of OBJETIVOS) {
  if (!/^atleta\d*@enforma\.com$/.test(o.email)) {
    console.error('ABORTADO: objetivo inesperado', o.email); process.exit(1);
  }
}

const refs = [];   // documentos a borrar
const copia = [];  // su contenido, para la copia de seguridad

for (const { email, uids } of OBJETIVOS) {
  const claves = [email, ...uids];

  for (const col of POR_ID_EMAIL) {
    const d = await db.collection(col).doc(email).get();
    if (d.exists) { refs.push(d.ref); copia.push({ col, id: d.id, datos: d.data() }); }
  }

  for (const col of POR_CAMPO) {
    for (const campo of CAMPOS) {
      for (const clave of claves) {
        let snap;
        try { snap = await db.collection(col).where(campo, '==', clave).get(); }
        catch { continue; }  // colección inexistente o campo no indexable
        for (const d of snap.docs) {
          if (refs.some(r => r.path === d.ref.path)) continue;
          refs.push(d.ref); copia.push({ col, id: d.id, datos: d.data() });
        }
      }
    }
  }

  for (const uid of uids) {
    const d = await db.collection('user_profiles').doc(uid).get();
    if (d.exists) { refs.push(d.ref); copia.push({ col: 'user_profiles', id: d.id, datos: d.data() }); }
  }
}

// ── Recuento ──────────────────────────────────────────────────────────────
const porColeccion = {};
for (const c of copia) porColeccion[c.col] = (porColeccion[c.col] || 0) + 1;
console.log('Documentos que se van a borrar:\n');
for (const [col, n] of Object.entries(porColeccion).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${col.padEnd(26)} ${n}`);
}
console.log(`\n  TOTAL: ${refs.length} documentos`);

const cuentasAuth = [];
for (const { email } of OBJETIVOS) {
  try {
    const u = await getAuth().getUserByEmail(email);
    cuentasAuth.push(u);
    console.log(`\nCuenta de Auth: ${u.email} (uid ${u.uid}, verificado=${u.emailVerified})`);
  } catch { console.log(`\nCuenta de Auth: ${email} ya no existe`); }
}

if (!APLICAR) {
  console.log('\nEnsayo. Vuelve a llamarlo con --aplicar para borrar.');
  process.exit(0);
}

const destino = new URL('../copia-cuentas-demo.json', import.meta.url);
writeFileSync(destino, JSON.stringify({ guardadoEn: new Date().toISOString(), objetivos: OBJETIVOS, documentos: copia }, null, 2));
console.log(`\nCopia guardada en ${destino.pathname}`);

for (let i = 0; i < refs.length; i += 400) {
  const lote = db.batch();
  refs.slice(i, i + 400).forEach(r => lote.delete(r));
  await lote.commit();
}
console.log(`Borrados ${refs.length} documentos.`);

for (const u of cuentasAuth) {
  await getAuth().deleteUser(u.uid);
  console.log(`Borrada la cuenta de Auth ${u.email}`);
}
