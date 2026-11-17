import type { LecturaDeHipotesis, Mesocycle, VeredictoDeHipotesis } from '../../types.js';
import type { ZonaIem } from '../cdg/zonas.js';

/* El historial de hipótesis de un atleta: sus bloques con el cierre firmado
   (`Mesocycle.cierreDeHipotesis`), en orden. Lo leen la propuesta del bloque
   siguiente, el veredicto (dos «no responde» seguidos) y el mapa de respuesta.
   Un solo sitio para ordenar los bloques y sacar los veredictos de una zona. */

/** Lo que hace falta de un mesociclo para leer su hipótesis y su cierre. */
export type BloqueConCierre = Pick<Mesocycle, 'id' | 'number' | 'startDate'>
  & Partial<Pick<Mesocycle, 'name' | 'tipoBloque' | 'hipotesis' | 'cierreDeHipotesis'>>;

/** Del más antiguo al más reciente. */
export function ordenarBloques<T extends Pick<Mesocycle, 'number' | 'startDate'>>(bloques: readonly T[]): T[] {
  return [...bloques].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.number - b.number);
}

export interface VeredictoEnSuBloque {
  mesocycleId: string;
  firmadoEn: string;
  veredicto: VeredictoDeHipotesis;
}

/** Los veredictos firmados de una zona, del más antiguo al más reciente. */
export function veredictosDeLaZona(bloques: readonly BloqueConCierre[], zona: ZonaIem): VeredictoEnSuBloque[] {
  return ordenarBloques(bloques).flatMap(b => {
    const cierre = b.cierreDeHipotesis;
    const v = cierre?.veredictos.find(x => x.zona === zona);
    return cierre && v ? [{ mesocycleId: b.id, firmadoEn: cierre.firmadoEn, veredicto: v }] : [];
  });
}

/** Cuántos veredictos seguidos, contando desde el último, tienen esa lectura. */
export function seguidosAlFinal(veredictos: readonly Pick<VeredictoDeHipotesis, 'lectura'>[], lectura: LecturaDeHipotesis): number {
  let n = 0;
  for (let i = veredictos.length - 1; i >= 0 && veredictos[i].lectura === lectura; i--) n++;
  return n;
}
