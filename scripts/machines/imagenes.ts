import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Todas las fotos salen iguales: 640×480 WebP sobre blanco. El tamaño uniforme
// es requisito de la tarjeta del swipe (si cada foto trae su proporción, la pila
// de tarjetas baila al pasar de una a otra), y 640 de ancho cubre la tarjeta a
// 2× en cualquier móvil sin pasarse de peso.
export const ANCHO = 640;
export const ALTO = 480;

const DESTINO = path.resolve(process.cwd(), 'public/maquinas');

export async function descargarYOptimizar(id: string, url: string): Promise<{ ruta: string; bytes: number }> {
  await mkdir(DESTINO, { recursive: true });
  const salida = path.join(DESTINO, `${id}.webp`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const original = Buffer.from(await res.arrayBuffer());

  await sharp(original)
    .resize(ANCHO, ALTO, {
      fit: 'contain',
      // Las fotos de producto de ambas marcas vienen recortadas sobre blanco;
      // aplanar sobre blanco evita el halo gris de un PNG con transparencia.
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 78, effort: 6 })
    .toFile(salida);

  const { size } = await stat(salida);
  return { ruta: `/maquinas/${id}.webp`, bytes: size };
}

export async function escribirJson(destino: string, datos: unknown): Promise<void> {
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, JSON.stringify(datos, null, 2) + '\n', 'utf8');
}
