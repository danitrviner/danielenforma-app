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

export function setLocalBypassMode(enabled: boolean) {
  forceLocalOnly = enabled;
}

export function isLocalBypassActive(): boolean {
  return forceLocalOnly;
}
