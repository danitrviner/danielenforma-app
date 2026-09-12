import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _esChunkQueYaNoExiste } from './pantallaDiferida';

/* Lo que se prueba aquí es el discriminador, que es donde está el riesgo real:
   · de menos → el usuario se queda con la pantalla en blanco tras cada deploy
   · de más   → se recarga la app ante errores que no se arreglan recargando

   La recarga en sí (window.location.reload + la marca de un solo reintento) se
   prueba por el camino de `React.lazy`, que necesita montar un componente; no
   compensa un jsdom entero para eso cuando el riesgo vive en el `if`. */

describe('esChunkQueYaNoExiste', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('reconoce lo que dice cada navegador cuando el chunk ya no está', () => {
    const reales = [
      // Chrome — el que llegó a Sentry desde /profile
      new TypeError("'text/html' is not a valid JavaScript MIME type."),
      // Firefox
      new TypeError('error loading dynamically imported module'),
      // Safari
      new TypeError('Importing a module script failed.'),
      // Vite
      new Error('Failed to fetch dynamically imported module: /assets/ProfileScreen-BqX6ROqo.js'),
      new Error('Unable to preload CSS for /assets/ProfileScreen-abc.css'),
    ];
    for (const err of reales) {
      expect(_esChunkQueYaNoExiste(err), err.message).toBe(true);
    }
  });

  it('NO confunde un error de dentro del módulo con un chunk perdido', () => {
    // Estos no se arreglan recargando: recargar sería un bucle infinito con la
    // app inutilizable.
    const ajenos = [
      new TypeError("Cannot read properties of undefined (reading 'map')"),
      new RangeError('Invalid time value'),
      new Error('Missing or insufficient permissions.'),
      new Error('Network request failed'),
    ];
    for (const err of ajenos) {
      expect(_esChunkQueYaNoExiste(err), err.message).toBe(false);
    }
  });

  it('aguanta que lo que llegue no sea un Error', () => {
    expect(() => _esChunkQueYaNoExiste(undefined)).not.toThrow();
    expect(_esChunkQueYaNoExiste(undefined)).toBe(false);
    expect(_esChunkQueYaNoExiste('Failed to fetch dynamically imported module')).toBe(true);
  });
});
