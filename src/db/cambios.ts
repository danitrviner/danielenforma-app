import { auth, db, collection, doc, getDocs, setDoc, deleteDoc, query, where } from '../firebase';
import { forceLocalOnly, stripUndefined } from './core';
import { COACH_EMAIL } from '../utils/coach';
import type { AreaCambio, CambioAtleta } from '../utils/cambiosAtleta';

/* ═══════════════════════════════════════════════════════════════════════════
   Historial de cambios del coach (`cambiosAtleta`)

   Cada guardado del coach sobre un atleta deja, si cambió algo de verdad, una
   entrada con las frases que lo cuentan. Nunca bloquea ni rompe el guardado:
   si falla, se avisa por consola y el guardado sigue como si nada.

   Ver utils/cambiosAtleta.ts para cómo se redactan las frases.
   ═══════════════════════════════════════════════════════════════════════════ */

const COLECCION = 'cambiosAtleta';
/** Dos guardados del mismo documento tan seguidos son UN cambio. */
const VENTANA_DE_FUSION_MS = 30 * 60_000;
const MAX_ENTRADAS = 300;

interface Abierta { id: string; antesInicial: unknown; desde: number }
// En memoria y por sesión, a propósito: así fusionar no cuesta ni una lectura.
// Recargar la página cierra la ventana y el siguiente cambio es entrada nueva.
const abiertas = new Map<string, Abierta>();

export interface EntradaDeCambio<T> {
  athleteId: string;
  area: AreaCambio;
  /** `dieta:<id>`, `programa`, `config`, `calendario`, `meso:<id>`. */
  objeto: string;
  titulo: string;
  /** Estado guardado ANTES de esta escritura; `undefined` si el documento no existía. */
  antes: T | undefined;
  despues: T;
  resumir: (antes: T | undefined, despues: T) => string[];
}

/** Anota el cambio si lo ha hecho el coach y hay algo que contar. No lanza. */
export async function registrarCambio<T>(e: EntradaDeCambio<T>): Promise<void> {
  try {
    if (forceLocalOnly) return;
    const autor = auth.currentUser?.email ?? '';
    // El atleta editando lo suyo no es un cambio del coach; y solo el coach
    // puede escribir aquí (firestore.rules).
    if (autor !== COACH_EMAIL || e.athleteId === autor) return;

    const clave = `${e.athleteId}|${e.objeto}`;
    const ahora = Date.now();
    const previa = abiertas.get(clave);
    const fusiona = !!previa && ahora - previa.desde < VENTANA_DE_FUSION_MS;
    const antesBase = (fusiona ? previa!.antesInicial : e.antes) as T | undefined;
    const lineas = e.resumir(antesBase, e.despues);

    if (lineas.length === 0) {
      // Volvió al punto de partida: el cambio fusionado ya no existe.
      if (fusiona) {
        abiertas.delete(clave);
        await deleteDoc(doc(db, COLECCION, previa!.id));
      }
      return;
    }

    const id = fusiona ? previa!.id : doc(collection(db, COLECCION)).id;
    abiertas.set(clave, {
      id,
      antesInicial: fusiona ? previa!.antesInicial : e.antes,
      desde: fusiona ? previa!.desde : ahora,
    });
    const entrada: Omit<CambioAtleta, 'id'> = {
      athleteId: e.athleteId, area: e.area, objeto: e.objeto, titulo: e.titulo,
      lineas, at: new Date(ahora).toISOString(), autor,
    };
    await setDoc(doc(db, COLECCION, id), stripUndefined(entrada));
  } catch (err) {
    console.warn('registrarCambio: no se pudo anotar el cambio', err);
  }
}

/** Cambios de un atleta, los más recientes primero. */
export async function getCambiosAtleta(athleteEmail: string): Promise<CambioAtleta[]> {
  const snap = await getDocs(query(collection(db, COLECCION), where('athleteId', '==', athleteEmail)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as CambioAtleta)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_ENTRADAS);
}
