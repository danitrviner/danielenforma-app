import { db, auth, sendPasswordResetEmail, collection, doc, getDoc, getDocs, updateDoc, query, where } from '../firebase';
import { Invite } from '../types';
import { forceLocalOnly, setLocalBypassMode } from './core';
import { apiUrl } from './apiBase';

// ─── CLIENT INVITES (coach-only, doc id = email) ──────────────────────────────

const LOCAL_INVITES = 'enforma_invites_v1';

function getLocalInvites(): Invite[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_INVITES) || '[]'); } catch { return []; }
}
function saveLocalInvites(list: Invite[]): void {
  localStorage.setItem(LOCAL_INVITES, JSON.stringify(list));
}

const ENDPOINT_ALTA: string = apiUrl('/api/create-athlete');

/**
 * Da de alta a un atleta y le manda el correo para que cree su contraseña.
 *
 * Antes esto mandaba un enlace mágico (`sendSignInLinkToEmail`) y escribía el
 * documento de `invites` desde el cliente. Ese diseño tenía tres fallos, y los
 * tres se han eliminado de raíz al mover el alta al servidor:
 *
 *  1. Dependía de «Vínculo del correo electrónico», un ajuste de la consola que
 *     nunca se activó: fallaba con `auth/operation-not-allowed` para cualquier
 *     correo, así que NADIE podía darse de alta (B-9).
 *  2. El enlace no podía completarse dentro de la app nativa, porque no hay
 *     Universal Links ni escucha de deep link: se abría en Safari (B-5).
 *  3. El correo salía ANTES de escribir el documento de `invites`. Si esa
 *     escritura fallaba por permisos, la persona recibía el acceso y luego
 *     chocaba con un permission-denied al darse de alta, porque
 *     `firestore.rules` exige `exists(/invites/{email})`. El propio flujo de
 *     invitación servía el encierro de P0-2.
 *
 * Ahora el servidor crea la cuenta y escribe `invites` con el Admin SDK, que no
 * pasa por las reglas: o se hacen las dos cosas, o no se hace ninguna. Solo
 * cuando eso ha ido bien se pide el correo de contraseña.
 */
export async function inviteClient(email: string): Promise<Invite> {
  const normalized = email.trim().toLowerCase();

  // `true` fuerza renovar el token contra el servidor en vez de usar el que hay
  // en caché. Era el único de los tres endpoints que no lo hacía (cuenta.ts sí,
  // aiClient.ts reintenta con refresco ante un 401): un token cacheado que el
  // servidor rechaza produce un 401 indistinguible de "no has iniciado sesión",
  // y aquí es barato porque invitar no es una operación que se repita en bucle.
  const idToken = await auth.currentUser?.getIdToken(true);
  if (!idToken) {
    throw Object.assign(new Error('Tu sesión ha caducado. Vuelve a entrar.'), {
      code: 'unauthenticated',
    });
  }

  const respuesta = await fetch(ENDPOINT_ALTA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ email: normalized }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.json().catch(() => ({}));
    const delServidor = (detalle as { error?: string }).error;
    console.error(`create-athlete respondió ${respuesta.status}:`, delServidor ?? '(sin cuerpo)');
    // El servidor SÍ dice qué ha pasado ("Token inválido o caducado", "Solo el
    // coach puede dar de alta…", "falta FIREBASE_SERVICE_ACCOUNT…"). Antes se
    // descartaba ese texto y se sustituía por un genérico de "vuelve a
    // intentarlo", que además de no ayudar es un mal consejo cuando reintentar
    // no puede funcionar. Se conserva el motivo real y se marca con un código
    // aparte para no mapearlo al texto genérico.
    throw Object.assign(
      new Error(delServidor || 'No se pudo dar de alta al atleta.'),
      { code: delServidor ? 'invite/alta-rechazada' : 'invite/alta-fallida' }
    );
  }

  // La cuenta ya existe y la invitación está registrada. Este correo lo manda
  // Firebase con su propia plantilla, así que no hace falta ningún servicio de
  // envío contratado: al restablecer la contraseña, el atleta demuestra que
  // controla el buzón y elige una clave que no ha viajado nunca por correo.
  //
  // Si esto falla, el alta NO se deshace: la cuenta es válida y el coach puede
  // reenviar el correo con «volver a invitar». Por eso el error lo dice así.
  try {
    await sendPasswordResetEmail(auth, normalized);
  } catch (err) {
    console.error('sendPasswordResetEmail tras el alta falló:', err);
    throw Object.assign(
      new Error('La cuenta se creó, pero no salió el correo para crear la contraseña. Vuelve a invitarle.'),
      { code: 'invite/correo-fallido' }
    );
  }

  const invite: Invite = {
    id: normalized,
    email: normalized,
    invitedAt: new Date().toISOString(),
    status: 'pending',
  };
  saveLocalInvites([...getLocalInvites().filter(i => i.id !== normalized), invite]);
  return invite;
}

export async function getPendingInvites(): Promise<Invite[]> {
  if (forceLocalOnly) return getLocalInvites().filter(i => i.status === 'pending');
  try {
    const snap = await getDocs(query(collection(db, 'invites'), where('status', '==', 'pending')));
    const invites = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite));
    saveLocalInvites(invites);
    return invites;
  } catch (err) {
    console.warn('getPendingInvites Firestore failed, using local:', err);
    setLocalBypassMode(true, err);
    return getLocalInvites().filter(i => i.status === 'pending');
  }
}

// Best-effort: marks an invite as joined once the invited email actually
// creates its user_profiles doc. Never throws — must not block account creation.
export async function markInviteJoined(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  try {
    const snap = await getDoc(doc(db, 'invites', normalized));
    if (!snap.exists() || (snap.data() as Invite).status !== 'pending') return;
    await updateDoc(doc(db, 'invites', normalized), { status: 'joined', joinedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('markInviteJoined failed (non-blocking):', err);
  }
}

