// Verificación de identidad compartida por las funciones de api/.
//
// Vercel ignora en el enrutado todo lo que empiece por `_`, así que este fichero
// es un módulo, no un endpoint. Vive aquí para que haya UNA sola definición de
// «quién es el coach» y de cómo se valida un ID token: son dos cosas que, si se
// duplican, acaban divergiendo justo en el sitio donde no puedes permitírtelo.
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const COACH_EMAIL = 'danitrviner@gmail.com';
export const PROJECT_ID = 'fleet-operator-z5xj8';
export const FIRESTORE_DATABASE_ID = 'ai-studio-b38fc63b-000e-4d2c-b774-20351883e870';

// Verificación manual del ID token de Firebase con `jose` en vez de
// firebase-admin/auth: esa vía depende de jwks-rsa, que intenta un require()
// CJS de `jose` (ESM-only) y revienta con ERR_REQUIRE_ESM en el runtime de
// Vercel. La verificación manual sigue el esquema documentado por Firebase
// (JWKS público de Google + comprobación de iss/aud/exp) sin esa dependencia rota.
// OJO con esta URL. La que había aquí antes —.../service_accounts/v1/jwk/
// securetoken@system.google.com— devuelve 404: ni el dominio de la cuenta de
// servicio ni la ruta son los correctos. El efecto era que jose no podía
// descargar NUNCA las claves públicas, así que TODOS los tokens se rechazaban
// con "Token inválido o caducado" aunque fueran perfectamente válidos. La buena
// es `/robot/v1/metadata/jwk/` con el dominio `@system.gserviceaccount.com`,
// que es la que documenta Firebase para verificar ID tokens.
const JWKS_URL = 'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com';
const FIREBASE_JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface TokenVerificado {
  uid: string;
  email: string;
  emailVerified: boolean;
  /**
   * Momento del inicio de sesión, en milisegundos. Va firmado dentro del propio
   * token, así que el cliente no puede falsearlo. Lo usa el borrado de cuenta
   * para exigir que la contraseña se haya introducido hace poco.
   */
  authTimeMs: number;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<TokenVerificado | null> {
  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now()) return null;
    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      // 04-11. El email por sí solo no prueba nada: Firebase Auth deja registrar
      // una cuenta con cualquier dirección sin comprobarla. Es la misma condición
      // que exigen firestore.rules y storage.rules.
      emailVerified: payload.email_verified === true,
      authTimeMs: typeof payload.auth_time === 'number' ? payload.auth_time * 1000 : 0,
    };
  } catch (err) {
    // Este catch estaba vacío, y con él un 401 no dejaba ni rastro de POR QUÉ:
    // desde fuera es indistinguible un token caducado de un `aud` que no
    // cuadra o de un JWKS que no se pudo descargar. Se registra el motivo (no
    // el token) para que el log sirva de algo.
    console.warn('verifyFirebaseIdToken rechazó el token:', (err as Error)?.message ?? err);
    return null;
  }
}

/** `true` solo para el coach, y solo con el correo verificado. */
export function esCoach(token: TokenVerificado | null): boolean {
  return !!token && token.email.toLowerCase() === COACH_EMAIL && token.emailVerified;
}

/**
 * Extrae el ID token de la cabecera `Authorization: Bearer …`.
 */
export function tokenDeLaCabecera(authorization: string | undefined): string | null {
  const h = authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// 04-12. Antes se reflejaba el Origin recibido, que es lo mismo que no tener
// CORS. ALLOWED_ORIGINS_EXTRA permite añadir el dominio definitivo desde las
// variables de entorno de Vercel sin tocar código, separado por comas.
const ALLOWED_ORIGINS = new Set([
  'https://en-forma-ivory.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  // Origen del WebView de Capacitor: en nativo el front no corre en https.
  'capacitor://localhost',
  'ionic://localhost',
  ...(process.env.ALLOWED_ORIGINS_EXTRA ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
]);

export function setCors(
  origin: string | undefined,
  setHeader: (k: string, v: string) => void,
  methods = 'POST, OPTIONS'
) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    setHeader('Access-Control-Allow-Origin', origin);
  }
  // Vary siempre, esté permitido o no: si no, una CDN puede cachear la respuesta
  // de un origen y servírsela a otro.
  setHeader('Vary', 'Origin');
  setHeader('Access-Control-Allow-Methods', methods);
  setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

/** Firestore admin. Devuelve null si no hay cuenta de servicio configurada. */
export async function getAdminDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  return getFirestore(app, FIRESTORE_DATABASE_ID);
}

/** Auth admin. Devuelve null si no hay cuenta de servicio configurada. */
export async function getAdminAuth() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID });
  return getAuth(app);
}
