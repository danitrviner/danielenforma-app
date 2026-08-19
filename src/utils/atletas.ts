import { UserProfile } from '../types';

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

/** Atletas que el coach entrena HOY: ni anonimizados ni dados de baja. */
export const atletasActivos = (ps: UserProfile[]): UserProfile[] =>
  ps.filter(p => !esAnonimizado(p) && !esBaja(p));
