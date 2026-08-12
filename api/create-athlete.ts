// Alta de un atleta, hecha por el coach.
//
// Sustituye al enlace mágico (`sendSignInLinkToEmail`), que era el único camino
// de alta y estaba roto por partida doble: dependía de un ajuste de la consola
// que nunca se activó (`auth/operation-not-allowed`, B-9) y, aunque se activara,
// el enlace no podía completarse dentro de la app nativa porque no hay Universal
// Links ni escucha de deep link (B-5).
//
// El flujo nuevo no necesita ninguna de las dos cosas:
//   1. el coach pulsa «invitar» → esta función crea la cuenta con el Admin SDK
//      (contraseña aleatoria que no ve nadie, ni siquiera se devuelve)
//   2. la función registra el documento en `invites`, que es lo que
//      `firestore.rules` exige para que el atleta pueda crear su perfil
//   3. el cliente pide a Firebase que mande su correo de «crea tu contraseña»
//   4. el atleta elige contraseña y entra por el formulario normal
//
// Ninguna contraseña viaja nunca por correo, y no hace falta contratar ningún
// servicio de envío: el correo lo manda Firebase con su propia plantilla.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import {
  esCoach,
  getAdminAuth,
  getAdminDb,
  setCors,
  tokenDeLaCabecera,
  verifyFirebaseIdToken,
} from './_lib/auth.js';

export const config = { maxDuration: 30 };

// Formato mínimo. La comprobación de verdad la hace Firebase Auth al crear la
// cuenta; esto solo evita el viaje de ida y vuelta con basura evidente.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req.headers.origin, (k, v) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  // ── Solo el coach da de alta ──────────────────────────────────────────────
  const idToken = tokenDeLaCabecera(req.headers.authorization);
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }
  if (!esCoach(decoded)) {
    res.status(403).json({ error: 'Solo el coach puede dar de alta a un atleta' });
    return;
  }

  // ── Payload ───────────────────────────────────────────────────────────────
  const body = (req.body ?? {}) as { email?: string; displayName?: string };
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Correo no válido' });
    return;
  }
  const displayName = (body.displayName ?? '').trim().slice(0, 120) || undefined;

  // Sin cuenta de servicio no se puede crear nada. Es fail-closed a propósito:
  // devolver 200 aquí haría creer al coach que ha invitado a alguien que no
  // existe, y no se enteraría hasta que el atleta se quejara.
  const adminAuth = await getAdminAuth();
  const adminDb = await getAdminDb();
  if (!adminAuth || !adminDb) {
    res.status(503).json({
      error: 'El alta no está disponible: falta configurar FIREBASE_SERVICE_ACCOUNT en Vercel.',
    });
    return;
  }

  try {
    // ── 1. La cuenta ────────────────────────────────────────────────────────
    // La contraseña es aleatoria de 32 bytes y no se devuelve ni se registra en
    // ningún sitio: es un relleno para que la cuenta exista. La real la elige el
    // atleta desde el correo de restablecimiento.
    //
    // emailVerified: true es deliberado, y conviene entender por qué no es un
    // atajo. Las reglas exigen `email_verified` porque ANTES cualquiera podía
    // registrarse solo con teclear un correo ajeno; al quitar el autorregistro,
    // el único que puede crear cuentas es el coach, autenticado en esta misma
    // función. Sin esto, además, el atleta cae en el encierro de 03-11: entra
    // pero no puede crear su perfil, que es exactamente el fallo que ya se
    // sufrió una vez.
    let creada = true;
    let uid: string;
    try {
      const user = await adminAuth.createUser({
        email,
        emailVerified: true,
        password: randomBytes(32).toString('base64url'),
        displayName,
      });
      uid = user.uid;
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/email-already-exists') {
        // Reinvitar a alguien que ya tiene cuenta es un caso legítimo y
        // frecuente (se le perdió el correo, no lo encuentra). No es un error:
        // se sigue adelante y se le vuelve a mandar el correo de contraseña.
        const existente = await adminAuth.getUserByEmail(email);
        uid = existente.uid;
        creada = false;
        if (!existente.emailVerified) {
          await adminAuth.updateUser(uid, { emailVerified: true });
        }
      } else {
        throw err;
      }
    }

    // ── 2. El documento de invitación ───────────────────────────────────────
    // `firestore.rules` exige `exists(/invites/{email})` para que el atleta
    // pueda crear su `user_profiles`. Antes lo escribía el cliente y podía
    // fallar por permisos DESPUÉS de que el correo ya hubiera salido, dejando a
    // la persona con acceso pero sin poder darse de alta. Aquí lo escribe el
    // Admin SDK, que no pasa por las reglas: o se hace todo, o no se hace nada.
    await adminDb.collection('invites').doc(email).set(
      {
        id: email,
        email,
        invitedAt: new Date().toISOString(),
        status: 'pending',
      },
      { merge: true }
    );

    res.status(200).json({ ok: true, uid, creada });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error('create-athlete error:', e);
    if (e.code === 'auth/invalid-email') {
      res.status(400).json({ error: 'Correo no válido' });
      return;
    }
    res.status(500).json({ error: 'No se pudo crear la cuenta del atleta.' });
  }
}
