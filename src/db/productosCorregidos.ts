import { db, doc, getDoc, setDoc, deleteDoc } from '../firebase';
import { forceLocalOnly, stripUndefined } from './core';
import type { OffProducto } from '../utils/productoOff';

/* ═══════════════════════════════════════════════════════════════════════════
   Correcciones del coach a productos de supermercado

   `productosCorregidos/{código}`: un producto de Open Food Facts con los datos
   que ha puesto el coach. Manda sobre la copia local y sobre la consulta en
   directo (services/openFoodFacts.ts). Lo lee cualquier usuario de la app y
   solo lo escribe el coach (firestore.rules). No lleva datos de atletas.
   ═══════════════════════════════════════════════════════════════════════════ */

export const COLECCION_CORREGIDOS = 'productosCorregidos';

export type ProductoCorregido = OffProducto & { fecha?: string };

const ESPERA_MS = 2500;
const leidos = new Map<string, Promise<ProductoCorregido | null>>();

/**
 * La corrección de un código, o null si no hay. Un fallo de lectura (sin
 * conexión, reglas sin desplegar) también da null: es una capa opcional y el
 * producto se sigue buscando en la copia y en directo.
 */
export function getProductoCorregido(codigo: string): Promise<ProductoCorregido | null> {
  if (forceLocalOnly) return Promise.resolve(null);
  let p = leidos.get(codigo);
  if (!p) {
    const lectura = getDoc(doc(db, COLECCION_CORREGIDOS, codigo))
      .then(s => (s.exists() ? ({ ...(s.data() as ProductoCorregido), c: codigo }) : null));
    // Sin conexión, Firestore puede tardar en rendirse: el escáner no espera por
    // una capa opcional más de lo que tarda en mirar la copia.
    const tope = new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error('productosCorregidos: sin respuesta')), ESPERA_MS));
    p = Promise.race([lectura, tope]).catch(err => {
      console.warn('getProductoCorregido failed:', err);
      leidos.delete(codigo);
      return null;
    });
    leidos.set(codigo, p);
  }
  return p;
}

/** Guarda la corrección (solo el coach). Un fallo se relanza: no se finge guardado. */
export async function guardarProductoCorregido(producto: OffProducto): Promise<void> {
  const datos: ProductoCorregido = { ...producto, fecha: new Date().toISOString() };
  await setDoc(doc(db, COLECCION_CORREGIDOS, producto.c), stripUndefined(datos));
  leidos.set(producto.c, Promise.resolve(datos));
}

/** Quita la corrección: el producto vuelve a salir con los datos de Open Food Facts. */
export async function borrarProductoCorregido(codigo: string): Promise<void> {
  await deleteDoc(doc(db, COLECCION_CORREGIDOS, codigo));
  leidos.set(codigo, Promise.resolve(null));
}
