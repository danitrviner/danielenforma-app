import { db, auth, onAuthStateChanged } from '../firebase';

// Recursively remove keys whose value is undefined before sending to Firestore.
// Firestore rejects documents containing undefined values.
export function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(stripUndefined) as unknown as T;
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return obj;
}

// Resolves once Firebase confirms a signed-in user (skips the null firing).
// Awaiting this before Firestore calls ensures the auth token has been accepted.
export const authReady: Promise<void> = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    if (user) { unsub(); resolve(); }
  });
});

// Retries fn once with a 400 ms delay when Firestore returns permission-denied
// while auth.currentUser is already set — handles the lag between onAuthStateChanged
// firing and the auth token arriving in Firestore's request headers.
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if ((err?.code === 'permission-denied' || err?.code === 'unauthenticated') && auth.currentUser) {
      await new Promise(r => setTimeout(r, 400));
      return await fn();
    }
    throw err;
  }
}

// Let's have a state flag for Local Storage fallback
// Session-only flag: never persisted to localStorage.
// Each page load starts fresh and tries Firestore. Bypass only activates
// if Firestore is unreachable THIS session.
// Exported directly (not just via the getter/setter below) so every domain
// file can `import { forceLocalOnly } from './core'` and read it with a live
// ES module binding — a `setLocalBypassMode` call anywhere is visible
// everywhere without needing to route every read through a function call.
export let forceLocalOnly = false;

try {
  if (typeof window !== 'undefined') {
    // Clear any stale bypass flag left by older builds
    localStorage.removeItem('enforma_use_local_fallback');
  }
} catch (e) {}

/**
 * Último error de Firestore que provocó una caída a local, tal cual. Lo lee
 * `mensajeDeErrorFirestore` para poder decir la verdad en pantalla en vez de
 * "revisa tu conexión" (hallazgo P1-6 de la auditoría visual).
 */
export let ultimoErrorFirestore: unknown = null;

/**
 * Un fallo de permisos NO es un fallo de red.
 *
 * La distinción importa porque el modo local existe para una sola cosa:
 * sobrevivir a que Firestore no esté accesible, encolando lo que el usuario
 * haga hasta que vuelva. Ante un `permission-denied` eso es justo lo contrario
 * de lo que hay que hacer — la escritura no se va a sincronizar nunca, por
 * mucho que se reintente, y guardarla en localStorage solo sirve para que el
 * usuario crea que sus datos están a salvo cuando no lo están.
 */
export function esFalloDePermisos(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'permission-denied' || code === 'unauthenticated';
}

/**
 * Activa el modo local. `err` es el error que lo provocó — pásalo siempre que
 * lo tengas.
 *
 * Con un error de permisos NO se activa, y ese es el arreglo de P0-2: una
 * lectura denegada de `user_profiles` ponía esta bandera a nivel de módulo y
 * bloqueaba TODAS las escrituras posteriores de la sesión, incluida la del
 * onboarding, con un mensaje de "sin conexión" que era mentira. Un atleta se
 * quedaba sin poder darse de alta y sin forma de saber por qué. La lectura que
 * falla sigue cayendo a su copia local (eso lo hace cada `catch` por su cuenta,
 * y está bien); lo que ya no hace es envenenar el resto de la sesión.
 */
export function setLocalBypassMode(enabled: boolean, err?: unknown) {
  if (!enabled) {
    forceLocalOnly = false;
    ultimoErrorFirestore = null;
    return;
  }
  ultimoErrorFirestore = err ?? ultimoErrorFirestore;
  if (err !== undefined && esFalloDePermisos(err)) return;
  forceLocalOnly = true;
}

export function isLocalBypassActive(): boolean {
  return forceLocalOnly;
}

/**
 * Hay un fallo de permisos vivo en esta sesión. No activa el modo local (ver
 * arriba), pero tampoco puede quedar en silencio: las escrituras que fallen por
 * esto se guardan solo en local y el usuario se cree que están a salvo. El aviso
 * de LocalModeBanner es distinto al de "sin conexión" porque el problema, la
 * causa y quién puede arreglarlo también lo son.
 */
export function hayFalloDePermisos(): boolean {
  return !forceLocalOnly && esFalloDePermisos(ultimoErrorFirestore);
}
