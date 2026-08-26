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

/** Sello guardado en este dispositivo: qué versión se leyó y cuántos documentos traía. */
interface SelloLocal { version: string; n: number; }

/**
 * Lee el sello del dispositivo. Devuelve null si no hay, si está corrupto o si
 * viene en el formato antiguo (la versión a pelo, sin el recuento): en ese caso
 * conviene releer una vez para saber cuántos documentos hay, en lugar de dar
 * por buena una caché cuyo tamaño esperado no se conoce.
 */
function leerSelloLocal(clave: string): SelloLocal | null {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === 'string' && typeof parsed?.n === 'number') return parsed;
  } catch {
    /* formato antiguo (string suelto) o JSON inválido */
  }
  return null;
}

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
    const guardado = leerSelloLocal(claveLocal);
    if (guardado && versionRemota === guardado.version) {
      try {
        const cacheSnap = await getDocsFromCache(colRef);
        // No basta con que la caché NO esté vacía: tiene que estar COMPLETA.
        //
        // La copia local de Firestore se llena documento a documento, y varias
        // consultas parciales escriben en ella sin traerla entera — `getWorkouts`
        // convive con `getWorkoutsByIds` y con los `where('mesocycleId', ...)`,
        // y `getExercises` con el `limit(1)` que comprueba si hay que sembrar.
        // Si el navegador purga IndexedDB pero deja el localStorage —Safari lo
        // hace— el sello seguiría diciendo «al día» con solo un puñado de
        // documentos en la caché, y `!empty` daría esa lista corta por buena:
        // el atleta vería tres rutinas en vez de todas, sin un solo error por
        // ningún sitio. Por eso se guarda también cuántos documentos tenía el
        // catálogo la última vez que se leyó entero, y una caché con menos se
        // trata como incompleta.
        if (cacheSnap.size >= guardado.n) return cacheSnap.docs.map(mapear);
      } catch {
        // Sin caché local todavía en este dispositivo — cae al fetch normal.
      }
    }
  }

  const snap = await getDocs(colRef);
  if (versionRemota != null) {
    try {
      localStorage.setItem(claveLocal, JSON.stringify({ version: versionRemota, n: snap.size }));
    } catch {}
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
