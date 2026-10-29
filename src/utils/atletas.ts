import { UserProfile } from '../types.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Filtro de atletas para las pantallas de coach. `api/delete-account.ts`
   ANONIMIZA en vez de borrar (el cuadro de mandos cuenta altas/bajas sobre
   esos documentos) y `estadoCrm: 'baja'` es una decisión comercial normal —
   ninguno de los dos debería seguir apareciendo mezclado con los atletas que
   el coach entrena hoy.

   OJO: no filtrar dentro de `getAllUserProfiles` — el CRM (useClientes.ts)
   necesita las bajas para el churn. Este filtro se aplica en el consumidor,
   no en la capa de datos.
   ═══════════════════════════════════════════════════════════════════════════ */

export const esAnonimizado = (p: UserProfile): boolean => p.anonimizado === true;
export const esBaja = (p: UserProfile): boolean => p.estadoCrm === 'baja';
/** Archivado desde el CRM («quítamelo de delante»). Archivar además le corta
 *  el acceso, así que tampoco es alguien a quien entrenar (29-10). */
export const esArchivado = (p: UserProfile): boolean => p.archivadoCrm === true;

/** Atletas que el coach entrena HOY: ni anonimizados, ni de baja, ni archivados. */
export const atletasActivos = (ps: UserProfile[]): UserProfile[] =>
  ps.filter(p => !esAnonimizado(p) && !esBaja(p) && !esArchivado(p));
