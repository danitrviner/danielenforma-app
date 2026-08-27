import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs as _getDocs,
  getDocsFromCache,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  writeBatch,
  runTransaction,
  waitForPendingWrites,
  onSnapshot,
  // 03-5. Cerrar sesión tiene que poder vaciar la caché persistente: ahí viven
  // peso, perímetros, cuestionarios, dietas y notas del coach del usuario que
  // se va. Ver utils/cierreDeSesion.ts.
  terminate,
  clearIndexedDbPersistence
} from 'firebase/firestore';
import type { Query, QuerySnapshot, DocumentData } from 'firebase/firestore';
// Un solo camino de acceso: correo y contraseña. Se han retirado
// GoogleAuthProvider / signInWithPopup / signInWithRedirect / getRedirectResult
// (B-3 guideline 4.8 y B-4 popup imposible en WKWebView) y el trío del enlace
// mágico sendSignInLinkToEmail / isSignInWithEmailLink / signInWithEmailLink
// (B-5 sin Universal Links, B-9 ajuste de consola nunca activado). Las cuentas
// las crea el coach desde api/create-athlete.ts y el atleta elige su contraseña
// desde el correo que manda Firebase, así que createUserWithEmailAndPassword
// tampoco pinta nada aquí: no hay autorregistro.
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  // Reautenticación para el borrado de cuenta: una acción irreversible no puede
  // depender solo de que el móvil esté desbloqueado.
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const FIRESTORE_DB_ID = 'ai-studio-b38fc63b-000e-4d2c-b774-20351883e870';
// Caché local persistente con soporte multi-pestaña: da lecturas instantáneas
// desde caché y, sobre todo, encola las escrituras offline y las reenvía sola
// al recuperar conexión — antes un error transitorio de Firestore hacía que
// toda la sesión cayera a un fallback de localStorage sin resincronización
// (lo que el atleta registrara offline no le llegaba nunca al coach). El
// try/catch cubre el caso de HMR en dev, donde este módulo puede reevaluarse
// dos veces para la misma app+base y `initializeFirestore` lanza si ya se
// llamó antes — en ese caso basta con recuperar la instancia ya creada.
// experimentalAutoDetectLongPolling: el transporte por defecto de Firestore
// (WebChannel, streaming) es conocido por colgarse en silencio dentro de un
// WKWebView — no lanza error, no rechaza, simplemente nunca resuelve. Esta
// opción prueba el streaming normal y cae a long-polling solo si hace falta,
// sin coste apreciable en la web de escritorio, donde sí funciona.
// (Se añadió persiguiendo el «se queda cargando» del simulador. NO era la
//  causa de aquello —lo era la persistencia de Auth, ver más abajo— pero es
//  un endurecimiento correcto por sí mismo para el WebView, así que se queda.)
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalAutoDetectLongPolling: true,
  }, FIRESTORE_DB_ID);
} catch {
  db = getFirestore(app, FIRESTORE_DB_ID);
}
// `getAuth()` resuelve la persistencia probando localStorage primero. Dentro
// del WKWebView de Capacitor el origen es `capacitor://localhost`, un esquema
// propio con el almacenamiento particionado, y ahí esa resolución se queda
// colgada: `signInWithEmailAndPassword` no resuelve NI rechaza nunca, así que
// el botón se queda en «Entrando…» para siempre y ningún `catch` se entera.
// En nativo hay que inicializar el auth a mano fijando IndexedDB como única
// persistencia — es lo que documentan tanto Firebase como Capacitor para este
// caso. En web se deja `getAuth()`, que allí funciona y respeta el
// comportamiento multi-pestaña de siempre.
const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);
// Storage NO se inicializa aquí a propósito: su SDK se carga bajo demanda
// desde src/almacenamiento.ts, que es el único sitio de la app que lo toca.
// Ver el comentario de cabecera de ese fichero.

// App Check (reCAPTCHA ENTERPRISE): corta el uso de la API key fuera de esta
// app una vez se active "Enforce" en la consola Firebase para
// Firestore/Storage. Sin VITE_RECAPTCHA_SITE_KEY configurada (dev local)
// simplemente no se inicializa — no rompe nada mientras tanto.
//
// Enterprise, no v3, y la diferencia no se ve en la clave: las dos empiezan
// por 6L y son indistinguibles a ojo. La app registrada en App Check
// (27-08-2026) es Enterprise, así que el proveedor tiene que ser
// ReCaptchaEnterpriseProvider. Con el de v3 el navegador conseguía el token de
// reCAPTCHA sin problema y era Firebase quien lo rechazaba al canjearlo, con
// un 400 "App not registered" que parecía un fallo de registro y no de
// proveedor. Si algún día se cambia la clave, hay que mirar en qué apartado de
// App Check está registrada antes de tocar esto.
// El SDK de App Check se carga con `import()` en vez de estáticamente: son
// ~20 KB que hoy viajan en el arranque de TODOS (coach y atleta) para no
// ejecutarse nunca, porque sin site key este bloque no entra.
//
// Cargarlo tarde tiene un peligro que no se ve hasta que se activa: App Check
// tiene que estar inicializado ANTES de la primera lectura de Firestore, o esa
// lectura sale sin token y, con "Enforce" activado, la rechaza el servidor. Por
// eso no basta con lanzarlo y olvidarse — se exporta esta promesa y `authReady`
// (src/db/core.ts) la espera antes de dejar pasar nada a Firestore.
//
// Sin site key resuelve al instante y no cuesta nada. Es el caso de hoy.
export const appCheckListo: Promise<void> = (async () => {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  if (!siteKey) return;
  try {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // Que no se pueda cargar App Check no debe dejar la app sin arrancar: sin
    // "Enforce" todo sigue funcionando, y con "Enforce" el error real lo dará
    // la primera lectura, que es donde se entiende.
    console.warn('App Check no se pudo inicializar:', err);
  }
})();

// Analytics: hoy no está activado (measurementId vacío en
// firebase-applet-config.json, Analytics nunca se habilitó para este
// proyecto en la consola). En cuanto se active ahí y se rellene el
// measurementId, esto empieza a mandar eventos solo; hasta entonces no hace
// nada. `isSupported()` evita el intento en entornos sin IndexedDB/cookies
// (por ejemplo, algunos navegadores en modo incógnito).
// Igual que App Check: el SDK se carga solo si de verdad se va a usar. Hoy
// `measurementId` está vacío, así que estos ~23 KB salían en cada arranque
// para nada. Analytics no es crítico para nada del funcionamiento, así que
// aquí sí basta con lanzarlo y olvidarse.
//
// OJO si algún día se rellena `measurementId`: Analytics escribe
// identificadores en el dispositivo y esta app tiene usuarios en España, así
// que activarlo sin pedir consentimiento antes es un problema de RGPD. Existe
// ya un patrón de consentimiento en la app para la IA
// (SolicitudConsentimientoIA.tsx) que se puede reutilizar.
if (firebaseConfig.measurementId) {
  import('firebase/analytics')
    .then(async ({ getAnalytics, isSupported }) => { if (await isSupported()) getAnalytics(app); })
    .catch(() => {});
}

// ── Contador de lecturas (Fase 8, plan de optimización) ────────────────────
// Sin esto, una regresión de cuota como la del 22-08 (ver
// db/catalogoVersionado.ts) se descubre otra vez cuando la app ya se ha
// caído a modo local. App.tsx vuelca `resumenLecturas()` a consola (dev) o
// como miga de pan de Sentry (prod) en cada cambio de pantalla, y llama a
// `reiniciarContadorLecturas()` — así el resumen es "lo que ha costado ESTA
// pantalla", no un total acumulado desde el arranque.
//
// Solo cuenta `getDocs` (consulta de colección): es la que paga por
// documento y la que causó el incidente. `getDoc` (1 documento) y
// `getDocsFromCache` (0 lecturas) no aportan nada a la alarma de cuota.
interface ContadorColeccion { coleccion: string; documentos: number; llamadas: number }
const contadoresLectura = new Map<string, ContadorColeccion>();

function registrarLectura(coleccion: string, documentos: number): void {
  const actual = contadoresLectura.get(coleccion) ?? { coleccion, documentos: 0, llamadas: 0 };
  actual.documentos += documentos;
  actual.llamadas += 1;
  contadoresLectura.set(coleccion, actual);
}

export function resumenLecturas(): ContadorColeccion[] {
  return Array.from(contadoresLectura.values()).sort((a, b) => b.documentos - a.documentos);
}

export function reiniciarContadorLecturas(): void {
  contadoresLectura.clear();
}

// Envuelve `getDocs` para contar sin tocar ninguno de los puntos de llamada
// de `db/*.ts` — todos lo importan de aquí, no directo de 'firebase/firestore'.
// El nombre de la colección sale de `snap.docs[0]` (API pública y estable,
// `DocumentReference.parent.path`); con 0 resultados no hay de dónde sacarlo,
// así que se cuenta como 'desconocida' — el propio 0 ya dice que esa consulta
// no ha costado nada de verdad.
async function getDocs<T = DocumentData>(q: Query<T>): Promise<QuerySnapshot<T>> {
  const snap = await _getDocs(q);
  registrarLectura(snap.docs[0]?.ref.parent.path ?? 'desconocida', snap.size);
  return snap;
}

export {
  app,
  db,
  auth,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  getDocsFromCache,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  writeBatch,
  runTransaction,
  waitForPendingWrites,
  onSnapshot,
  terminate,
  clearIndexedDbPersistence
};
export default app;
