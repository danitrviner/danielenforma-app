import type { QueryClient } from '@tanstack/react-query';

/* ═══════════════════════════════════════════════════════════════════════════
   La caché de React Query persistida es de UNA cuenta

   `main.tsx` guarda la caché de consultas en el localStorage bajo una clave
   fija, para que una recarga no vuelva a leerlo todo de Firestore. Pero la
   clave es del navegador, no de la persona: en este equipo conviven dos
   sesiones a diario —la cuenta de coach de Dani y el atleta de pruebas
   `atleta@enforma.com`—, así que la caché escrita por una quedaba disponible
   para la siguiente. Al entrar con la otra cuenta, React Query rehidrataba
   perfiles, dietas y entrenos ajenos y los pintaba antes de que llegara
   ninguna respuesta de Firestore.

   Se recuerda de quién es la caché y, si al iniciar sesión no coincide, se
   tira entera. Entrar desde otro ordenador NO se ve afectado: allí no hay
   caché que tirar, se descarga una vez y a partir de ahí va igual de rápido.

   Vive en su propio módulo y no en `main.tsx` a propósito: `main` importa
   `App`, así que si `App` importara de `main` habría un ciclo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const CLAVE_CACHE_CONSULTAS = 'enforma_query_cache_v1';
const CLAVE_DUENO_CACHE = 'enforma_query_cache_owner';

let clienteDeConsultas: QueryClient | null = null;

/** Lo llama `main.tsx` al crear el cliente. */
export function registrarClienteDeConsultas(cliente: QueryClient): void {
  clienteDeConsultas = cliente;
}

/** Tira la caché persistida si es de otra cuenta. `null` = sesión cerrada. */
export function asegurarCacheDeEstaCuenta(uid: string | null): void {
  try {
    if (localStorage.getItem(CLAVE_DUENO_CACHE) === uid) return;
    localStorage.removeItem(CLAVE_CACHE_CONSULTAS);
    clienteDeConsultas?.clear();
    if (uid) localStorage.setItem(CLAVE_DUENO_CACHE, uid);
    else localStorage.removeItem(CLAVE_DUENO_CACHE);
  } catch {
    // localStorage lleno o bloqueado (modo privado): sin caché persistida,
    // pero la app funciona igual — solo lee más de Firestore.
  }
}
