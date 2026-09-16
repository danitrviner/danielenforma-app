import { db, collection, doc, setDoc, getDocs, updateDoc, query, where, orderBy, limit } from '../firebase';
import { AppNotification } from '../types';
import { forceLocalOnly, setLocalBypassMode, stripUndefined, esFalloDePermisos, escribirEnLotes } from './core';
import { escribirLocal } from '../utils/almacenLocal';

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
    escribirLocal(NOTIF_LS, JSON.stringify(all));
  } catch { /* ignore */ }
}

/**
 * Cuántos avisos se traen como mucho.
 *
 * La campana ya enseñaba 40 —pero recortando en el NAVEGADOR, después de
 * descargarlos todos—. Un atleta con dos años de app acumula cientos de
 * documentos y los pagaba enteros cada vez que se abría la pantalla, para
 * tirar el 90 %. Con `orderBy` + `limit` el recorte lo hace Firestore y solo
 * viaja lo que se va a enseñar.
 *
 * 60 y no 40: quien llama sigue pudiendo recortar a su gusto, y un margen
 * evita tener que tocar esto si mañana la campana enseña más.
 */
export const TOPE_DE_AVISOS = 60;

export async function getNotifications(
  recipientEmail: string,
  tope: number = TOPE_DE_AVISOS,
): Promise<AppNotification[]> {
  const local = getLocalNotifs(recipientEmail);
  if (forceLocalOnly) {
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, tope);
  }
  try {
    let notifs: AppNotification[];
    try {
      const snap = await getDocs(query(
        collection(db, 'notifications'),
        where('recipientEmail', '==', recipientEmail),
        orderBy('createdAt', 'desc'),
        limit(tope),
      ));
      notifs = snap.docs.map(d => d.data() as AppNotification);
    } catch (errIndice) {
      // `orderBy` + `where` necesita un índice compuesto, y este código puede
      // desplegarse antes que el índice. Sin esta red, la campana se quedaría
      // VACÍA en cualquier dispositivo sin espejo local hasta que alguien se
      // acordara de desplegarlo — un fallo silencioso que se descubre por un
      // atleta preguntando por qué no le llega nada.
      //
      // La consulta de abajo es la de siempre: trae todo y recorta aquí. Es
      // cara, y por eso esto es una red y no el camino normal; en cuanto el
      // índice exista, no se vuelve a ejecutar.
      console.warn('getNotifications: sin índice compuesto todavía, se recorta en el cliente:', errIndice);
      const snap = await getDocs(
        query(collection(db, 'notifications'), where('recipientEmail', '==', recipientEmail)),
      );
      notifs = snap.docs.map(d => d.data() as AppNotification);
    }
    // Ordenar y recortar SIEMPRE, también tras el camino bueno: cuesta nada
    // sobre una lista ya ordenada y de 60, y así la red de seguridad de arriba
    // devuelve exactamente lo mismo que la consulta indexada en vez de una
    // lista sin orden y sin tope.
    notifs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    notifs = notifs.slice(0, tope);
    // El espejo local se REEMPLAZA por esta página, no se fusiona: es la más
    // reciente y es lo único que la campana enseña. Fusionar dejaría creciendo
    // en localStorage un histórico que ya nadie mira — y llenar localStorage
    // fue lo que tumbó Firestore en septiembre (ver project_fixes_sentry).
    setLocalNotifs(recipientEmail, notifs);
    return notifs;
  } catch (err) {
    console.warn('getNotifications Firestore failed, using local:', err);
    return local.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, tope);
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
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
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
    // En lote: eran N escrituras sueltas, y si fallaba la número 30 de 50 la
    // campana se quedaba con 20 sin leer y el coach ya había visto el 0.
    await escribirEnLotes(
      snap.docs.map(d => ({ tipo: 'update' as const, ref: d.ref, datos: { read: true } })),
      'Marcar notificaciones como leídas',
    );
  } catch (err) {
    console.warn('markAllNotificationsRead Firestore failed:', err);
    setLocalBypassMode(true, err);
    if (esFalloDePermisos(err)) throw err;
  }
}

