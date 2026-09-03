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
//   4. del rastro comercial conserva SOLO lo que es documentación de una
//      operación —los servicios contratados y sus cobros—, anonimizado: la ley
//      obliga a guardarlo, y `firestore.rules:626` ya prohíbe borrar un pago en
//      estado `pagado`. Se sustituye el nombre por una etiqueta sin datos
//      personales y se conservan importes y fechas. Todo lo demás (perfil,
//      contacto del CRM, suscripciones y reuniones) se BORRA.
//
//      03-09: antes el perfil y el contacto se quedaban anonimizados, y el
//      coach veía DOS filas «borrado_a1b2c3» por cada cuenta eliminada, sin
//      poder quitarlas de en medio. No aportaban nada que no esté ya en los
//      cobros conservados: una regla de renovación o una reunión con alguien
//      que ya no está tampoco. Coste asumido a propósito: las bajas por
//      borrado de cuenta dejan de contar en «Bajas (30 días)» y en el churn
//      por graduación del resumen.
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
import { marcarCatalogosCambiados } from './_lib/catalogos.js';

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
  'hrTests', 'hrvReadings', 'aiChats', 'aiProposals', 'coachDayNotes',
];

const CAMPOS_PROPIETARIO = ['userId', 'athleteId', 'email'];

// Prefijos de Storage. El bucket organiza por email, igual que storage.rules.
export const PREFIJOS_STORAGE = ['progressPhotos', 'gymPhotos', 'questionnaireMedia'];

// Colecciones del CRM que se CONSERVAN anonimizadas: son la documentación de
// una operación comercial (qué se contrató y qué se cobró), que hay obligación
// de guardar. Solo se les quita el nombre.
export const CRM_A_ANONIMIZAR: Array<{ coleccion: string; campos: string[] }> = [
  { coleccion: 'crmServicios', campos: ['clientId'] },
  { coleccion: 'crmPagos',     campos: ['clientId'] },
];

// Colecciones del CRM que se BORRAN. Una suscripción es la regla de que a
// alguien le vuelva a tocar pagar, y una reunión es una cita: ninguna de las
// dos es documentación de nada ya ocurrido, y conservarlas solo deja al coach
// renovaciones y citas de gente que ya no existe.
export const CRM_A_BORRAR: Array<{ coleccion: string; campos: string[] }> = [
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

  // Legible a propósito: esta etiqueta ya no nombra a una persona en ninguna
  // lista —el perfil y el contacto se borran—, solo encabeza los cobros
  // conservados. «borrado_a1b2c3d4e5f6» ahí parecía un fallo de la app; el
  // sufijo corto es lo justo para distinguir dos clientes eliminados entre sí
  // sin decir nada de ninguno de los dos.
  const etiquetaAnonima = `Cliente eliminado · ${randomBytes(2).toString('hex')}`;
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

    // ── 3. Perfil: se borra ─────────────────────────────────────────────────
    // Hasta 03-09 se conservaba anonimizado para que el cuadro de mandos
    // siguiera contando altas y bajas. En la práctica eso dejaba un
    // «borrado_a1b2c3» en la lista de clientes del coach —uno por cada cuenta
    // eliminada, imposible de quitar— a cambio de un histórico que ya se puede
    // reconstruir por los cobros conservados. Se borra.
    writer.delete(adminDb.collection('user_profiles').doc(uid));
    resumen.documentos++;

    // ── 4. CRM: lo que sí se conserva, anonimizado ──────────────────────────
    // Solo servicios y cobros: importes y fechas intactos, sin nombre.
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

    // ── 5. CRM: lo que no es documentación de una operación, se borra ───────
    for (const { coleccion, campos } of CRM_A_BORRAR) {
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
            writer.delete(d.ref);
            // Cuenta como CRM tocado: es lo que decide si se marcan los sellos
            // de catálogo al final, y borrar también tiene que verse.
            resumen.crmAnonimizados++;
          }
        }
      }
    }

    // `crmContactos` era el único del CRM con datos personales propios (y no
    // solo el nombre denormalizado): email, DNI, dirección, teléfono y notas.
    // Ya no se anonimiza: se borra. Anonimizarlo dejaba la SEGUNDA fila
    // fantasma de cada cuenta eliminada, y un contacto sin nombre, sin email,
    // sin teléfono y sin notas no es nada que el coach pueda usar.
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
        writer.delete(d.ref);
        resumen.crmAnonimizados++;
      }
    }

    await writer.close();
    if (fallidos.length) {
      console.error('delete-account: documentos que no se pudieron borrar:', fallidos);
    }

    // Las cinco colecciones del CRM se sirven desde la copia local del
    // dispositivo mientras su sello no cambie (src/db/catalogoVersionado.ts).
    // Esta anonimización la ha hecho el Admin SDK, que no pasa por ahí: sin
    // marcar el sello, el navegador del coach seguiría enseñando el nombre, el
    // DNI y el teléfono de quien acaba de pedir que lo borren. No es un ahorro
    // de lecturas lo que está en juego aquí, es que el borrado se vea.
    if (resumen.crmAnonimizados > 0) {
      await marcarCatalogosCambiados(adminDb, [
        ...CRM_A_ANONIMIZAR.map(c => c.coleccion),
        ...CRM_A_BORRAR.map(c => c.coleccion),
        'crmContactos',
      ]);
    }

    // ── 6. Storage ──────────────────────────────────────────────────────────
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

    // ── 7. La cuenta de acceso, al final ────────────────────────────────────
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
