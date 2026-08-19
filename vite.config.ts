import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
