import { db, collection, doc, setDoc, getDocs, updateDoc, query, where } from '../firebase';
import { AppNotification } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined } from './core';

// ── Notifications ─────────────────────────────────────────────────────────────

const NOTIF_LS = 'notifications_local';

function getLocalNotifs(recipientEmail: string): AppNotification[] {
  try {
    const all = JSON.parse(localStorage.getItem(NOTIF_LS) || '{}') as Record<string, AppNotification[]>;
    return all[recipientEmail] ?? [];
  } catch { return []; }
}

function setLocalNotifs(recipientEmail: string, notifs: AppNotification[]) {
  try {
    const all = JSON.parse(localStorage.getItem(NOTIF_LS) || '{}') as Record<string, AppNotification[]>;
    all[recipientEmail] = notifs;
    localStorage.setItem(NOTIF_LS, JSON.stringify(all));
  } catch { /* ignore */ }
}

export async function getNotifications(recipientEmail: string): Promise<AppNotification[]> {
  const local = getLocalNotifs(recipientEmail);
  if (forceLocalOnly) return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('recipientEmail', '==', recipientEmail))
    );
    const notifs = snap.docs.map(d => d.data() as AppNotification);
    notifs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setLocalNotifs(recipientEmail, notifs);
    return notifs;
  } catch (err) {
    console.warn('getNotifications Firestore failed, using local:', err);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function createNotificationDeduped(
  dedupeKey: string,
  data: Omit<AppNotification, 'id'>
): Promise<void> {
  const notif: AppNotification = { ...data, id: dedupeKey };

  // Local dedup — prevents repeat calls within the same session
  const local = getLocalNotifs(data.recipientEmail);
  if (local.some(n => n.id === dedupeKey)) return;
  setLocalNotifs(data.recipientEmail, [notif, ...local]);

  if (forceLocalOnly) return;

  try {
    // Blind setDoc — no pre-read. The deterministic ID already prevents duplicates.
    // If the doc already exists (e.g. from a prior session) and the caller lacks update
    // permission, Firestore will reject with PERMISSION_DENIED. That is expected and safe
    // to ignore: the notification already exists in Firestore.
    await setDoc(doc(db, 'notifications', dedupeKey), stripUndefined(notif));
  } catch {
    // Silent — doc may already exist and caller may lack update permission (by design).
  }
}

export async function markNotificationRead(id: string, recipientEmail: string): Promise<void> {
  const local = getLocalNotifs(recipientEmail);
  setLocalNotifs(recipientEmail, local.map(n => n.id === id ? { ...n, read: true } : n));
  if (forceLocalOnly) return;
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (err) {
    console.warn('markNotificationRead Firestore failed:', err);
    setLocalBypassMode(true);
  }
}

export async function markAllNotificationsRead(recipientEmail: string): Promise<void> {
  const local = getLocalNotifs(recipientEmail);
  setLocalNotifs(recipientEmail, local.map(n => ({ ...n, read: true })));
  if (forceLocalOnly) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'),
        where('recipientEmail', '==', recipientEmail),
        where('read', '==', false))
    );
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true })));
  } catch (err) {
    console.warn('markAllNotificationsRead Firestore failed:', err);
    setLocalBypassMode(true);
  }
}

