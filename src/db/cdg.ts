import { db, doc, getDoc, runTransaction } from '../firebase';
import {
  unirPropios, CDG_PROPIOS_DOC, actualizarPropio, crearVariante,
  type CdgCatalogoCompacto, type CdgEjercicio,
} from '../utils/cdg';
import { marcarCatalogoCambiado } from './catalogoVersionado';
import { olvidarCacheEjercicios } from './training';

/* Catálogo de la plantilla «Índice de hipertrofia» (CulturaDeGym).
 *
 * Vive en Firestore (`cdgCatalogo/{versión}`), NO en el bundle: es material con
 * licencia de uso personal del coach. Las reglas solo dejan leerlo al coach, así
 * que un atleta que llamara a esto recibiría permission-denied — por eso el hook
 * `useMotorCdg` ni lo pide si no es el coach.
 *
 * El documento guarda el JSON compacto como UN string (`json`): Firestore no
 * admite los arrays anidados del formato compacto, y así se sube y se lee tal
 * cual sale del Excel. El tope de un documento es 1 MiB; el catálogo actual
 * pesa ~370 KB (scripts/subirCatalogoCdg.mjs se niega a subir más de 900 KB).
 */
export const CDG_CATALOGO_VERSION = 'v4';

const jsonDe = (snap: { exists: () => boolean; data: () => unknown }): string | null => {
  if (!snap.exists()) return null;
  const json = (snap.data() as { json?: unknown }).json;
  return typeof json === 'string' && json.length > 0 ? json : null;
};

/** Catálogo del Excel + ejercicios propios (`cdgCatalogo/propios`, ver utils/cdg/propios.ts). */
export async function getCdgCatalogoJson (): Promise<string | null> {
  const [catalogo, propios] = await Promise.all([
    getDoc(doc(db, 'cdgCatalogo', CDG_CATALOGO_VERSION)),
    getDoc(doc(db, 'cdgCatalogo', CDG_PROPIOS_DOC)),
  ]);
  const json = jsonDe(catalogo);
  return json ? unirPropios(json, jsonDe(propios)) : null;
}

export function parsearCatalogoCdg (json: string): CdgCatalogoCompacto {
  const c = JSON.parse(json) as CdgCatalogoCompacto;
  if (!Array.isArray(c.exercises) || !Array.isArray(c.muscles) || !Array.isArray(c.joints)) {
    throw new Error('El catálogo CDG no tiene el formato esperado (exercises/muscles/joints).');
  }
  return c;
}

/* ─── Editor de matices (11-11) ──────────────────────────────────────────────
   Solo se escribe `cdgCatalogo/propios` (las reglas no dejan tocar `v4`). El
   documento es UN string con todos los propios: se lee y se reescribe dentro de
   una transacción para no pisar un cambio hecho a la vez en otra pestaña. La
   validación (mismos músculos/articulaciones, nombre único, valores completos,
   tamaño) es la de utils/cdg/matices.ts, la misma que acepta `unirPropios`. */

const refPropios = () => doc(db, 'cdgCatalogo', CDG_PROPIOS_DOC);
const refExcel = () => doc(db, 'cdgCatalogo', CDG_CATALOGO_VERSION);
const docPropios = (r: { json: string; ejercicios: number }) => ({ json: r.json, ejercicios: r.ejercicios, subidoAt: new Date().toISOString() });

/** Guarda los valores editados de un ejercicio propio que ya existe. */
export async function guardarPropioCdg (editado: CdgEjercicio): Promise<void> {
  await runTransaction(db, async tx => {
    const [excel, propios] = [await tx.get(refExcel()), await tx.get(refPropios())];
    const jsonExcel = jsonDe(excel);
    if (!jsonExcel) throw new Error('El catálogo CDG no está en Firestore.');
    tx.set(refPropios(), docPropios(actualizarPropio(jsonDe(propios), jsonExcel, editado)));
  });
}

/**
 * Crea un ejercicio propio copiando los valores de `base` y, si se da
 * `exerciseId`, vincula ese ejercicio de la biblioteca a la variante
 * (`exercises/{id}.cdgNombre`). Las dos escrituras van juntas o ninguna.
 */
export async function crearVarianteCdg (base: CdgEjercicio, nombreCorto: string, exerciseId?: string): Promise<string> {
  const nombre = await runTransaction(db, async tx => {
    const [excel, propios] = [await tx.get(refExcel()), await tx.get(refPropios())];
    const jsonExcel = jsonDe(excel);
    if (!jsonExcel) throw new Error('El catálogo CDG no está en Firestore.');
    const r = crearVariante(jsonDe(propios), jsonExcel, base, nombreCorto, exerciseId);
    tx.set(refPropios(), docPropios(r));
    if (exerciseId) tx.update(doc(db, 'exercises', exerciseId), { cdgNombre: r.nombre });
    return r.nombre;
  });
  if (exerciseId) {
    // Escrito en transacción: hay que invalidar la copia local (ver marcarCatalogoCambiado).
    olvidarCacheEjercicios();
    await marcarCatalogoCambiado('exercises', { invalidarLocal: true });
  }
  return nombre;
}
