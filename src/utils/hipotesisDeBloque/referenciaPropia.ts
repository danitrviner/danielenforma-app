import type { HipotesisDeZona } from '../../types.js';
import type { ZonaIem } from '../cdg/zonas.js';
import { mediana } from '../rmValido.js';
import { redondearIem } from './cifras.js';
import type { EstadoDeZona, EstadoDelBloque } from './estadoDelBloqueAnterior.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La referencia propia: una hipótesis sin bloque anterior (23-11-2026)

   El PROCESO de una hipótesis se pide sobre donde ACABÓ el bloque anterior.
   En el primer bloque de un atleta (15 de los 20 activos el día que se
   escribió esto) no hay anterior: la ficha salía «sin cifras de proceso» y el
   veredicto se daba solo por el RM, «como si se hubiera hecho». Podía apuntar
   «responde a volumen» sin que el volumen hubiera subido.

   Aquí la referencia sale del PROPIO bloque: el estímulo (IEM realizado) de
   sus dos primeras semanas que cuentan y en las que entrenó. Hace de «donde
   acabó el anterior» con las mismas reglas de siempre (medio escalón de media,
   un escalón de techo), y vale igual para confirmar la hipótesis con el
   bloque ya empezado.

   Dos consecuencias, que es lo que este archivo resuelve:

     · la referencia no existe hasta que esas dos semanas están TERMINADAS (la
       semana en curso no cuenta): antes, la ficha sigue sin cifras de proceso;
     · las semanas de referencia NO entran en la media del proceso. Si
       entraran, pedir «un 5 % más que la referencia» obligaría a compensar
       con el resto del bloque dos semanas que por definición van al 100 %.
       La media se cuenta desde la semana siguiente (Dani, 23-11-2026).

   Propio (criterio técnico de la app): el curso no habla de bloques sin
   anterior. Puro: no lee ni escribe nada. Lo alcanza el semáforo, que corre
   también en `api/`: solo importa con `.js`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Semanas entrenadas del arranque que forman la referencia (como las 2 del «final» de un bloque). */
export const SEMANAS_DE_REFERENCIA_PROPIA = 2;

export interface ReferenciaPropia {
  /**
   * Semanas que cuentan del arranque que quedan fuera de la media del proceso:
   * hasta la 2.ª en la que entrenó, incluida. Son 2 salvo que se saltara
   * entera alguna de las primeras. Es lo que se guarda en
   * `HipotesisDeZona.semanasDeReferencia`.
   */
  semanas: number;
  /** Las semanas de calendario del bloque (1-indexadas) de las que sale la cifra. */
  semanasUsadas: number[];
  /** Por zona, con la forma de `EstadoDelBloque.porZona`: media y final son la misma cifra. */
  porZona: Partial<Record<ZonaIem, Pick<EstadoDeZona, 'zona' | 'iemMedio' | 'iemFinal'>>>;
}

/**
 * La referencia propia de un bloque a partir de su estado hasta hoy
 * (`estadoDelBloqueAnterior` sobre el bloque EN CURSO). `null` mientras no
 * haya dos semanas que cuenten, terminadas y entrenadas, o si en ellas no
 * hubo estímulo de ninguna zona.
 */
export function referenciaPropia(estado: Pick<EstadoDelBloque, 'semanas' | 'porZona'> | null | undefined): ReferenciaPropia | null {
  if (!estado) return null;
  const cuentan = estado.semanas.filter(s => s.cuenta);
  const entrenadas = cuentan.map((s, i) => (s.entrenada ? i : -1)).filter(i => i >= 0).slice(0, SEMANAS_DE_REFERENCIA_PROPIA);
  if (entrenadas.length < SEMANAS_DE_REFERENCIA_PROPIA) return null;
  const porZona: ReferenciaPropia['porZona'] = {};
  for (const z of Object.values(estado.porZona)) {
    if (!z) continue;
    const cifra = redondearIem(mediana(entrenadas.map(i => z.porSemana[i] ?? 0)) ?? 0);
    if (cifra > 0.005) porZona[z.zona] = { zona: z.zona, iemMedio: cifra, iemFinal: cifra };
  }
  if (Object.keys(porZona).length === 0) return null;
  return {
    semanas: entrenadas[entrenadas.length - 1] + 1,
    semanasUsadas: entrenadas.map(i => cuentan[i].semana),
    porZona,
  };
}

/** ¿La hipótesis se mide contra las primeras semanas de su propio bloque? */
export const conReferenciaPropia = (h: Pick<HipotesisDeZona, 'semanasDeReferencia'> | null | undefined): boolean =>
  (h?.semanasDeReferencia ?? 0) > 0;

export interface EstadoParaElProceso {
  /** IEM medio semanal con el que se juzga el proceso. `null` sin ninguna semana que medir. */
  iemMedio: number | null;
  /** IEM de cada semana que entra en esa media, en orden. */
  porSemana: number[];
  /** Semanas que cuentan y quedan fuera por ser la referencia (0 con bloque anterior). */
  semanasDeReferencia: number;
}

/**
 * Con qué se mide el PROCESO de una zona: su estado en el bloque tal cual o,
 * con referencia propia, sin las semanas de referencia. Lo usan el semáforo
 * y el veredicto para hacer la misma cuenta.
 */
export function estadoParaElProceso(
  estado: Pick<EstadoDeZona, 'iemMedio' | 'porSemana'> | null | undefined,
  h: Pick<HipotesisDeZona, 'semanasDeReferencia'> | null | undefined,
): EstadoParaElProceso {
  const fuera = conReferenciaPropia(h) ? Math.round(h!.semanasDeReferencia!) : 0;
  if (!estado) return { iemMedio: null, porSemana: [], semanasDeReferencia: fuera };
  if (fuera === 0) return { iemMedio: estado.iemMedio, porSemana: [...estado.porSemana], semanasDeReferencia: 0 };
  const porSemana = estado.porSemana.slice(fuera);
  const iemMedio = porSemana.length ? redondearIem(porSemana.reduce((a, b) => a + b, 0) / porSemana.length) : null;
  return { iemMedio, porSemana, semanasDeReferencia: fuera };
}
