import { apiUrl } from '../db/apiBase';
import { trozoDeCodigo } from '../utils/offBucket';
import { variantesDeCodigo } from '../utils/codigoBarras';
import { prepararIndiceOff, productoDesdeApiOff, type EntradaIndiceOff, type OffRegistro, type ProductoApiOff } from '../utils/productoOff';
import type { PrefijosOff } from '../utils/offPalabras';
import { getProductoCorregido } from '../db/productosCorregidos';

/* ═══════════════════════════════════════════════════════════════════════════
   Open Food Facts en local (D-04)

   Archivos estáticos que generan `scripts/generarOpenFoodFacts.mjs` y
   `scripts/generarIndicePalabrasOff.mjs`, y que sirve Vercel desde `/off/`:
     · `indice.json`  los 30.000 más escaneados de España, para buscar al instante;
     · `p/NNN.json`   todos los productos, repartidos en 1.000 trozos por código;
     · `n/xxx.json`   todos los productos por las primeras letras de cada palabra.
   En la app nativa los archivos no viajan en el paquete
   (`prepararBundleNativo.mjs`): se piden a producción.

   Un código que no está en la copia se pregunta en directo a Open Food Facts
   (productos de fuera de España o recién dados de alta), desde el propio
   dispositivo: su API admite CORS y su límite es por IP, así que cada atleta
   tiene el suyo. Las correcciones del coach (`productosCorregidos`) mandan
   sobre las dos.

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

/** Pide un JSON una sola vez; un fallo no se queda guardado y el siguiente intento lo repite. */
function memoizar<K, V>(cache: Map<K, Promise<V>>, clave: K, pedir: () => Promise<V>): Promise<V> {
  let p = cache.get(clave);
  if (!p) {
    p = pedir();
    cache.set(clave, p);
    p.catch(() => cache.delete(clave));
  }
  return p;
}

async function pedirJson<T>(ruta: string, que: string): Promise<T> {
  const r = await fetch(apiUrl(ruta));
  if (!r.ok) throw new Error(`${que}: ${r.status}`);
  return r.json() as Promise<T>;
}

/* ── Por nombre ───────────────────────────────────────────────────────────── */

const prefijos = new Map<'p', Promise<PrefijosOff>>();
const trozosDeNombres = new Map<string, Promise<EntradaIndiceOff[]>>();

/** Qué trozos de nombres existen (en Vercel, uno que no existe devuelve la app, no un 404). */
export function cargarPrefijosOff(): Promise<PrefijosOff> {
  return memoizar(prefijos, 'p', async () => {
    const j = await pedirJson<{ partidos: string[]; prefijos: string[] }>('/off/n/_prefijos.json', 'Prefijos de productos');
    return { partidos: new Set(j.partidos), prefijos: new Set(j.prefijos) };
  });
}

/** Todos los productos con alguna palabra que empiece por `prefijo`, ya preparados para buscar. */
export function cargarTrozoDeNombresOff(prefijo: string): Promise<EntradaIndiceOff[]> {
  return memoizar(trozosDeNombres, prefijo, async () => {
    const j = await pedirJson<{ items: Array<[string, string, string]> }>(`/off/n/${prefijo}.json`, 'Productos');
    return prepararIndiceOff(j.items);
  });
}

/* ── Por código ───────────────────────────────────────────────────────────── */

const trozos = new Map<number, Promise<Record<string, OffRegistro>>>();

/** Un registro de la copia local por su código exacto, o `null` si no está. */
export async function getProductoOff(codigo: string): Promise<OffRegistro | null> {
  const n = trozoDeCodigo(codigo);
  const trozo = await memoizar(trozos, n, () =>
    pedirJson<Record<string, OffRegistro>>(`/off/p/${String(n).padStart(3, '0')}.json`, 'Productos'));
  return trozo[codigo] ?? null;
}

/** Cómo se presenta la app ante Open Food Facts (lo piden en su documentación). */
const AGENTE_OFF = 'EnForma/1.0 (https://danielenforma.app)';
const ESPERA_API_MS = 8000;

/**
 * El producto preguntado en directo a Open Food Facts. `null` si no lo
 * conocen; lanza si no se ha podido preguntar (sin conexión, límite, caída).
 */
export async function consultarOffEnDirecto(codigo: string): Promise<OffRegistro | null> {
  const campos = 'code,product_name,product_name_es,brands,quantity,serving_quantity,nutriscore_grade,nutriments';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ESPERA_API_MS);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(codigo)}?fields=${campos}`, {
      // Un navegador no deja cambiar el User-Agent: Open Food Facts acepta este.
      headers: { 'X-User-Agent': AGENTE_OFF },
      signal: ctrl.signal,
    });
    // 404 = «no existe»: es una respuesta, no un fallo.
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Open Food Facts: ${r.status}`);
    const j = await r.json() as { product?: ProductoApiOff };
    return j.product ? productoDesdeApiOff(j.product, codigo) : null;
  } finally {
    clearTimeout(t);
  }
}

const enDirecto = new Map<string, Promise<OffRegistro | null>>();

/**
 * Un producto por su código, con todo lo que hay detrás, en este orden:
 *   1. la corrección del coach, si la hay;
 *   2. la copia local, probando las variantes del código (UPC-A → EAN-13…);
 *   3. Open Food Facts en directo, si la copia no lo tiene.
 * Un fallo de la copia local no tapa la consulta en directo (y al revés): solo
 * lanza si no se ha podido preguntar a ninguna y no hay respuesta.
 */
export async function resolverProducto(codigo: string): Promise<OffRegistro | null> {
  const formas = variantesDeCodigo(codigo);
  for (const forma of formas) {
    const corregido = await getProductoCorregido(forma);
    if (corregido) return corregido;
  }
  let falloLocal: unknown = null;
  for (const forma of formas) {
    try {
      const p = await getProductoOff(forma);
      if (p) return p;
    } catch (err) {
      falloLocal = err;
      break;
    }
  }
  try {
    return await memoizar(enDirecto, formas[0], () => consultarOffEnDirecto(formas[0]));
  } catch (err) {
    throw falloLocal ?? err;
  }
}

/** Alias con el nombre de siempre (lo usa la hoja del producto escaneado). */
export const buscarProductoPorCodigo = resolverProducto;
