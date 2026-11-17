import type { WorkoutSetLog } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Tiempos reales entre series (D1, 11-11-2026)

   Cada serie guarda la hora a la que el atleta la marcó (`hechaEn`). De dos
   series principales seguidas del mismo ejercicio sale el tiempo que pasó
   entre una y otra. Hasta ahora solo existía el descanso PAUTADO, así que no
   se podía saber si un descanso se quedaba corto de verdad o si el atleta
   simplemente no lo respetaba.

   Ojo con la unidad: la serie se marca al TERMINARLA, así que el intervalo
   entre dos marcas es descanso + lo que dura la segunda serie. Por eso se
   ofrecen las dos cifras: el intervalo tal cual y el descanso estimado.

   Un intervalo solo vale si es creíble. Marcar tres series de golpe al acabar
   el ejercicio da segundos sueltos; dejar la sesión a medias y volver da
   horas. En los dos casos se devuelve `null`: mejor no tener dato que tener
   uno inventado.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Por debajo de esto no ha dado tiempo a hacer una serie: se marcaron seguidas. */
export const INTERVALO_MINIMO_SEG = 20;
/** Por encima de esto no es un descanso: el atleta se fue a otra cosa. */
export const INTERVALO_MAXIMO_SEG = 15 * 60;
/** Lo que dura una serie, igual que en el tiempo estimado de sesión (utils/programacion.ts). */
export const SEGUNDOS_DE_UNA_SERIE = 45;

type ConHora = Pick<WorkoutSetLog, 'hechaEn' | 'segmento'>;

/**
 * Segundos entre cada serie principal y la anterior, en el mismo orden que
 * `seriesPrincipales(sets)`. La primera es siempre `null` (no hay anterior), y
 * también cualquiera sin hora o con un intervalo que no sea creíble.
 */
export function intervalosEntreSeries(sets: readonly ConHora[]): (number | null)[] {
  const principales = seriesPrincipales(sets);
  return principales.map((s, i) => {
    if (i === 0) return null;
    const antes = Date.parse(principales[i - 1].hechaEn ?? '');
    const ahora = Date.parse(s.hechaEn ?? '');
    if (!Number.isFinite(antes) || !Number.isFinite(ahora)) return null;
    const seg = Math.round((ahora - antes) / 1000);
    return seg >= INTERVALO_MINIMO_SEG && seg <= INTERVALO_MAXIMO_SEG ? seg : null;
  });
}

/** Descanso estimado de un intervalo: se le quita lo que dura la serie. Nunca negativo. */
export function descansoEstimado(intervaloSeg: number): number {
  return Math.max(0, intervaloSeg - SEGUNDOS_DE_UNA_SERIE);
}

/**
 * Descanso real típico de un ejercicio en una sesión: la mediana de los
 * descansos estimados que se pueden calcular. `null` si no hay ninguno (sesión
 * antigua, o series marcadas todas de golpe).
 */
export function descansoRealDelEjercicio(sets: readonly ConHora[]): number | null {
  const validos = intervalosEntreSeries(sets)
    .filter((v): v is number => v !== null)
    .map(descansoEstimado)
    .sort((a, b) => a - b);
  if (validos.length === 0) return null;
  const mitad = Math.floor(validos.length / 2);
  return validos.length % 2 ? validos[mitad] : Math.round((validos[mitad - 1] + validos[mitad]) / 2);
}
