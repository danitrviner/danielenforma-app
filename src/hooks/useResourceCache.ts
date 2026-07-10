import { useEffect, useState } from 'react';

// Tiny in-memory, per-session cache so multiple components mounted at the same
// time (or in quick succession) that ask for the same key share one Firestore
// read instead of each firing its own — this is the mechanism behind
// useAthleteWeight/useAdherence. Not persisted across reloads; that's fine,
// dbService's own local-storage mirror already covers the offline case.
const cache = new Map<string, { promise: Promise<unknown>; value?: unknown; error?: unknown }>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach(fn => fn());
}

export function invalidateResource(key: string): void {
  cache.delete(key);
  notify(key);
}

export function useResourceCache<T>(key: string | null, fetcher: () => Promise<T>): { data: T | null; loading: boolean } {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!key) return;
    if (!cache.has(key)) {
      const entry: { promise: Promise<unknown>; value?: unknown; error?: unknown } = {
        promise: fetcher()
          .then(value => { entry.value = value; notify(key); })
          .catch(error => { entry.error = error; notify(key); }),
      };
      cache.set(key, entry);
    }
    const rerender = () => forceRender(n => n + 1);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(rerender);
    return () => { listeners.get(key)?.delete(rerender); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { data: null, loading: false };
  const entry = cache.get(key);
  if (!entry) return { data: null, loading: true };
  return { data: (entry.value as T) ?? null, loading: entry.value === undefined && entry.error === undefined };
}
