import { db, doc, getDoc } from '../firebase';
import { unirPropios, CDG_PROPIOS_DOC, type CdgCatalogoCompacto } from '../utils/cdg';

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
