import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

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
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  }, FIRESTORE_DB_ID);
} catch {
  db = getFirestore(app, FIRESTORE_DB_ID);
}
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// App Check (reCAPTCHA v3): corta el uso de la API key fuera de esta app una
// vez se active "Enforce" en la consola Firebase para Firestore/Storage. Sin
// VITE_RECAPTCHA_SITE_KEY configurada (dev local, o antes de crear el site
// key en la consola) simplemente no se inicializa — no rompe nada mientras
// tanto. Pasos manuales pendientes en la consola de Firebase: registrar un
// site key reCAPTCHA v3 para este dominio en App Check, añadir
// VITE_RECAPTCHA_SITE_KEY a .env.local y a las env vars de Vercel, y solo
// entonces activar "Enforce" para Firestore y Storage.
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
if (RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// Analytics: hoy no está activado (measurementId vacío en
// firebase-applet-config.json, Analytics nunca se habilitó para este
// proyecto en la consola). En cuanto se active ahí y se rellene el
// measurementId, esto empieza a mandar eventos solo; hasta entonces no hace
// nada. `isSupported()` evita el intento en entornos sin IndexedDB/cookies
// (por ejemplo, algunos navegadores en modo incógnito).
if (firebaseConfig.measurementId) {
  isAnalyticsSupported().then(supported => { if (supported) getAnalytics(app); }).catch(() => {});
}

export {
  app,
  db,
  auth,
  storage,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  onSnapshot
};
export default app;
