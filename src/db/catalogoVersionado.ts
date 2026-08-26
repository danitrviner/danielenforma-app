import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, collection, doc, getDoc, getDocs, getDocsFromCache, setDoc } from '../firebase';

/* ═══════════════════════════════════════════════════════════════════════════
   Catálogos con sello de versión

   `getExercises()`, `getFoodItems()` y compañía se bajaban la colección
   ENTERA de Firestore en cada sesión de cada persona — 1.681 ejercicios, 310
   alimentos, el listado completo de perfiles... Eso, multiplicado por cada
   atleta abriendo la app un par de veces al día, es lo que agotó la cuota
   diaria de lecturas el 22 de agosto.

   La solución no es empaquetar estos catálogos en el bundle (eso obligaría a
   Dani a ejecutar un script y redesplegar cada vez que da de alta un
   ejercicio o un alimento). Firestore YA guarda una copia local de todo en el
   dispositivo — `persistentLocalCache` está activado en `firebase.ts` desde
   siempre — pero la app nunca la usa: `getDocs()` va SIEMPRE al servidor.

   `getDocsFromCache()` lee esa copia local sin pagar ni una lectura. El único
   problema es saber si sigue siendo válida, y eso se resuelve con UN
   documento `catalogos/{nombre}` que lleva un sello `version`:

     1. Se lee ese documento (1 lectura, sea cual sea el tamaño de la colección).
     2. Si su `version` coincide con la que ya se tenía guardada en este
        dispositivo, se sirve la copia local — 0 lecturas más.
     3. Si no coincide (o es la primera vez en este dispositivo), se hace el
        `getDocs` completo UNA vez y se guarda la versión nueva.

   Firestore sigue siendo la fuente de verdad; nadie tiene que acordarse de
   ejecutar nada. Cada dominio solo tiene que llamar a
   `marcarCatalogoCambiado(nombre)` en sus funciones de escritura.
   ═══════════════════════════════════════════════════════════════════════════ */

const CLAVE_VERSION_LOCAL = (nombre: string) => `enforma_catalogo_version_${nombre}`;

/**
 * Lee una colección-catálogo aprovechando la copia local cuando su versión no
 * ha cambiado. Degrada con seguridad ante cualquier fallo: si el documento de
 * versión no existe, o falla la lectura de versión, o la caché local viene
 * vacía (dispositivo nuevo, modo incógnito, IndexedDB no disponible), cae al
 * `getDocs` de siempre — nunca sirve datos obsoletos por ahorrar una lectura.
 */
export async function leerCatalogo<T>(
  nombre: string,
  coleccion: string,
  mapear: (d: QueryDocumentSnapshot<DocumentData>) => T,
): Promise<T[]> {
  const colRef = collection(db, coleccion);
  const claveLocal = CLAVE_VERSION_LOCAL(nombre);

  let versionRemota: string | null = null;
  try {
    const versionSnap = await getDoc(doc(db, 'catalogos', nombre));
    if (versionSnap.exists()) versionRemota = versionSnap.data().version as string;
  } catch (err) {
    console.warn(`leerCatalogo(${nombre}): fallo leyendo la versión, se usa getDocs directo:`, err);
  }

  if (versionRemota != null) {
    const versionLocal = localStorage.getItem(claveLocal);
    if (versionRemota === versionLocal) {
      try {
        const cacheSnap = await getDocsFromCache(colRef);
        if (!cacheSnap.empty) return cacheSnap.docs.map(mapear);
      } catch {
        // Sin caché local todavía en este dispositivo — cae al fetch normal.
      }
    }
  }

  const snap = await getDocs(colRef);
  if (versionRemota != null) {
    try { localStorage.setItem(claveLocal, versionRemota); } catch {}
  }
  return snap.docs.map(mapear);
}

/** Llamar tras crear/editar/borrar un documento de un catálogo versionado —
 *  invalida la copia local de TODOS los dispositivos en su siguiente lectura. */
export async function marcarCatalogoCambiado(nombre: string): Promise<void> {
  try {
    await setDoc(doc(db, 'catalogos', nombre), { version: new Date().toISOString() }, { merge: true });
  } catch (err) {
    // No relanza: que falle el sello de versión no debe impedir que la
    // escritura real (el ejercicio/alimento que se acaba de guardar) se dé
    // por buena. En el peor caso, otros dispositivos tardan hasta que su
    // propia versión local caduque por otra vía en enterarse del cambio.
    console.warn(`marcarCatalogoCambiado(${nombre}) falló (no bloqueante):`, err);
  }
}
