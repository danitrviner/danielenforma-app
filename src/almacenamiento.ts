/* ═══════════════════════════════════════════════════════════════════════════
   Firebase Storage, cargado solo cuando se usa

   Storage son ~34 KB (8 KB comprimidos) del SDK de Firebase que hasta ahora
   viajaban en el arranque de TODO el mundo. Y casi nadie los necesita en ese
   momento: Storage solo entra en juego al subir una foto de progreso, un vídeo
   de respuesta a un cuestionario o la foto de una máquina del gimnasio. Un
   atleta que abre la app a registrar sus series no lo toca en toda la sesión, y
   el coach solo lo roza al revisar fotos.

   Por eso el módulo se carga con `import()` la primera vez que hace falta de
   verdad. La promesa se memoiza, así que dos subidas seguidas comparten la
   misma carga en vez de pedirla dos veces.

   Estas cuatro funciones son toda la superficie de Storage que usa la app
   (antes repartida entre `src/db/media.ts` y `src/db/machines.ts` como cinco
   importaciones sueltas de `storageRef`/`uploadBytes`/`getDownloadURL`/
   `deleteObject`). Trabajar con rutas en vez de con referencias deja el SDK
   entero detrás de esta frontera: ningún otro fichero vuelve a importar
   `firebase/storage`, que es justo lo que mantiene el arranque ligero.
   ═══════════════════════════════════════════════════════════════════════════ */

import { app } from './firebase';

type ModuloStorage = typeof import('firebase/storage');

let moduloPromesa: Promise<ModuloStorage> | null = null;

async function cargarStorage(): Promise<ModuloStorage> {
  moduloPromesa ??= import('firebase/storage');
  return moduloPromesa;
}

/** Referencia a un fichero por su ruta, con el SDK ya cargado. */
async function refDe(ruta: string) {
  const mod = await cargarStorage();
  return { mod, ref: mod.ref(mod.getStorage(app), ruta) };
}

/**
 * Sube un fichero y devuelve su URL pública de descarga.
 *
 * `datos` ya debe venir comprimido si procede: la compresión de imágenes vive
 * en quien llama (`compressImage`), porque depende de para qué es la foto.
 */
export async function subirArchivo(ruta: string, datos: Blob | File): Promise<string> {
  const { mod, ref } = await refDe(ruta);
  await mod.uploadBytes(ref, datos);
  return mod.getDownloadURL(ref);
}

/** URL pública de descarga de un fichero que ya está subido. */
export async function urlDeArchivo(ruta: string): Promise<string> {
  const { mod, ref } = await refDe(ruta);
  return mod.getDownloadURL(ref);
}

/**
 * Borra un fichero. No lanza si no existe: los sitios que llaman a esto están
 * borrando "lo que hubiera" antes de reemplazarlo o de borrar el documento de
 * Firestore asociado, y que el fichero ya no esté no es un error para ellos.
 */
export async function borrarArchivo(ruta: string): Promise<void> {
  try {
    const { mod, ref } = await refDe(ruta);
    await mod.deleteObject(ref);
  } catch {
    /* ya no estaba, o Storage no está accesible: quien llama sigue igual */
  }
}
