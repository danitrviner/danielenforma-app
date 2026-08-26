import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execSync} from 'child_process';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Identificador del despliegue, para que cada error que llega a Sentry diga en
 * qué versión exacta apareció (ver `src/monitorizacion.ts`).
 *
 * En Vercel viene dado en el entorno; en un build local se saca de git. Si no
 * hay ninguna de las dos —un tarball sin `.git`, por ejemplo— se degrada a
 * 'desconocida' en vez de romper el build: saber la versión es útil, pero no
 * tanto como poder compilar.
 */
function release(): string {
  const deVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (deVercel) return deVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', {stdio: ['ignore', 'pipe', 'ignore']})
      .toString()
      .trim();
  } catch {
    return 'desconocida';
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_RELEASE__: JSON.stringify(release()),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    // Las pruebas de `firestore.rules` corren contra el emulador, que necesita
    // Java y un puerto abierto: no pueden formar parte del `npm test` de todos
    // los días ni de un CI que no lo levante. Van aparte, con `npm run
    // test:reglas`, que arranca el emulador, las pasa y lo apaga.
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.emulador.test.ts'],
    },
    build: {
      rollupOptions: {
        output: {
          // Firebase y React viven en casi todas las rutas (login, App shell),
          // así que el navegador los cachea una vez en vez de re-descargarlos
          // dentro del chunk index en cada deploy.
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
