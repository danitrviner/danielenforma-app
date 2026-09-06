// Build del banco de pruebas del motor de menús (carpeta `prototipo/`).
// Sale un solo archivo autónomo, sin red, para poder abrirlo en cualquier sitio.
// Aparte del build de la app a propósito: no lleva Tailwind ni Firebase.
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'prototipo'),
  build: {
    outDir: path.resolve(__dirname, 'prototipo/dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // todo dentro del HTML
    rollupOptions: {
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
});
