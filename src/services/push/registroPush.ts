import { Capacitor } from '@capacitor/core';
import { app, auth, db, doc, setDoc, deleteDoc } from '../../firebase';
import {
  aplazarHasta, esIOSPorAgente, estadoDeLaTarjeta, idDelTokenPush,
  type EntornoDeAvisos, type EstadoTarjetaAvisos, type PermisoDeAvisos,
} from '../../utils/avisosPush';

/* ═══════════════════════════════════════════════════════════════════════════
   Registro del dispositivo para las notificaciones push (fase 1: web) · 18-11

   Todo lo que toca el navegador: permiso, service worker, token de FCM y su
   documento en `pushTokens`. Las decisiones están en utils/avisosPush.ts.

   Reglas de la casa:
     · Nunca se pide permiso al arrancar: solo al pulsar «Activar» en la
       tarjeta del Inicio (o el interruptor de Ajustes).
     · Sin `VITE_FCM_VAPID_KEY`, sin soporte o en la app nativa: no hace nada
       y no rompe nada. La tarjeta ni sale.
     · El SDK de mensajería se carga con `import()` solo cuando hace falta: son
       kilobytes que el coach y quien no active los avisos no pagan.
   ═══════════════════════════════════════════════════════════════════════════ */

const RUTA_SW = '/firebase-messaging-sw.js';
/** El ámbito que usaría FCM por su cuenta: así el SW no controla la app. */
const AMBITO_SW = '/firebase-cloud-messaging-push-scope';

export function claveVapid(): string {
  return ((import.meta.env.VITE_FCM_VAPID_KEY as string | undefined) ?? '').trim();
}

// ── Lo que se recuerda en este dispositivo ────────────────────────────────────
// Prefijo `enforma_`: el cierre de sesión lo barre (utils/cierreDeSesion.ts).

interface EstadoLocal {
  /** Id del documento de su token en `pushTokens`. */
  tokenId?: string;
  token?: string;
  /** Última vez que se escribió el documento (ms), para no reescribirlo en cada visita. */
  guardadoEn?: number;
  /** Cuándo se activó en este dispositivo (ISO). */
  creadoEn?: string;
  desactivadoAMano?: boolean;
  aplazadoHasta?: number;
}

const claveLocal = (uid: string) => `enforma_push_${uid}`;

/**
 * El UID de Auth manda sobre el que pase la pantalla: `profile.userId` es el id
 * del documento de perfil, que en perfiles heredados no coincide con el UID, y
 * las escrituras de abajo siempre usan el de Auth.
 */
function uidActual(respaldo: string): string {
  return auth?.currentUser?.uid ?? respaldo;
}

export function leerEstadoLocal(uid: string): EstadoLocal {
  try { return JSON.parse(localStorage.getItem(claveLocal(uid)) || '{}') as EstadoLocal; } catch { return {}; }
}

function guardarEstadoLocal(uid: string, cambios: Partial<EstadoLocal>): void {
  try { localStorage.setItem(claveLocal(uid), JSON.stringify({ ...leerEstadoLocal(uid), ...cambios })); } catch { /* best-effort */ }
}

// ── El entorno ────────────────────────────────────────────────────────────────

function permisoActual(): PermisoDeAvisos {
  if (typeof Notification === 'undefined') return 'no_disponible';
  return Notification.permission as PermisoDeAvisos;
}

function estaInstalada(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

async function soportado(): Promise<boolean> {
  try {
    const { isSupported } = await import('firebase/messaging');
    return await isSupported();
  } catch { return false; }
}

export async function entornoDeAvisos(uid: string): Promise<EntornoDeAvisos> {
  const local = leerEstadoLocal(uidActual(uid));
  const nativa = Capacitor.isNativePlatform();
  const hayClave = claveVapid().length > 0;
  return {
    nativa,
    hayClave,
    // Sin clave ni se carga el SDK: la tarjeta va a salir oculta igual.
    soportado: !nativa && hayClave ? await soportado() : false,
    permiso: permisoActual(),
    esIOS: esIOSPorAgente(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    instalada: estaInstalada(),
    activo: !!local.tokenId,
    desactivadoAMano: !!local.desactivadoAMano,
    aplazadoHasta: local.aplazadoHasta ?? null,
    ahora: Date.now(),
  };
}

export async function estadoDeAvisos(uid: string): Promise<EstadoTarjetaAvisos> {
  return estadoDeLaTarjeta(await entornoDeAvisos(uid));
}

export function aplazarTarjeta(uid: string, estado: EstadoTarjetaAvisos): void {
  guardarEstadoLocal(uidActual(uid), { aplazadoHasta: aplazarHasta(estado, Date.now()) });
}

// ── Activar ───────────────────────────────────────────────────────────────────

export type ResultadoActivar = 'activado' | 'denegado' | 'sin_soporte' | 'error';

async function registrarSW(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(RUTA_SW, { scope: AMBITO_SW });
  // getToken necesita el SW ACTIVO; recién registrado puede estar instalándose.
  if (!reg.active) {
    await new Promise<void>(resolve => {
      const sw = reg.installing ?? reg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
      setTimeout(resolve, 5000);
    });
  }
  return reg;
}

async function guardarToken(token: string): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario?.email) throw new Error('Sin sesión');
  const tokenId = idDelTokenPush(usuario.uid, token);
  const local = leerEstadoLocal(usuario.uid);
  const ahora = new Date().toISOString();
  const creadoEn = local.tokenId === tokenId && local.creadoEn ? local.creadoEn : ahora;
  // Si el token del dispositivo cambió, el documento viejo sobra.
  if (local.tokenId && local.tokenId !== tokenId) {
    await deleteDoc(doc(db, 'pushTokens', local.tokenId)).catch(() => {});
  }
  await setDoc(doc(db, 'pushTokens', tokenId), {
    userId: usuario.uid,
    email: usuario.email.toLowerCase(),
    token,
    plataforma: 'web',
    creadoEn,
    ultimoUso: ahora,
  });
  guardarEstadoLocal(usuario.uid, { tokenId, token, guardadoEn: Date.now(), creadoEn, desactivadoAMano: false });
}

async function obtenerToken(): Promise<string> {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const reg = await registrarSW();
  return getToken(getMessaging(app), { vapidKey: claveVapid(), serviceWorkerRegistration: reg });
}

/**
 * Pide permiso y guarda el token. Llamar SOLO desde un toque del atleta:
 * Safari exige que `requestPermission` salga de un gesto, por eso es lo
 * primero que se hace, antes de cualquier `await`.
 */
export async function activarAvisos(): Promise<ResultadoActivar> {
  if (typeof Notification === 'undefined' || !claveVapid()) return 'sin_soporte';
  const permiso = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permiso !== 'granted') return 'denegado';
  try {
    if (!(await soportado())) return 'sin_soporte';
    await guardarToken(await obtenerToken());
    return 'activado';
  } catch (err) {
    console.warn('activarAvisos:', err);
    return 'error';
  }
}

// ── Mantener al día ───────────────────────────────────────────────────────────

const UN_DIA = 86_400_000;

/**
 * Al abrir el Inicio: si este dispositivo tiene los avisos activos, se pide el
 * token (barato: FCM lo devuelve de su caché) y se reescribe el documento si
 * cambió o si hace más de un día. Es la «fecha de último uso» del token: uno
 * que lleva meses sin moverse es de un móvil que ya no existe. Silencioso.
 */
export async function refrescarTokenSiActivo(): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario || !claveVapid() || Capacitor.isNativePlatform()) return;
  const local = leerEstadoLocal(usuario.uid);
  if (!local.tokenId || permisoActual() !== 'granted') return;
  try {
    if (!(await soportado())) return;
    const token = await obtenerToken();
    if (token !== local.token || Date.now() - (local.guardadoEn ?? 0) > UN_DIA) await guardarToken(token);
  } catch (err) {
    console.warn('refrescarTokenSiActivo:', err);
  }
}

// ── Desactivar ────────────────────────────────────────────────────────────────

/**
 * Apaga los avisos en este dispositivo: anula la suscripción en FCM y borra su
 * documento. `aMano` = lo pidió el atleta en Ajustes (no se le vuelve a
 * ofrecer la tarjeta); sin él es el cierre de sesión. Nunca lanza.
 */
export async function desactivarAvisos(aMano: boolean): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario) return;
  const local = leerEstadoLocal(usuario.uid);
  try {
    if (local.tokenId) await deleteDoc(doc(db, 'pushTokens', local.tokenId));
  } catch (err) {
    console.warn('desactivarAvisos (documento):', err);
  }
  try {
    if (local.tokenId && claveVapid()) {
      const { getMessaging, deleteToken } = await import('firebase/messaging');
      await deleteToken(getMessaging(app));
    }
  } catch (err) {
    console.warn('desactivarAvisos (FCM):', err);
  }
  guardarEstadoLocal(usuario.uid, { tokenId: undefined, token: undefined, guardadoEn: undefined, creadoEn: undefined, desactivadoAMano: aMano });
}

/** Para el cierre de sesión: no puede retrasarlo más de unos segundos. */
export async function olvidarEsteDispositivo(): Promise<void> {
  await Promise.race([desactivarAvisos(false), new Promise(r => setTimeout(r, 3000))]);
}
