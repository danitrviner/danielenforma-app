import path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Config aparte para las pruebas de `firestore.rules`.
 *
 * vite.config.ts las excluye del `npm test` de todos los días porque necesitan
 * el emulador (y por tanto Java) levantado. Aquí se hace lo contrario: se
 * incluyen SOLO ellas. No hace falta el plugin de React ni Tailwind — estas
 * pruebas no montan ningún componente, solo hablan con el emulador.
 *
 * Se usa desde `npm run test:reglas`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    include: ['src/**/*.emulador.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // El emulador arranca en frío: el primer contexto puede tardar.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
