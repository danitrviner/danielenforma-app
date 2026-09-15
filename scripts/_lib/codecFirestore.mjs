/* Conversión de los tipos de Firestore que JSON no sabe guardar.
 *
 * La mayoría de la app guarda las fechas como texto ISO (`ahora()` en
 * src/db/crm.ts:77), pero NO toda: `checkins` trae `Timestamp` de verdad. Un
 * `JSON.stringify` sobre un Timestamp lo deja como `{"_seconds":…}`, y al
 * restaurar se escribiría ese objeto anónimo en vez de una fecha — la copia
 * parecería correcta y los datos volverían rotos. Descubierto haciendo el
 * primer volcado, 15-09-2026.
 *
 * Formato: cada valor especial se guarda como un objeto con `__tipo__`. Un
 * objeto normal de la app nunca lleva esa clave, así que no hay ambigüedad.
 */
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';

const MARCA = '__tipo__';

/** Datos de Firestore → estructura que JSON guarda sin perder nada. */
export function aJson(valor, ruta = '') {
  if (valor === null || typeof valor !== 'object') return valor;

  if (valor instanceof Timestamp) {
    return { [MARCA]: 'timestamp', seconds: valor.seconds, nanoseconds: valor.nanoseconds };
  }
  if (valor instanceof GeoPoint) {
    return { [MARCA]: 'geopoint', latitude: valor.latitude, longitude: valor.longitude };
  }
  if (Buffer.isBuffer(valor)) {
    return { [MARCA]: 'bytes', base64: valor.toString('base64') };
  }
  // Referencia a otro documento: se reconoce por tener `path` y `firestore`.
  if (typeof valor.path === 'string' && valor.firestore) {
    return { [MARCA]: 'ref', path: valor.path };
  }
  if (Array.isArray(valor)) {
    return valor.map((v, i) => aJson(v, `${ruta}[${i}]`));
  }

  /* Cualquier otro objeto que no sea un objeto plano es un tipo que este codec
   * no conoce. Antes que copiarlo mal en silencio, la copia falla: es la única
   * forma de enterarse el día que se guarde, y no el día que haga falta
   * restaurar. */
  if (Object.getPrototypeOf(valor) !== Object.prototype && Object.getPrototypeOf(valor) !== null) {
    throw new Error(
      `El campo ${ruta || '(raíz)'} es ${valor.constructor?.name ?? 'un objeto no plano'}, ` +
      `un tipo que scripts/_lib/codecFirestore.mjs todavía no sabe convertir. ` +
      `Añádelo ahí (en aJson y en deJson) antes de fiarte de esta copia.`,
    );
  }

  const salida = {};
  for (const [k, v] of Object.entries(valor)) salida[k] = aJson(v, ruta ? `${ruta}.${k}` : k);
  return salida;
}

/** Estructura leída del JSON → datos que Firestore vuelve a entender. */
export function deJson(valor, db) {
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map(v => deJson(v, db));

  switch (valor[MARCA]) {
    case 'timestamp': return new Timestamp(valor.seconds, valor.nanoseconds);
    case 'geopoint':  return new GeoPoint(valor.latitude, valor.longitude);
    case 'bytes':     return Buffer.from(valor.base64, 'base64');
    case 'ref':       return db.doc(valor.path);
    case undefined:   break;
    default:
      throw new Error(`Tipo desconocido en la copia: ${valor[MARCA]}. ¿Copia hecha con una versión más nueva del codec?`);
  }

  const salida = {};
  for (const [k, v] of Object.entries(valor)) salida[k] = deJson(v, db);
  return salida;
}
