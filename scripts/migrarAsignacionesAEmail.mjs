/**
 * Migra `workoutAssignments.athleteId` de UID a EMAIL.
 *
 * Contexto: era la ÚNICA colección del proyecto con `athleteId` = UID, contra
 * las ~30 que usan el email. La asimetría no daba errores, daba SILENCIOS:
 * consultar con la clave equivocada devuelve 0 documentos, y al coach le
 * aparece «este atleta no tiene entrenamientos asignados», indistinguible de
 * la verdad.
 *
 * Orden de despliegue (importante):
 *   1. Desplegar las reglas que aceptan UID **y** email
 *      (`firebase deploy --only firestore:rules`).
 *   2. Desplegar el código: consulta con las dos claves y escribe email.
 *   3. Correr este script  →  primero sin flags (simulacro), luego --aplicar.
 *   4. Quitar la rama del uid de las reglas y de `clavesDeAtleta.ts`.
 *
 * Los pasos 1 y 2 se pueden hacer en cualquier orden entre sí; lo que NO se
 * puede es correr el 3 antes que el 1, o el atleta perdería el acceso a sus
 * sesiones hasta que las reglas nuevas estuvieran arriba.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarAsignacionesAEmail.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrarAsignacionesAEmail.mjs --aplicar
 */
import { readFileSync } from 'fs';
import { abrirDb, DATABASE_ID } from './_lib/firestoreDb.mjs';

const APLICAR = process.argv.includes('--aplicar');
const LOTE = 400; // el tope de un batch de Firestore es 500

const credenciales = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credenciales) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta al serviceAccount.json).');
  process.exit(1);
}
const db = abrirDb(JSON.parse(readFileSync(credenciales, 'utf8')));

const esEmail = v => typeof v === 'string' && v.includes('@');

async function main() {
  console.log(`Base: ${DATABASE_ID}`);
  console.log(APLICAR ? '\n*** MODO REAL — se van a escribir documentos ***\n'
                      : '\n--- SIMULACRO (sin --aplicar no se escribe nada) ---\n');

  // 1. UID → email desde user_profiles. Sin este mapa no se puede traducir
  //    nada, así que se carga entero antes de tocar las asignaciones.
  const perfiles = await db.collection('user_profiles').get();
  const emailPorUid = new Map();
  for (const d of perfiles.docs) {
    const email = d.data().email;
    if (email) emailPorUid.set(d.id, email);
    // El docId de user_profiles ES el uid, pero algunos documentos guardan
    // además `userId`; si no coincidiera, se registran los dos.
    const userId = d.data().userId;
    if (userId && email) emailPorUid.set(userId, email);
  }
  console.log(`Perfiles cargados: ${perfiles.size} (${emailPorUid.size} claves uid→email)`);

  // 2. Clasificar las asignaciones.
  const asignaciones = await db.collection('workoutAssignments').get();
  const aMigrar = [];
  const yaEnEmail = [];
  const sinPerfil = [];

  for (const d of asignaciones.docs) {
    const athleteId = d.data().athleteId;
    if (esEmail(athleteId)) { yaEnEmail.push(d); continue; }
    const email = emailPorUid.get(athleteId);
    // Sin perfil no se puede traducir: reescribirlo a ciegas dejaría la
    // asignación apuntando a nadie. Se listan y se dejan como están.
    if (!email) { sinPerfil.push({ id: d.id, athleteId }); continue; }
    aMigrar.push({ ref: d.ref, de: athleteId, a: email });
  }

  console.log(`\nAsignaciones totales:      ${asignaciones.size}`);
  console.log(`  ya en email (se dejan):  ${yaEnEmail.length}`);
  console.log(`  a migrar uid→email:      ${aMigrar.length}`);
  console.log(`  sin perfil (se dejan):   ${sinPerfil.length}`);

  const porAtleta = new Map();
  for (const m of aMigrar) porAtleta.set(m.a, (porAtleta.get(m.a) ?? 0) + 1);
  if (porAtleta.size > 0) {
    console.log('\nPor atleta:');
    for (const [email, n] of porAtleta) console.log(`  ${email}: ${n}`);
  }

  if (sinPerfil.length > 0) {
    console.log('\n⚠ Sin perfil en user_profiles (NO se tocan, revisar a mano):');
    for (const s of sinPerfil.slice(0, 20)) console.log(`  doc ${s.id} → athleteId="${s.athleteId}"`);
    if (sinPerfil.length > 20) console.log(`  …y ${sinPerfil.length - 20} más`);
  }

  if (!APLICAR) {
    console.log('\nSimulacro terminado. Repite con --aplicar para escribir.');
    return;
  }
  if (aMigrar.length === 0) {
    console.log('\nNada que migrar.');
    return;
  }

  // 3. Escribir por lotes.
  let hechas = 0;
  for (let i = 0; i < aMigrar.length; i += LOTE) {
    const tanda = aMigrar.slice(i, i + LOTE);
    const batch = db.batch();
    // `athleteIdAnterior` deja el UID guardado: si algo saliera mal, la vuelta
    // atrás es un update leyendo ese campo, no reconstruirlo de user_profiles.
    for (const m of tanda) batch.update(m.ref, { athleteId: m.a, athleteIdAnterior: m.de });
    await batch.commit();
    hechas += tanda.length;
    console.log(`  ${hechas}/${aMigrar.length}`);
  }

  console.log(`\nListo: ${hechas} asignaciones migradas a email.`);
  console.log('Siguiente paso: quitar la rama del uid en firestore.rules y volver a desplegarlas.');
}

main().catch(err => { console.error('\nFalló la migración:', err); process.exit(1); });
