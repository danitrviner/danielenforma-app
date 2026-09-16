/* ═══════════════════════════════════════════════════════════════════════════
   COMPRIMIR UNA FOTO ANTES DE SUBIRLA.

   Las fotos de progreso se suben tal cual salen de la cámara: un móvil de hoy
   da 3–6 MB por foto y 4000 px de lado. Eso se paga tres veces —al subir (con
   los datos del atleta), al guardar, y otra vez cada vez que alguien las
   compara en pantalla— para enseñarlas en una columna de 300 px.

   1600 px de lado largo es de sobra para el uso real: comparar dos fotos a
   pantalla completa en un móvil. Con calidad 0,82 en JPEG, una foto de 4 MB
   baja a unos 250 KB sin que se note la diferencia en ese uso.

   ── Lo que NO hace ─────────────────────────────────────────────────────────
   Si algo falla —un formato que el navegador no sabe decodificar, un canvas
   bloqueado, una imagen ya pequeña— devuelve el fichero ORIGINAL. Subir la
   foto grande es peor que subir una pequeña, pero infinitamente mejor que no
   subir ninguna: esta es la pantalla donde el atleta documenta su progreso y
   fallar aquí en silencio le borra semanas de constancia.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lado largo máximo, en píxeles. */
export const LADO_MAXIMO = 1600;
/** Calidad JPEG. Por encima de 0,85 el tamaño sube mucho y no se ve mejor. */
export const CALIDAD = 0.82;

/** Cuánto tiene que bajar para que merezca la pena cambiar el fichero. */
const MEJORA_MINIMA = 0.9;

function medidasDestino(w: number, h: number, maximo: number): { w: number; h: number } {
  const lado = Math.max(w, h);
  if (lado <= maximo) return { w, h };
  const factor = maximo / lado;
  return { w: Math.round(w * factor), h: Math.round(h * factor) };
}

export async function comprimirImagen(
  file: File,
  maximo: number = LADO_MAXIMO,
  calidad: number = CALIDAD,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { w, h } = medidasDestino(bitmap.width, bitmap.height, maximo);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', calidad));
    if (!blob) return file;

    // Si apenas mejora, se queda el original: no tiene sentido recomprimir un
    // JPEG ya optimizado y perder calidad a cambio de nada.
    if (blob.size >= file.size * MEJORA_MINIMA) return file;

    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('No se pudo comprimir la foto, se sube tal cual:', err);
    return file;
  }
}
