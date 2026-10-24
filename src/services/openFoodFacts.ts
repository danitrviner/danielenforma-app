import { apiUrl } from '../db/apiBase';
import { trozoDeCodigo } from '../utils/offBucket';
import { variantesDeCodigo } from '../utils/codigoBarras';
import { prepararIndiceOff, type EntradaIndiceOff, type OffRegistro } from '../utils/productoOff';

/* ═══════════════════════════════════════════════════════════════════════════
   Open Food Facts en local (D-04)

   Dos archivos estáticos que genera `scripts/generarOpenFoodFacts.mjs` y sirve
   Vercel desde `/off/`: el índice de nombres (los más escaneados de España) y
   1.000 trozos con todos los datos, repartidos por código. Ninguna consulta
   sale a Open Food Facts ni toca Firestore. En la app nativa los archivos no
   viajan en el paquete (`prepararBundleNativo.mjs`): se piden a producción.

   Datos de Open Food Facts (ODbL).
   ═══════════════════════════════════════════════════════════════════════════ */

export const ATRIBUCION_OFF = 'Datos de Open Food Facts (ODbL)';

/** El índice se pide una vez por sesión; si falla, la próxima vez se reintenta. */
export async function cargarIndiceOff(): Promise<EntradaIndiceOff[]> {
  const resp = await fetch(apiUrl('/off/indice.json'));
  if (!resp.ok) throw new Error(`Índice de productos: ${resp.status}`);
  const json = await resp.json() as { items: Array<[string, string, string]> };
  return prepararIndiceOff(json.items);
}

const trozos = new Map<number, Promise<Record<string, OffRegistro>>>();

/** Un registro por su código (completo o incompleto), o `null` si no está en la copia. */
export async function getProductoOff(codigo: string): Promise<OffRegistro | null> {
  const n = trozoDeCodigo(codigo);
  let trozo = trozos.get(n);
  if (!trozo) {
    trozo = fetch(apiUrl(`/off/p/${String(n).padStart(3, '0')}.json`)).then(r => {
      if (!r.ok) throw new Error(`Productos: ${r.status}`);
      return r.json() as Promise<Record<string, OffRegistro>>;
    });
    trozos.set(n, trozo);
    // Un fallo no se queda guardado: el siguiente intento vuelve a pedirlo.
    trozo.catch(() => trozos.delete(n));
  }
  return (await trozo)[codigo] ?? null;
}

/** Un producto a partir de un código leído o escrito, probando sus variantes (UPC-A → EAN-13…). */
export async function buscarProductoPorCodigo(codigo: string): Promise<OffRegistro | null> {
  for (const forma of variantesDeCodigo(codigo)) {
    const p = await getProductoOff(forma);
    if (p) return p;
  }
  return null;
}
