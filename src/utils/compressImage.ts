// Redimensiona y recomprime una foto en el propio navegador antes de subirla.
// Una foto de móvil moderno pesa 4-8 MB — sin esto cada subida es lenta y el
// coste de Storage crece sin necesidad; a 1600px de lado más largo la foto
// sigue siendo perfectamente legible para comparar progreso físico.
export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // decodificación no soportada — sube el original tal cual

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}
