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

/* ═══════════════════════════════════════════════════════════════════════════
   Escrituras con timeout · `05-2`

   Con `persistentLocalCache` activo (src/firebase.ts), la promesa de
   `addDoc`/`setDoc` NO resuelve hasta que el servidor confirma. Sin red no
   resuelve nunca **y tampoco lanza**: el `await` se queda colgado para siempre.
   En pantalla eso era un botón «Terminar sesión» en spinner indefinido, sin
   toast, sin celebración y sin error, hasta que el atleta mataba la app.

   El repo ya había resuelto esto, pero solo en `crm.ts` y para el dinero del
   coach; los otros 18 ficheros de `src/db/`, incluidos los que guardan el
   entrenamiento y el alta del atleta, se quedaron sin ello. Por eso vive aquí
   ahora: es infraestructura, no una particularidad del CRM.

   Importante: `EscrituraEncolada` NO es pérdida de dato. La mutación está en
   IndexedDB y Firestore la enviará sola al recuperar conexión. La UI debe
   decir «guardado, pendiente de sincronizar», nunca «error al guardar».
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Se lanza cuando una escritura no recibe confirmación del servidor a tiempo.
 * NO significa que se haya perdido: Firestore la tiene encolada en IndexedDB y
 * la enviará al recuperar conexión.
 */
export class EscrituraEncolada extends Error {
  constructor(operacion: string) {
    super(`«${operacion}» está guardado en este dispositivo pero aún no ha llegado al servidor. Se enviará solo al recuperar la conexión.`);
    this.name = 'EscrituraEncolada';
  }
}

const TIMEOUT_MS = 8000;

/** Escrituras que vencieron el plazo y siguen sin confirmar. Es un número real,
 *  no una estimación: `Promise.race` no cancela la promesa original, así que se
 *  sigue esperando a la de verdad y se descuenta cuando por fin llega. */
let pendientesDeSincronizar = 0;
const oyentesPendientes = new Set<() => void>();

function notificarPendientes(): void {
  for (const f of oyentesPendientes) f();
}

export function escriturasPendientes(): number {
  return pendientesDeSincronizar;
}

/** Suscripción para React (`useSyncExternalStore`). Devuelve la baja. */
export function suscribirEscriturasPendientes(oyente: () => void): () => void {
  oyentesPendientes.add(oyente);
  return () => { oyentesPendientes.delete(oyente); };
}

/**
 * Envuelve una escritura para que deje de esperar indefinidamente. Pasados
 * `TIMEOUT_MS` lanza `EscrituraEncolada`, pero **sigue esperando a la promesa
 * original por detrás** para poder descontarla del contador cuando sincronice.
 * Eso es lo que permite que el aviso de «pendiente de sincronizar» se apague
 * solo, sin que nadie tenga que sondear nada.
 */
export function conTimeout<T>(operacion: string, p: Promise<T>): Promise<T> {
  let vencida = false;

  // Se registra un manejador propio sobre `p` por dos motivos: descontar el
  // contador cuando la escritura llegue de verdad, y evitar el
  // «unhandled rejection» de una `p` que falle DESPUÉS de que la carrera ya se
  // haya resuelto por timeout.
  p.then(
    () => { if (vencida) { pendientesDeSincronizar--; notificarPendientes(); } },
    () => { if (vencida) { pendientesDeSincronizar--; notificarPendientes(); } },
  );

  let temporizador: ReturnType<typeof setTimeout>;
  const vencimiento = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => {
      vencida = true;
      pendientesDeSincronizar++;
      notificarPendientes();
      reject(new EscrituraEncolada(operacion));
    }, TIMEOUT_MS);
  });

  return Promise.race([p, vencimiento]).finally(() => clearTimeout(temporizador));
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

/**
 * Cierra el aviso de permisos.
 *
 * Hace falta porque `ultimoErrorFirestore` es una bandera de sesión que no se
 * limpia sola: la pone el PRIMER `permission-denied` que aparezca en cualquier
 * colección, y sin esto el aviso rojo se queda fijo el resto de la sesión
 * aunque todo lo demás funcione — sin botón para quitarlo, porque para un fallo
 * de permisos «Reintentar» no se ofrece a propósito.
 *
 * No arregla nada ni promete que se haya arreglado: solo reconoce que la
 * persona ya lo ha leído. Si el problema sigue vivo, la siguiente operación que
 * falle vuelve a ponerlo y el aviso reaparece — que es justo lo que debe pasar.
 */
export function descartarAvisoDePermisos(): void {
  if (esFalloDePermisos(ultimoErrorFirestore)) ultimoErrorFirestore = null;
}
