// Borrado de cuenta del atleta (B-1 / 01-1 / 03-4).
//
// Apple lo exige a cualquier app que cree cuentas (guideline 5.1.1.v) y Google
// exige además una URL web pública de solicitud, que vive en
// public/eliminar-cuenta/. Sin esto no se puede publicar en ninguna de las dos.
//
// Por qué en el servidor y no en el cliente. `firestore.rules` solo permite
// `delete` sobre `user_profiles` al coach, y muchas colecciones ni siquiera dan
// borrado a su dueño. Hacerlo desde el cliente exigiría abrir reglas de borrado
// en ~35 colecciones, que es superficie de ataque nueva a cambio de nada. El
// Admin SDK no pasa por las reglas, así que aquí no hay que abrir nada.
//
// Qué hace: verifica el ID token, exige reautenticación reciente (auth_time) y
// delega en `borrarCuentaDeAtleta` (api/_lib/borrarCuenta.ts), que borra
// colecciones, Storage y Auth, y conserva solo servicios y cobros anonimizados.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  COACH_EMAIL,
  getAdminAuth,
  getAdminDb,
  setCors,
  tokenDeLaCabecera,
  verifyFirebaseIdToken,
} from './_lib/auth.js';
import { borrarCuentaDeAtleta } from './_lib/borrarCuenta.js';

// El inventario de qué se borra y qué se conserva vive en _lib/borrarCuenta.ts
// (lo comparten este endpoint y gestionar-acceso.ts). Se reexporta porque
// src/db/borradoCuenta.test.ts lo importa desde aquí.
export {
  POR_ID_EMAIL,
  POR_CAMPO,
  PREFIJOS_STORAGE,
  CRM_A_ANONIMIZAR,
  CRM_A_BORRAR,
} from './_lib/borrarCuenta.js';

export const config = { maxDuration: 60 };

// Reautenticación: el token tiene que venir de un inicio de sesión de hace menos
// de 10 minutos. Sin esto, un móvil desbloqueado y olvidado en una mesa basta
// para borrar la cuenta entera de alguien. El cliente fuerza el reinicio de
// sesión con la contraseña justo antes de llamar.
const MAX_ANTIGUEDAD_LOGIN_MS = 10 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req.headers.origin, (k, v) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const idToken = tokenDeLaCabecera(req.headers.authorization);
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }

  const uid = decoded.uid;
  const email = decoded.email.toLowerCase();
  if (!email) { res.status(400).json({ error: 'La cuenta no tiene correo asociado' }); return; }

  // La cuenta del coach no se borra desde aquí. Borrarla dejaría a todos los
  // atletas sin nadie que pueda administrar nada, y no hay forma de recrearla
  // desde la app. Si algún día hace falta, es una operación manual y consciente.
  if (email === COACH_EMAIL) {
    res.status(403).json({ error: 'La cuenta del entrenador no se puede eliminar desde la app.' });
    return;
  }

  const adminAuth = await getAdminAuth();
  const adminDb = await getAdminDb();
  if (!adminAuth || !adminDb) {
    res.status(503).json({ error: 'El borrado no está disponible: falta configurar FIREBASE_SERVICE_ACCOUNT en Vercel.' });
    return;
  }

  // ── Reautenticación reciente y token no revocado ──────────────────────────
  // `authTimeMs` sale del token ya verificado con `jose` en _lib/auth. NO se usa
  // `adminAuth.verifyIdToken()`: esa vía arrastra jwks-rsa, que hace un require()
  // CJS de `jose` (ESM-only) y revienta con ERR_REQUIRE_ESM en el runtime de
  // Vercel — es el mismo motivo por el que la verificación se hace a mano en
  // todo este proyecto. `getUser()` sí es seguro: es solo una lectura del
  // registro de usuario, sin verificación de tokens por medio.
  try {
    const usuario = await adminAuth.getUser(uid);
    const tokensValidosDesde = usuario.tokensValidAfterTime
      ? Date.parse(usuario.tokensValidAfterTime)
      : 0;
    if (
      Date.now() - decoded.authTimeMs > MAX_ANTIGUEDAD_LOGIN_MS ||
      decoded.authTimeMs < tokensValidosDesde
    ) {
      res.status(401).json({
        error: 'Por seguridad, vuelve a introducir tu contraseña antes de eliminar la cuenta.',
        code: 'auth/requires-recent-login',
      });
      return;
    }
  } catch (err) {
    console.error('delete-account: fallo comprobando la reautenticación:', err);
    res.status(401).json({ error: 'No se pudo verificar tu sesión. Vuelve a entrar e inténtalo.' });
    return;
  }

  try {
    const resumen = await borrarCuentaDeAtleta(adminAuth, adminDb, { email, uids: [uid], authUid: uid });
    res.status(200).json({ ok: true, ...resumen });
  } catch (err) {
    console.error('delete-account: error no recuperable:', err);
    res.status(500).json({
      error: 'No se pudo completar el borrado. No se ha eliminado tu cuenta: inténtalo de nuevo o escribe a Dani.',
    });
  }
}
