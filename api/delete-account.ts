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
// Qué hace exactamente:
//   1. verifica el ID token y exige reautenticación reciente (auth_time)
//   2. borra las colecciones del atleta, por doc-id y por campo
//   3. borra sus ficheros de Storage
//   4. ANONIMIZA el rastro comercial en vez de borrarlo (decisión de producto,
//      10 ago 2026): la ley obliga a conservar la documentación de operaciones
//      cobradas, y `firestore.rules:626` ya prohíbe borrar un pago en estado
//      `pagado`. Se sustituyen nombre, email, DNI, dirección y teléfono por una
//      etiqueta opaca, y se conservan importes y fechas.
//   5. borra el usuario de Firebase Auth, que es el último paso a propósito:
//      si algo falla antes, la persona todavía puede entrar y reintentar.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import {
  COACH_EMAIL,
  PROJECT_ID,
  getAdminAuth,
  getAdminDb,
  setCors,
  tokenDeLaCabecera,
  verifyFirebaseIdToken,
} from './_lib/auth.js';

export const config = { maxDuration: 60 };

// Reautenticación: el token tiene que venir de un inicio de sesión de hace menos
// de 10 minutos. Sin esto, un móvil desbloqueado y olvidado en una mesa basta
// para borrar la cuenta entera de alguien. El cliente fuerza el reinicio de
// sesión con la contraseña justo antes de llamar.
const MAX_ANTIGUEDAD_LOGIN_MS = 10 * 60 * 1000;

// Colecciones cuyo ID de documento ES el email del atleta.
export const POR_ID_EMAIL = [
  'onboarding', 'gimnasios', 'roadmaps', 'nutritionPrograms', 'athleteDietConfigs',
  'athleteNutritionConfigs', 'recipeFavorites', 'academyAccess', 'academyProgress',
  'athleteCardioProfile', 'invites',
];

// Colecciones con un campo que apunta al atleta. Se prueban los tres nombres
// que usa el esquema; una colección puede indexar por uno u otro según cuándo se
// escribió, así que se consultan todos y se unen los resultados.
export const POR_CAMPO = [
  'checkins', 'workoutLogs', 'workoutAssignments', 'diets', 'weeklyMenus',
  'dietCompletionLogs', 'menuCompletionLogs', 'bodyweightLogs', 'bodyMeasurements',
  'stepLogs', 'progressPhotos', 'photoAssignments', 'questionnaireAssignments',
  'questionnaireResponses', 'exerciseNotes', 'mesocycles', 'weeklyChallenges',
  'notifications', 'tasks', 'coachNotes', 'coachClientTasks', 'athleteStatus',
  'coachReports', 'cardioAssignments', 'cardioSessions', 'cardioWeeklyGoals',
  'hrTests', 'hrvReadings', 'aiChats', 'aiProposals',
];

const CAMPOS_PROPIETARIO = ['userId', 'athleteId', 'email'];

// Prefijos de Storage. El bucket organiza por email, igual que storage.rules.
export const PREFIJOS_STORAGE = ['progressPhotos', 'gymPhotos', 'questionnaireMedia'];

// Colecciones del CRM que se anonimizan, con el campo que apunta al cliente.
export const CRM_A_ANONIMIZAR: Array<{ coleccion: string; campos: string[] }> = [
  { coleccion: 'crmServicios',     campos: ['clientId'] },
  { coleccion: 'crmPagos',         campos: ['clientId'] },
  { coleccion: 'crmSuscripciones', campos: ['clientId'] },
  { coleccion: 'crmReuniones',     campos: ['clientId'] },
];

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

  const etiquetaAnonima = `borrado_${randomBytes(6).toString('hex')}`;
  const resumen = { documentos: 0, ficheros: 0, crmAnonimizados: 0 };

  try {
    const writer = adminDb.bulkWriter();
    // Un documento que falla tres veces se abandona en vez de tumbar el borrado
    // entero: es preferible dejar un resto y avisar, a dejar a medias los otros
    // 500 y que la persona se quede con casi todo su historial dentro.
    const fallidos: string[] = [];
    writer.onWriteError(err => {
      if (err.failedAttempts < 3) return true;
      fallidos.push(`${err.documentRef.path}: ${err.message}`);
      return false;
    });

    // ── 1. Colecciones indexadas por email ──────────────────────────────────
    for (const coleccion of POR_ID_EMAIL) {
      writer.delete(adminDb.collection(coleccion).doc(email));
      resumen.documentos++;
    }

    // ── 2. Colecciones indexadas por campo ──────────────────────────────────
    for (const coleccion of POR_CAMPO) {
      const vistos = new Set<string>();
      for (const campo of CAMPOS_PROPIETARIO) {
        const valor = campo === 'email' ? email : uid;
        let snap;
        try {
          snap = await adminDb.collection(coleccion).where(campo, '==', valor).get();
        } catch (err) {
          // Un campo que no existe en esa colección no es un error: simplemente
          // no hay nada que borrar por esa vía.
          console.warn(`delete-account: ${coleccion}.${campo} no consultable:`, (err as Error).message);
          continue;
        }
        for (const d of snap.docs) {
          if (vistos.has(d.id)) continue;
          vistos.add(d.id);
          writer.delete(d.ref);
          resumen.documentos++;
        }
      }
    }

    // ── 3. Perfil: se anonimiza, no se borra ────────────────────────────────
    // Se conserva el documento sin un solo dato personal, porque el cuadro de
    // mandos cuenta altas, bajas y permanencia sobre él: borrarlo entero
    // reescribiría el histórico del negocio. Lo que queda —fecha de alta, fecha
    // y motivo de baja, canal de captación— no permite identificar a nadie.
    writer.set(
      adminDb.collection('user_profiles').doc(uid),
      {
        userId: uid,
        displayName: etiquetaAnonima,
        email: `${etiquetaAnonima}@anonimo.local`,
        role: 'client',
        anonimizado: true,
        anonimizadoEn: new Date().toISOString(),
        estadoCrm: 'baja',
      },
      { merge: false } // reemplazo total: nada del documento anterior sobrevive
    );
    resumen.documentos++;

    // ── 4. CRM: anonimizar conservando importes y fechas ────────────────────
    for (const { coleccion, campos } of CRM_A_ANONIMIZAR) {
      const vistos = new Set<string>();
      for (const campo of campos) {
        for (const valor of [uid, email]) {
          let snap;
          try {
            snap = await adminDb.collection(coleccion).where(campo, '==', valor).get();
          } catch {
            continue;
          }
          for (const d of snap.docs) {
            if (vistos.has(d.id)) continue;
            vistos.add(d.id);
            writer.update(d.ref, { clientNombre: etiquetaAnonima, anonimizado: true });
            resumen.crmAnonimizados++;
          }
        }
      }
    }

    // `crmContactos` es el único del CRM con datos personales propios (y no solo
    // el nombre denormalizado): email, DNI, dirección, teléfono y notas.
    const vistosContactos = new Set<string>();
    for (const [campo, valor] of [['userId', uid], ['email', email]] as const) {
      let snap;
      try {
        snap = await adminDb.collection('crmContactos').where(campo, '==', valor).get();
      } catch {
        continue;
      }
      for (const d of snap.docs) {
        if (vistosContactos.has(d.id)) continue;
        vistosContactos.add(d.id);
        const { FieldValue } = await import('firebase-admin/firestore');
        writer.update(d.ref, {
          nombre: etiquetaAnonima,
          email: FieldValue.delete(),
          dni: FieldValue.delete(),
          direccion: FieldValue.delete(),
          telefono: FieldValue.delete(),
          notas: FieldValue.delete(),
          userId: FieldValue.delete(),
          anonimizado: true,
          anonimizadoEn: new Date().toISOString(),
        });
        resumen.crmAnonimizados++;
      }
    }

    await writer.close();
    if (fallidos.length) {
      console.error('delete-account: documentos que no se pudieron borrar:', fallidos);
    }

    // ── 5. Storage ──────────────────────────────────────────────────────────
    try {
      const { getStorage } = await import('firebase-admin/storage');
      const { getApps } = await import('firebase-admin/app');
      const bucket = getStorage(getApps()[0]).bucket(`${PROJECT_ID}.firebasestorage.app`);
      for (const prefijo of PREFIJOS_STORAGE) {
        const [ficheros] = await bucket.getFiles({ prefix: `${prefijo}/${email}/` });
        resumen.ficheros += ficheros.length;
        await bucket.deleteFiles({ prefix: `${prefijo}/${email}/`, force: true });
      }
    } catch (err) {
      // Que falle Storage no debe impedir el borrado de la cuenta: los ficheros
      // quedan huérfanos y sin ninguna regla que permita leerlos (storage.rules
      // exige ser el dueño autenticado, y ese usuario está a punto de dejar de
      // existir), pero se registra para poder limpiarlos a mano.
      console.error('delete-account: fallo borrando Storage de', email, err);
    }

    // ── 6. La cuenta de acceso, al final ────────────────────────────────────
    await adminAuth.deleteUser(uid);

    console.info('delete-account: completado', { etiquetaAnonima, ...resumen, restos: fallidos.length });
    res.status(200).json({ ok: true, ...resumen, restos: fallidos.length });
  } catch (err) {
    console.error('delete-account: error no recuperable:', err);
    res.status(500).json({
      error: 'No se pudo completar el borrado. No se ha eliminado tu cuenta: inténtalo de nuevo o escribe a Dani.',
    });
  }
}
