// Script de un solo uso: crea una cuenta de atleta ficticia para las notas de
// revisión de App Store / Play Console. No se commitea el resultado (la
// contraseña se imprime por consola, no se guarda en el repo).
//
// Uso: node scripts/crear-atleta-demo.mjs

import { readFileSync } from 'fs';
import { getAuth } from 'firebase-admin/auth';
import { abrirDb } from './_lib/firestoreDb.mjs';

const sa = JSON.parse(readFileSync(new URL('../serviceAccount.json', import.meta.url)));
const db = abrirDb(sa);
const auth = getAuth();

const EMAIL = 'revision.appstore@danielenforma.app';
const PASSWORD = 'Revision-EnForma-' + Math.random().toString(36).slice(2, 8) + '!2026';
const NOMBRE = 'Cliente Demo';

async function main() {
  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
    await auth.updateUser(user.uid, { password: PASSWORD, emailVerified: true, disabled: false });
    console.log('Usuario ya existía, contraseña actualizada.');
  } catch (e) {
    user = await auth.createUser({
      email: EMAIL,
      password: PASSWORD,
      emailVerified: true,
      displayName: NOMBRE,
    });
    console.log('Usuario creado.');
  }

  const ahora = new Date().toISOString();

  await db.collection('user_profiles').doc(EMAIL).set({
    userId: user.uid,
    email: EMAIL,
    displayName: NOMBRE,
    role: 'client',
    avatarUrl: '',
    level: 1,
    xp: 0,
    currentStreak: 0,
    maxStreak: 0,
    initialWeight: 78,
    targetWeight: 74,
    actualWeight: 77.2,
    planStartDate: ahora.slice(0, 10),
    planDurationMonths: 6,
    createdAt: ahora,
    legal: {
      terminos:   { version: 1, fecha: ahora, opciones: { analisisIA: false } },
      privacidad: { version: 1, fecha: ahora },
    },
  }, { merge: true });

  await db.collection('invites').doc(EMAIL).set({
    id: EMAIL,
    email: EMAIL,
    invitedAt: ahora,
    status: 'joined',
    joinedAt: ahora,
  }, { merge: true });

  console.log('\n=== CREDENCIALES (guárdalas, no se repiten en consola) ===');
  console.log('Email:    ' + EMAIL);
  console.log('Password: ' + PASSWORD);
  console.log('============================================================\n');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
