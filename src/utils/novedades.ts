import type { Novedad } from '../data/novedades';

/**
 * Las novedades que a este atleta aún no se le han enseñado, de la más
 * reciente a la más antigua.
 *
 * - `vistas` es el id de la última novedad que cerró: todo lo que está por
 *   delante en la lista (más reciente) le falta; lo demás ya lo vio.
 * - Una cuenta creada el mismo día o después que una novedad no la ve: la app
 *   ya le llegó con ello, y contárselo como «nuevo» sería ruido. Esto también
 *   cubre a los atletas que ya existían antes de que hubiera ventana, porque
 *   su primera ventana solo trae lo posterior a su alta.
 * - Un `vistas` que ya no existe en la lista (se retiró una novedad) se trata
 *   como «no ha visto nada» y se filtra solo por la fecha de alta.
 */
export function novedadesPendientes(
  novedades: Novedad[],
  contexto: { vistas?: string; creadaEn?: string },
): Novedad[] {
  const i = contexto.vistas ? novedades.findIndex(n => n.id === contexto.vistas) : -1;
  const sinVer = i >= 0 ? novedades.slice(0, i) : novedades;
  const alta = contexto.creadaEn?.slice(0, 10);
  return alta ? sinVer.filter(n => n.fecha > alta) : sinVer;
}

/** El id que hay que guardar al cerrar la ventana: el de la más reciente. */
export function idMasReciente(novedades: Novedad[]): string | undefined {
  return novedades[0]?.id;
}
