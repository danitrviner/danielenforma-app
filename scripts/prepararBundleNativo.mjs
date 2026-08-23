/**
 * Quita del paquete nativo lo que solo tiene sentido en el navegador.
 *
 * `public/recetas/` son los 12 JSON del recetario en crudo: 21 MB que solo lee
 * el panel de importación del entrenador (`RecetasImportPanel`, en
 * CoachesScreen) para volcar el recetario a Firestore, y que en el móvil no los
 * abre nadie. Como todo lo que hay en `public/` acaba dentro del `.app` y del
 * `.apk`, cada atleta se estaba descargando e instalando esos 21 MB para nada.
 *
 * En web se quedan: es donde el entrenador usa ese panel, y ahí los ficheros se
 * sirven solo si alguien los pide, así que no le cuestan nada a nadie más.
 *
 * Lo que sí viaja en el móvil es `public/recetas-indice.json` — ése es el que
 * la app lee de verdad para listar recetas sin gastar lecturas de Firestore.
 *
 * Se ejecuta entre `vite build` y `cap sync` (ver `sync:native` en package.json).
 * Borra dentro de `dist/`, que es material generado: no toca `public/`.
 */

import { rmSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Solo material de origen del importador. El índice que consume la app NO entra
// aquí a propósito.
const FUERA_DEL_MOVIL = ['recetas'];

function pesoDe(ruta) {
  let total = 0;
  for (const entrada of readdirSync(ruta, { withFileTypes: true })) {
    const hijo = join(ruta, entrada.name);
    total += entrada.isDirectory() ? pesoDe(hijo) : statSync(hijo).size;
  }
  return total;
}

let ahorrado = 0;
for (const nombre of FUERA_DEL_MOVIL) {
  const ruta = resolve(__dirname, '../dist', nombre);
  if (!existsSync(ruta)) continue;
  ahorrado += pesoDe(ruta);
  rmSync(ruta, { recursive: true, force: true });
  console.log(`  – dist/${nombre} (solo web)`);
}

console.log(ahorrado > 0
  ? `✔ Paquete nativo aligerado en ${(ahorrado / 1024 / 1024).toFixed(1)} MB`
  : '✔ Nada que quitar del paquete nativo');
