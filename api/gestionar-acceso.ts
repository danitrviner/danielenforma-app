// Acceso de un cliente a la app, decidido por el coach desde el CRM.
//
// Archivar a un cliente era solo esconderlo de las listas: seguía pudiendo
// entrar. Esto es lo que lo hace de verdad. Tres acciones, todas solo del coach:
//
//   · bloquear     — desactiva su usuario de Firebase Auth (no puede iniciar
//                    sesión) y revoca sus sesiones abiertas (no puede refrescar
//                    el token). Los datos no se tocan: se puede deshacer.
//   · desbloquear  — lo contrario. El cliente vuelve a entrar con su contraseña.
//   · eliminar     — borra la cuenta entera con el mismo borrado que el botón
//                    «Eliminar mi cuenta» de la app (api/_lib/borrarCuenta.ts):
//                    datos, ficheros y acceso, conservando solo servicios y
//                    cobros anonimizados. Irreversible.
//
// Por qué en el servidor: `disabled` y la revocación de tokens son operaciones
// del Admin SDK; ninguna regla de Firestore puede hacerlas desde el cliente.
//
// Se identifica a la persona por EMAIL y no por UID: el id del documento de
// `user_profiles` puede no coincidir con el UID de Auth (perfiles heredados de
// un registro anterior), y el email es lo único que ambos lados comparten.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  COACH_EMAIL,
  esCoach,
  getAdminAuth,
  getAdminDb,
  setCors,
  tokenDeLaCabecera,
  verifyFirebaseIdToken,
} from './_lib/auth.js';
import { borrarCuentaDeAtleta } from './_lib/borrarCuenta.js';

export const config = { maxDuration: 60 };

const ACCIONES = ['bloquear', 'desbloquear', 'eliminar'] as const;
type Accion = (typeof ACCIONES)[number];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req.headers.origin, (k, v) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

  const idToken = tokenDeLaCabecera(req.headers.authorization);
  if (!idToken) { res.status(401).json({ error: 'Falta el token de autenticación' }); return; }
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded) { res.status(401).json({ error: 'Token inválido o caducado' }); return; }
  if (!esCoach(decoded)) {
    console.warn(`gestionar-acceso: 403 para ${decoded.email || '(sin email)'}`);
    res.status(403).json({ error: 'Solo el coach puede gestionar el acceso de un cliente' });
    return;
  }

  const body = (req.body ?? {}) as { email?: string; accion?: string; profileId?: string };
  const email = (body.email ?? '').trim().toLowerCase();
  const accion = body.accion as Accion;
  if (!email || !ACCIONES.includes(accion)) {
    res.status(400).json({ error: 'Faltan el correo o la acción (bloquear, desbloquear, eliminar)' });
    return;
  }
  // La cuenta del coach nunca se toca desde aquí: bloquearla o borrarla dejaría
  // la app sin nadie que pueda administrarla, sin forma de recrearla.
  if (email === COACH_EMAIL) {
    res.status(403).json({ error: 'La cuenta del entrenador no se puede bloquear ni eliminar.' });
    return;
  }

  const adminAuth = await getAdminAuth();
  const adminDb = await getAdminDb();
  if (!adminAuth || !adminDb) {
    res.status(503).json({ error: 'Falta configurar FIREBASE_SERVICE_ACCOUNT en Vercel.' });
    return;
  }

  // ¿Tiene cuenta de acceso? Un cliente puede existir en el CRM, e incluso tener
  // perfil, sin usuario de Auth (invitación no completada o ya borrado).
  let authUid: string | undefined;
  try {
    authUid = (await adminAuth.getUserByEmail(email)).uid;
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') {
      console.error('gestionar-acceso: no se pudo consultar Auth:', err);
      res.status(500).json({ error: 'No se pudo consultar la cuenta. Inténtalo de nuevo.' });
      return;
    }
  }

  try {
    if (accion === 'eliminar') {
      const resumen = await borrarCuentaDeAtleta(adminAuth, adminDb, {
        email,
        uids: [authUid ?? '', body.profileId ?? ''],
        authUid,
      });
      res.status(200).json({ ok: true, sinCuenta: !authUid, ...resumen });
      return;
    }

    // Sin usuario de Auth no hay nada que bloquear: no es un error, el cliente
    // ya no puede entrar. El CRM sigue marcándolo archivado por su lado.
    if (!authUid) { res.status(200).json({ ok: true, sinCuenta: true }); return; }

    if (accion === 'bloquear') {
      await adminAuth.updateUser(authUid, { disabled: true });
      // Sin esto, el token ya emitido (dura hasta 1 h) y el de refresco siguen
      // sirviendo: el usuario desactivado no puede iniciar sesión, pero la
      // sesión que ya tiene abierta no se entera.
      await adminAuth.revokeRefreshTokens(authUid);
    } else {
      await adminAuth.updateUser(authUid, { disabled: false });
    }
    res.status(200).json({ ok: true, sinCuenta: false });
  } catch (err) {
    console.error(`gestionar-acceso: ${accion} falló para ${email}:`, err);
    res.status(500).json({
      error: accion === 'eliminar'
        ? 'No se pudo completar el borrado. Inténtalo de nuevo.'
        : 'No se pudo cambiar el acceso. El cliente no ha cambiado de estado: inténtalo de nuevo.',
    });
  }
}
