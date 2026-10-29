// Borrado completo de la cuenta de un atleta, compartido por dos puertas:
//   · api/delete-account.ts — el propio atleta, con reautenticación reciente
//   · api/gestionar-acceso.ts — el coach, desde la ficha del CRM
//
// Está aquí y no duplicado en cada endpoint porque son dos caminos hacia EL
// MISMO borrado, y la lista de qué se borra y qué se conserva tiene que ser una
// sola (`src/db/borradoCuenta.test.ts` la compara contra firestore.rules).
//
// Qué hace exactamente:
//   1. borra las colecciones del atleta, por doc-id y por campo
//   2. borra el perfil
//   3. del rastro comercial conserva SOLO lo que es documentación de una
//      operación —los servicios contratados y sus cobros—, anonimizado: la ley
//      obliga a guardarlo, y `firestore.rules` ya prohíbe borrar un pago en
//      estado `pagado`. Se sustituye el nombre por una etiqueta sin datos
//      personales y se conservan importes y fechas. Todo lo demás (contacto
//      del CRM, suscripciones y reuniones) se BORRA.
//   4. borra sus ficheros de Storage
//   5. borra el usuario de Firebase Auth, que es el último paso a propósito:
//      si algo falla antes, la persona todavía puede entrar y reintentar.
//
// 03-09: antes el perfil y el contacto se quedaban anonimizados, y el coach
// veía DOS filas «borrado_a1b2c3» por cada cuenta eliminada, sin poder
// quitarlas de en medio. No aportaban nada que no esté ya en los cobros
// conservados. Coste asumido a propósito: las bajas por borrado de cuenta dejan
// de contar en «Bajas (30 días)» y en el churn por graduación del resumen.
import { randomBytes } from 'node:crypto';
import { PROJECT_ID, type getAdminAuth, type getAdminDb } from './auth.js';
import { marcarCatalogosCambiados } from './catalogos.js';

type AdminAuth = NonNullable<Awaited<ReturnType<typeof getAdminAuth>>>;
type AdminDb = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

// Colecciones cuyo ID de documento ES el email del atleta.
export const POR_ID_EMAIL = [
  'onboarding', 'gimnasios', 'roadmaps', 'nutritionPrograms', 'athleteDietConfigs',
  'athleteNutritionConfigs', 'recipeFavorites', 'academyAccess', 'academyProgress',
  'athleteCardioProfile', 'invites', 'alimentosPersonales', 'athleteRecipeRules', 'decisionesPlan',
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
  'coachReports', 'cardioAssignments', 'cardioSessions', 'cardioWeeklyGoals', 'cardioAplazos', 'revisionProgreso',
  'hrTests', 'hrvReadings', 'aiChats', 'aiProposals', 'coachDayNotes', 'cambiosAtleta', 'lecturasEtiqueta',
  'contactos', 'mensajesCoach', 'planesSemanales',
  // El autopiloto: cada episodio lleva el email del atleta y su historial.
  'episodios',
];

const CAMPOS_PROPIETARIO = ['userId', 'athleteId', 'email'];

// Prefijos de Storage. El bucket organiza por email, igual que storage.rules.
export const PREFIJOS_STORAGE = ['progressPhotos', 'gymPhotos', 'questionnaireMedia', 'respuestasCoach'];

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

export interface ResumenBorrado {
  documentos: number;
  ficheros: number;
  crmAnonimizados: number;
  restos: number;
}

/**
 * Borra todo lo de un atleta.
 *
 * @param uids Los ids con los que pueden colgar sus datos: el UID de Auth y, si
 *   difiere, el id de su documento de `user_profiles` (un perfil heredado de un
 *   registro anterior vive bajo otro id — ver firestore.rules › esUsuarioDeLaApp).
 * @param authUid UID de Firebase Auth a eliminar al final, o undefined si la
 *   persona no tiene cuenta de acceso (un perfil huérfano).
 */
export async function borrarCuentaDeAtleta(
  adminAuth: AdminAuth,
  adminDb: AdminDb,
  { email, uids, authUid }: { email: string; uids: string[]; authUid?: string },
): Promise<ResumenBorrado> {
  const ids = [...new Set(uids.filter(Boolean))];
  // Legible a propósito: esta etiqueta ya no nombra a una persona en ninguna
  // lista —el perfil y el contacto se borran—, solo encabeza los cobros
  // conservados. «borrado_a1b2c3d4e5f6» ahí parecía un fallo de la app; el
  // sufijo corto es lo justo para distinguir dos clientes eliminados entre sí
  // sin decir nada de ninguno de los dos.
  const etiquetaAnonima = `Cliente eliminado · ${randomBytes(2).toString('hex')}`;
  const resumen = { documentos: 0, ficheros: 0, crmAnonimizados: 0 };

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

  // ── 1. Colecciones indexadas por email ────────────────────────────────────
  for (const coleccion of POR_ID_EMAIL) {
    writer.delete(adminDb.collection(coleccion).doc(email));
    resumen.documentos++;
  }

  // ── 2. Colecciones indexadas por campo ────────────────────────────────────
  for (const coleccion of POR_CAMPO) {
    const vistos = new Set<string>();
    for (const campo of CAMPOS_PROPIETARIO) {
      for (const valor of campo === 'email' ? [email] : ids) {
        let snap;
        try {
          snap = await adminDb.collection(coleccion).where(campo, '==', valor).get();
        } catch (err) {
          // Un campo que no existe en esa colección no es un error: simplemente
          // no hay nada que borrar por esa vía.
          console.warn(`borrarCuenta: ${coleccion}.${campo} no consultable:`, (err as Error).message);
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
  }

  // ── 3. Perfil: se borra ───────────────────────────────────────────────────
  for (const id of ids) {
    writer.delete(adminDb.collection('user_profiles').doc(id));
    resumen.documentos++;
  }

  // ── 4. CRM: lo que sí se conserva, anonimizado ────────────────────────────
  // Solo servicios y cobros: importes y fechas intactos, sin nombre.
  for (const { coleccion, campos } of CRM_A_ANONIMIZAR) {
    const vistos = new Set<string>();
    for (const campo of campos) {
      for (const valor of [...ids, email]) {
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

  // ── 5. CRM: lo que no es documentación de una operación, se borra ─────────
  for (const { coleccion, campos } of CRM_A_BORRAR) {
    const vistos = new Set<string>();
    for (const campo of campos) {
      for (const valor of [...ids, email]) {
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
  // No se anonimiza: se borra. Anonimizarlo dejaba la SEGUNDA fila fantasma de
  // cada cuenta eliminada.
  const vistosContactos = new Set<string>();
  const porContacto: Array<readonly [string, string]> = [
    ...ids.map(id => ['userId', id] as const),
    ['email', email] as const,
  ];
  for (const [campo, valor] of porContacto) {
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
    console.error('borrarCuenta: documentos que no se pudieron borrar:', fallidos);
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

  // ── 6. Storage ────────────────────────────────────────────────────────────
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
    console.error('borrarCuenta: fallo borrando Storage de', email, err);
  }

  // ── 7. La cuenta de acceso, al final ──────────────────────────────────────
  if (authUid) await adminAuth.deleteUser(authUid);

  console.info('borrarCuenta: completado', { etiquetaAnonima, ...resumen, restos: fallidos.length });
  return { ...resumen, restos: fallidos.length };
}
