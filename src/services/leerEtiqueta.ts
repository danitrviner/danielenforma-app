import { auth } from '../firebase';
import { apiUrl } from '../db/apiBase';

/* ═══════════════════════════════════════════════════════════════════════════
   Leer una etiqueta con una foto (api/leer-etiqueta.ts)

   La foto se reduce en el móvil antes de mandarla: una de 12 MP pesa varios MB
   y para leer una tabla basta con 1600 px de lado. Lo que vuelve solo rellena
   el formulario; quien lo abre lo revisa antes de guardar.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LecturaEtiqueta {
  legible: boolean;
  nombre: string | null;
  unidad: 'g' | 'ml';
  kcal: number | null;
  hidratos: number | null;
  proteinas: number | null;
  grasas: number | null;
  soloPorRacion: boolean;
  aviso: string | null;
}

const LADO_MAX = 1600;

/** La foto como JPEG en base64 (sin la cabecera `data:`), con el lado largo a 1600 px como mucho. */
async function reducir(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se ha podido abrir la foto.'));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('No se ha podido preparar la foto.');
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lanza con un mensaje para enseñar tal cual si algo falla. */
export async function leerEtiqueta(archivo: File): Promise<LecturaEtiqueta> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Inicia sesión para leer la etiqueta.');
  const imagen = await reducir(archivo);
  let r: Response;
  try {
    r = await fetch(apiUrl('/api/leer-etiqueta'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await usuario.getIdToken()}` },
      body: JSON.stringify({ imagen, tipo: 'image/jpeg' }),
    });
  } catch {
    throw new Error('Sin conexión. Copia los datos a mano o inténtalo luego.');
  }
  const j = await r.json().catch(() => ({})) as Partial<LecturaEtiqueta> & { error?: string };
  if (!r.ok) throw new Error(j.error ?? 'No se ha podido leer la etiqueta.');
  return j as LecturaEtiqueta;
}
