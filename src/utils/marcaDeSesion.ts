import { rmDeSerie, type RirEntrada } from './oneRepMax.js';
import { motivoDeNoValer, REPS_MAX_RM, REPS_MIN_RM, type SerieParaRm } from './rmValido.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La marca de una sesión (D2, 17-11-2026)

   Había tres RM distintos para el mismo ejercicio y el mismo día: la media de
   todas las series (seguimiento CDG), la mejor serie sin filtrar (informes y
   récords) y la curva sin filtro (historial). Una serie de 20 a RIR 4 podía
   ser «el récord», y una serie a RIR 5 hundía la media.

   Desde hoy hay una sola definición, y todo lo que compara fuerza la usa:

     marca de la sesión = el RM de su mejor serie VÁLIDA

   «Válida» lo decide `rmValido.ts` (3-12 repeticiones, RIR 2 o menos o al
   fallo, RIR apuntado por el atleta, ni bajadas ni miniseries). La fórmula
   sigue siendo la de `oneRepMax.ts`: aquí solo se elige qué series entran.

   Una sesión sin ninguna serie válida NO tiene marca: es `null`, no un 0. Un
   0 se leería como una caída del 100 %.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Una serie tal como llega: de un registro guardado o de la sesión en curso
 *  (ahí el peso, las reps y el RIR todavía son texto). */
export interface SerieRegistrada {
  weight: number | string;
  repsDone: number | string;
  rir?: RirEntrada;
  alFallo?: boolean;
  segmento?: boolean;
  rirApuntado?: boolean;
  /** Hecha fuera del gimnasio habitual (ver utils/sesionFuera.ts). */
  fuera?: boolean;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;

const paraElFiltro = (s: SerieRegistrada): SerieParaRm => ({
  repsDone: num(s.repsDone),
  // El filtro lee el RIR con `rirEfectivo`, que entiende texto, vacío y «fallo».
  rir: s.rir as number,
  alFallo: s.alFallo,
  segmento: s.segmento,
  rirApuntado: s.rirApuntado,
  fuera: s.fuera,
});

/**
 * RM estimado de la serie si vale para estimarlo; `null` si no vale (o no
 * tiene peso). `kg` sustituye al peso apuntado: dominadas y fondos suman el
 * peso del atleta.
 */
export function rmValidoDeSerie(s: SerieRegistrada, kg: number = num(s.weight)): number | null {
  if (!(kg > 0) || motivoDeNoValer(paraElFiltro(s)) !== null) return null;
  const rm = rmDeSerie({ ...s, weight: kg });
  return rm > 0 ? rm : null;
}

export interface MejorSerieValida<T> { serie: T; rm: number; kg: number }

/** La mejor serie válida de la sesión y su RM. A igual RM, la de más peso. */
export function mejorSerieValida<T extends SerieRegistrada>(
  sets: readonly T[], pesoDe: (s: T) => number = s => num(s.weight),
): MejorSerieValida<T> | null {
  let mejor: MejorSerieValida<T> | null = null;
  for (const s of sets) {
    const kg = pesoDe(s);
    const rm = rmValidoDeSerie(s, kg);
    if (rm == null) continue;
    if (!mejor || rm > mejor.rm || (rm === mejor.rm && kg > mejor.kg)) mejor = { serie: s, rm, kg };
  }
  return mejor;
}

/** La marca de la sesión: el RM de su mejor serie válida, o `null` si no hay ninguna. */
export function marcaDeSesion<T extends SerieRegistrada>(sets: readonly T[], pesoDe?: (s: T) => number): number | null {
  return mejorSerieValida(sets, pesoDe)?.rm ?? null;
}

/** Por qué una sesión se queda sin marca. `fuera` (17-11-2026): la sesión se
 *  hizo fuera de su gimnasio y sus kilos no se comparan (utils/sesionFuera.ts). */
export type MotivoSinMarca = 'fuera' | 'reps_altas' | 'reps_bajas' | 'rir_lejos' | 'rir_sin_apuntar';

/** Orden en el que se desempata y se enseña: primero lo que el atleta arregla
 *  antes. `fuera` delante: no es algo que arreglar, y explica la sesión entera. */
export const MOTIVOS_SIN_MARCA: readonly MotivoSinMarca[] = ['fuera', 'rir_sin_apuntar', 'rir_lejos', 'reps_altas', 'reps_bajas'];

/** Cómo se le dice al coach. */
export const ETIQUETA_SIN_MARCA: Record<MotivoSinMarca, string> = {
  fuera: 'fuera de su gimnasio',
  reps_altas: `más de ${REPS_MAX_RM} repeticiones`,
  reps_bajas: `menos de ${REPS_MIN_RM} repeticiones`,
  rir_lejos: 'RIR de 3 o más',
  rir_sin_apuntar: 'RIR sin apuntar',
};

/** Por qué no vale una serie con peso (bajadas y miniseries aparte: nunca son la marca). */
export function motivoDeSerieSinMarca(s: SerieRegistrada): MotivoSinMarca | null {
  const motivo = motivoDeNoValer(paraElFiltro(s));
  if (motivo === 'fuera') return 'fuera';
  if (motivo === 'reps') return num(s.repsDone) > REPS_MAX_RM ? 'reps_altas' : 'reps_bajas';
  if (motivo === 'rir') return 'rir_lejos';
  if (motivo === 'rir_sin_apuntar') return 'rir_sin_apuntar';
  return null;
}

/** El motivo más repetido de una cuenta por motivo (`null` si está vacía). */
export function motivoPrincipal(cuenta: Partial<Record<MotivoSinMarca, number>>): MotivoSinMarca | null {
  let mejor: MotivoSinMarca | null = null;
  for (const m of MOTIVOS_SIN_MARCA) {
    if ((cuenta[m] ?? 0) > (mejor ? cuenta[mejor] ?? 0 : 0)) mejor = m;
  }
  return mejor;
}

/**
 * Por qué la sesión no tiene marca: el motivo más repetido entre sus series
 * principales con peso. `null` si sí tiene marca, o si no hay ninguna serie
 * con peso y repeticiones (ahí no hay nada que explicar).
 */
export function motivoSinMarca<T extends SerieRegistrada>(
  sets: readonly T[], pesoDe: (s: T) => number = s => num(s.weight),
): MotivoSinMarca | null {
  const cuenta: Partial<Record<MotivoSinMarca, number>> = {};
  for (const s of sets) {
    if (s.segmento || !(pesoDe(s) > 0) || !(num(s.repsDone) > 0)) continue;
    const motivo = motivoDeSerieSinMarca(s);
    if (motivo === null) return null;
    cuenta[motivo] = (cuenta[motivo] ?? 0) + 1;
  }
  return motivoPrincipal(cuenta);
}
