import type { AjustesDeTecnica, WorkoutExercise, WorkoutTechnique } from '../types';
import { TECHNIQUE_LABEL } from './workoutTechniques';

/* ═══════════════════════════════════════════════════════════════════════════
   Técnica por serie (E-06)

   La técnica sigue siendo `WorkoutExercise.technique` (el tipo); lo nuevo es
   `tecnicaAjustes`: en qué series va y con qué parámetros. Sin ajustes, o con
   ajustes a medias, se completa con AJUSTES_POR_DEFECTO — así lo guardado antes
   de E-06 se lee igual que se leía (en la última serie) sin migrar nada.

   Drop set y myo-reps añaden segmentos (bajadas, miniseries) tras la serie que
   la lleva; no son series: no cuentan para el volumen. AMRAP y al fallo
   cambian cómo se hace esa serie, sin segmentos.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Las que el coach puede elegir. Rest-pause se quitó (Dani, 23-10): lo que ya
 *  la lleva se sigue leyendo y se puede quitar, pero no se ofrece. */
export const TECNICAS_ELEGIBLES: WorkoutTechnique[] = ['dropset', 'myoreps', 'amrap', 'fallo'];

export const AJUSTES_POR_DEFECTO: Required<AjustesDeTecnica> = {
  series: 'ultima',
  dropset: { bajadas: 2, pctBajada: 20, hastaFallo: true },
  myoreps: { repsActivacion: '12-15', miniSeries: '3-5', repsMini: '3-5', descansoSeg: 20 },
};

export function llevaSegmentos(t: WorkoutTechnique | undefined): boolean {
  return t === 'dropset' || t === 'myoreps' || t === 'restpause';
}

/** Ajustes completos de un ejercicio (lo suyo encima de lo por defecto). */
export function ajustesDe(we: Pick<WorkoutExercise, 'tecnicaAjustes'>): Required<AjustesDeTecnica> {
  const a = we.tecnicaAjustes ?? {};
  return {
    series: a.series ?? AJUSTES_POR_DEFECTO.series,
    dropset: { ...AJUSTES_POR_DEFECTO.dropset, ...a.dropset },
    myoreps: { ...AJUSTES_POR_DEFECTO.myoreps, ...a.myoreps },
  };
}

/** Números de serie (1 = la primera) que llevan la técnica, de `total` series. */
export function seriesConTecnica(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>, total: number): number[] {
  if (!we.technique || total <= 0) return [];
  const { series } = ajustesDe(we);
  if (series === 'todas') return Array.from({ length: total }, (_, i) => i + 1);
  if (series === 'ultima') return [total];
  const validas = [...new Set(series)].filter(n => Number.isInteger(n) && n >= 1 && n <= total).sort((a, b) => a - b);
  // Si el ejercicio ahora tiene menos series que las marcadas, al menos la última.
  return validas.length > 0 ? validas : [total];
}

function enQueSeries(nums: number[], total: number): string {
  if (nums.length === total && total > 1) return 'Todas las series';
  if (nums.length === 1 && nums[0] === total) return total === 1 ? 'En la serie' : 'Última serie';
  if (nums.length === 1) return `Serie ${nums[0]}`;
  return `Series ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`;
}

/** Qué se hace, en concreto: «2 bajadas de −20 %, hasta el fallo». */
export function pautaDeTecnica(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>): string {
  const a = ajustesDe(we);
  switch (we.technique) {
    case 'dropset': {
      const d = a.dropset;
      // Espacio que no se parte: «−20 %» nunca queda en dos líneas.
      return `${d.bajadas} ${d.bajadas === 1 ? 'bajada' : 'bajadas'} de −${d.pctBajada}\u00a0%${d.hastaFallo ? ', hasta el fallo' : ''}`;
    }
    case 'myoreps': {
      const m = a.myoreps;
      return `activación de ${m.repsActivacion} reps y ${m.miniSeries} miniseries de ${m.repsMini}, descansando ${m.descansoSeg} s`;
    }
    case 'restpause': return 'pausas de 10-15 s y unas repeticiones más';
    case 'amrap': return 'todas las repeticiones que puedas con buena técnica';
    case 'fallo': return 'hasta que la técnica se rompa';
    default: return '';
  }
}

/** Segunda línea del bloque de bajadas / miniseries en la sesión (14-d): cómo
 *  hacerlas, con lo que programó el coach. Vacía en las técnicas sin bloque. */
export function pautaDelBloque(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>): string {
  const a = ajustesDe(we);
  if (we.technique === 'dropset') {
    return `Sin descanso · −${a.dropset.pctBajada}\u00a0% cada bajada · ${a.dropset.hastaFallo ? 'hasta el fallo' : 'sin llegar al fallo'}`;
  }
  if (we.technique === 'myoreps') return `${a.myoreps.descansoSeg}\u00a0s entre miniseries · ${a.myoreps.repsMini} reps cada una`;
  return '';
}

/** En qué series y qué hacer, por separado: para poner el nombre de la técnica
 *  en negrita sin repetirlo («DROP-SET · Series 2 y 3: 2 bajadas de −20 %…»). */
export function partesDeTecnica(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>, total: number): { series: string; pauta: string } {
  return { series: enQueSeries(seriesConTecnica(we, total), total), pauta: pautaDeTecnica(we) };
}

/** Frase para el atleta: «Última serie: drop set, 2 bajadas de −20 %, hasta el fallo». */
export function describirTecnica(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>, total: number): string {
  if (!we.technique) return '';
  const nums = seriesConTecnica(we, total);
  return `${enQueSeries(nums, total)}: ${TECHNIQUE_LABEL[we.technique].toLowerCase()}, ${pautaDeTecnica(we)}`;
}

/** Peso sugerido para la bajada `i` (0 = la primera) desde el peso de la serie. */
export function pesoDeBajada(pesoSerie: number, pctBajada: number, i: number): number | null {
  if (!(pesoSerie > 0)) return null;
  const kg = pesoSerie * Math.pow(1 - pctBajada / 100, i + 1);
  return Math.round(kg * 2) / 2; // a medio kilo, lo que hay en un gimnasio
}

/**
 * A qué serie principal pertenece cada segmento de una lista de series. Los
 * segmentos sin `segmentoDe` (registros de antes de E-06) son de la última.
 */
export function serieDelSegmento(s: { segmento?: boolean; segmentoDe?: number }, nPrincipales: number): number | null {
  if (!s.segmento) return null;
  return s.segmentoDe && s.segmentoDe >= 1 && s.segmentoDe <= nPrincipales ? s.segmentoDe : nPrincipales;
}

/** Las series principales de un registro, sin bajadas ni miniseries. Para
 *  leer «la serie 2 de la última vez» hay que contar solo estas: si la técnica
 *  iba en una serie que no es la última, sus segmentos quedan en medio. */
export function seriesPrincipales<T extends { segmento?: boolean }>(sets: readonly T[]): T[] {
  return sets.filter(s => !s.segmento);
}

/**
 * Segmentos que la sesión trae ya puestos (14-b), por serie principal: drop set,
 * tantas bajadas como haya programado el coach; myo-reps, el mínimo de
 * miniseries del rango («3-5» → 3). El atleta puede añadir más a mano.
 */
export function segmentosProgramados(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>, nPrincipales: number): number[] {
  if (we.technique !== 'dropset' && we.technique !== 'myoreps') return [];
  const a = ajustesDe(we);
  const minimo = parseInt(a.myoreps.miniSeries, 10);
  const porSerie = we.technique === 'dropset'
    ? a.dropset.bajadas
    : Number.isFinite(minimo) && minimo > 0 ? minimo : parseInt(AJUSTES_POR_DEFECTO.myoreps.miniSeries, 10);
  const n = Math.max(0, Math.min(10, Math.round(porSerie)));
  return seriesConTecnica(we, nPrincipales).flatMap(serie => Array.from({ length: n }, () => serie));
}

/**
 * Lo que se guarda en `tecnicaAjustes.series` al marcar series una a una en el
 * editor (14-a). Solo la última → 'ultima' y todas → 'todas', para que la
 * técnica siga en su sitio si luego cambia el número de series; cualquier otra
 * combinación, los números. Ninguna → `null`: se quita la técnica.
 */
export function seriesAGuardar(marcadas: readonly number[], total: number): AjustesDeTecnica['series'] | null {
  const nums = [...new Set(marcadas)].filter(n => Number.isInteger(n) && n >= 1 && n <= total).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  if (nums.length === 1 && nums[0] === total) return 'ultima';
  if (nums.length === total) return 'todas';
  return nums;
}

/** Pauta debajo de cada serie marcada en el editor del coach (14-a). */
export function pautaDeSerie(we: Pick<WorkoutExercise, 'technique' | 'tecnicaAjustes'>): string {
  const a = ajustesDe(we);
  switch (we.technique) {
    case 'dropset': {
      const d = a.dropset;
      return `Después de la serie: ${d.bajadas} ${d.bajadas === 1 ? 'bajada' : 'bajadas'} · −${d.pctBajada}\u00a0% cada una · ${d.hastaFallo ? 'hasta el fallo' : 'sin llegar al fallo'} · sin descanso`;
    }
    case 'myoreps': {
      const m = a.myoreps;
      return `Después de la serie: ${m.miniSeries} miniseries de ${m.repsMini} reps · ${m.descansoSeg}\u00a0s entre ellas`;
    }
    case 'restpause': return 'Después de la serie: pausas de 10-15 s y unas repeticiones más';
    case 'amrap': return 'Esta serie: todas las repeticiones posibles con buena técnica';
    case 'fallo': return 'Esta serie: hasta el fallo';
    default: return '';
  }
}
