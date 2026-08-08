import { db, auth, sendSignInLinkToEmail, collection, doc, getDoc, setDoc, getDocs, updateDoc, query, where } from '../firebase';
import { Invite } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos } from './core';

// ─── CLIENT INVITES (coach-only, doc id = email) ──────────────────────────────

const LOCAL_INVITES = 'enforma_invites_v1';

function getLocalInvites(): Invite[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_INVITES) || '[]'); } catch { return []; }
}
function saveLocalInvites(list: Invite[]): void {
  localStorage.setItem(LOCAL_INVITES, JSON.stringify(list));
}

// Sends the passwordless sign-in link (the actual "invite email", handled by
// Firebase Auth itself) and records the invite so the coach can see who's
// pending. Requires "Email link (passwordless sign-in)" enabled in the
// Firebase console — see WelcomeScreen.tsx for the receiving side.
export async function inviteClient(email: string): Promise<Invite> {
  const normalized = email.trim().toLowerCase();
  await sendSignInLinkToEmail(auth, normalized, {
    url: window.location.origin,
    handleCodeInApp: true,
  });
  const invite: Invite = {
    id: normalized,
    email: normalized,
    invitedAt: new Date().toISOString(),
    status: 'pending',
  };
  if (forceLocalOnly) {
    saveLocalInvites([...getLocalInvites().filter(i => i.id !== normalized), invite]);
    return invite;
  }
  try {
    await setDoc(doc(db, 'invites', normalized), stripUndefined(invite));
    saveLocalInvites([...getLocalInvites().filter(i => i.id !== normalized), invite]);
    return invite;
  } catch (err) {
    console.warn('inviteClient Firestore write failed (email was still sent):', err);
    setLocalBypassMode(true, err);
    // Ante permisos no se relanza `err` crudo —diría «no se pudo enviar» y el
    // correo SÍ salió, fuera del try— pero tampoco se puede devolver éxito.
    //
    // Perder el documento de `invites` no es cosmético: `firestore.rules` exige
    // `exists(/invites/{email})` para que el atleta pueda crear su perfil (línea
    // 65). Sin él, el enlace llega, el atleta entra... y choca contra un
    // permission-denied al darse de alta. Es exactamente el encierro de P0-2,
    // servido por el propio flujo de invitación.
    //
    // Tampoco se guarda la copia local: pintaría una fila en "Pendientes" que
    // solo existe en este navegador y que nunca va a reconciliarse.
    if (esFalloDePermisos(err)) {
      throw Object.assign(
        new Error('El correo se envió, pero la invitación no quedó registrada.'),
        { code: 'invite/registro-denegado' }
      );
    }
    saveLocalInvites([...getLocalInvites().filter(i => i.id !== normalized), invite]);
    return invite;
  }
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

