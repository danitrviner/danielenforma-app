import type { Mesocycle } from '../types.js';

/* Las semanas en las que el plan pide AFLOJAR (F7, 17-11-2026).

   El entreno ya las resolvía bien (`resolverEjercicioDelMeso`: mitad de series
   en descarga y en puente, RIR 3 o más al volver de un parón), pero el resto de
   la sesión no sabía en qué semana estaba: la tarjeta seguía diciendo «hoy sube
   a 82,5 kg» en plena descarga y los retos seguían pidiendo progresar en la
   semana puente. Aquí está la única lectura de «qué semana es», para que la
   carga sugerida, el prerrelleno, los avisos y los retos digan lo mismo.

   Módulo puro (lo alcanza el motor de retos, que corre también en el
   servidor): importa con `.js` y no toca `progression.ts`. */

/**
 *   · descarga — mitad de series en todo.
 *   · puente   — semana pivot: mitad de series salvo los grupos prioritarios.
 *   · paron    — primera semana tras un parón: RIR 3 o más.
 */
export type TipoDeSemana = 'descarga' | 'puente' | 'paron';

type SemanasDelMeso = Pick<Mesocycle, 'semanasDescarga' | 'semanasPivot' | 'vuelveDeParon'>;

/** ¿Es semana puente? Si además es de descarga, manda la descarga (igual que
 *  en `resolverEjercicioDelMeso`). */
export function esSemanaPuente(meso: SemanasDelMeso | null | undefined, semana: number): boolean {
  return !!meso?.semanasPivot?.includes(semana) && !meso.semanasDescarga?.includes(semana);
}

/** ¿Es la primera semana tras un parón? */
export function esVueltaDeParon(meso: SemanasDelMeso | null | undefined, semana: number): boolean {
  return !!meso?.vuelveDeParon && semana === 1;
}

/**
 * Qué semana de aflojar es la vuelta de ciclo `semana`, o `null` si es una
 * semana normal. Si coinciden varias, la que más recorta: descarga, luego
 * puente, luego parón.
 */
export function tipoDeSemana(meso: SemanasDelMeso | null | undefined, semana: number): TipoDeSemana | null {
  if (!meso) return null;
  if (meso.semanasDescarga?.includes(semana)) return 'descarga';
  if (esSemanaPuente(meso, semana)) return 'puente';
  if (esVueltaDeParon(meso, semana)) return 'paron';
  return null;
}
