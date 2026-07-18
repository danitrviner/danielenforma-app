import { db, auth, sendSignInLinkToEmail, collection, doc, getDoc, setDoc, getDocs, updateDoc, query, where } from '../firebase';
import { Invite } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

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
    setLocalBypassMode(true);
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
    setLocalBypassMode(true);
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

