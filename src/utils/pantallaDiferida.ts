import { lazy, type ComponentType } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Pantallas diferidas que sobreviven a un despliegue

   El fallo que motiva esto llegó a Sentry el 08-09 desde `/profile`:
   `TypeError: 'text/html' is not a valid JavaScript MIME type`.

   Pasa así. Las pantallas van en chunks aparte, con el hash del contenido en el
   nombre (`ProfileScreen-BqX6ROqo.js`). Cuando se despliega, los chunks nuevos
   tienen hashes nuevos y los viejos DESAPARECEN. Quien tuviera la app abierta
   desde antes —y con esta app eso es todo el mundo, porque nadie cierra la
   pestaña del móvil— sigue pidiendo el chunk viejo al cambiar de pantalla.
   Vercel no encuentra ese fichero, y como es una SPA responde con el index.html
   y un 200. El navegador esperaba JavaScript, recibe HTML, y revienta.

   Para el usuario es una pantalla en blanco al tocar una pestaña que siempre
   había funcionado. Y no se arregla solo: mientras no recargue, cada intento
   vuelve a pedir el mismo chunk que ya no existe.

   La solución es recargar, que es justo lo que trae la versión nueva. Lo único
   delicado es no montar un bucle de recargas si el fallo es otro (sin
   cobertura, el servidor caído), así que se recarga UNA vez por sesión y por
   pantalla: si tras recargar vuelve a fallar, el error sube al ErrorBoundary y
   se ve como cualquier otro.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Marca de «a esta pantalla ya le di una segunda oportunidad». Va en
 *  sessionStorage y no en memoria, porque la recarga se lleva la memoria. */
function claveDeReintento(nombre: string): string {
  return `enforma_rechunk_${nombre}`;
}

/**
 * Un fallo de carga de chunk, no un error de dentro del módulo.
 *
 * Cada navegador lo dice a su manera, así que se buscan las formas conocidas en
 * vez de intentar una regla general: Chrome habla del MIME type, Firefox y
 * Safari de que no se pudo importar el módulo, y Vite tiene su propio aviso.
 */
function esChunkQueYaNoExiste(err: unknown): boolean {
  const mensaje = err instanceof Error ? err.message : String(err);
  return /valid JavaScript MIME type/i.test(mensaje)
      || /Failed to fetch dynamically imported module/i.test(mensaje)
      || /error loading dynamically imported module/i.test(mensaje)
      || /Importing a module script failed/i.test(mensaje)
      || /Unable to preload CSS/i.test(mensaje);
}

/**
 * Como `React.lazy`, pero si el chunk ya no existe recarga la página una vez
 * para coger la versión desplegada.
 *
 * `nombre` identifica la pantalla en la marca de reintento; con que sea único
 * dentro de la app basta.
 */
export function pantallaDiferida<T extends ComponentType<never>>(
  nombre: string,
  cargar: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const modulo = await cargar();
      // Cargó bien: que un fallo futuro vuelva a tener su segunda oportunidad.
      try { sessionStorage.removeItem(claveDeReintento(nombre)); } catch { /* da igual */ }
      return modulo;
    } catch (err) {
      let yaReintentado = true; // sin sessionStorage, mejor no recargar nunca
      try {
        yaReintentado = sessionStorage.getItem(claveDeReintento(nombre)) === '1';
        if (!yaReintentado) sessionStorage.setItem(claveDeReintento(nombre), '1');
      } catch { /* modo privado: se cae al ErrorBoundary, que es lo de siempre */ }

      if (esChunkQueYaNoExiste(err) && !yaReintentado) {
        window.location.reload();
        // La recarga no es instantánea: esta promesa no debe resolver ni
        // rechazar mientras tanto, o React pintaría el error medio segundo
        // antes de que la página se vaya.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

/** Solo para los tests. */
export const _esChunkQueYaNoExiste = esChunkQueYaNoExiste;
