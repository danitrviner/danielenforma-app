import type { WorkoutSetLog } from '../../types';

/** Fila editable de una serie en el player de sesión — mismo shape que
 * `SerieBorrador` (utils/sesionEnCurso.ts) y `SetPrefill` (utils/setPrefill.ts),
 * declarado una sola vez aquí para que TrainingScreen y los componentes de
 * `training/` no dupliquen el tipo. `rir` guarda '0'-'5' o el literal 'fallo'
 * — Fase 3: FALLO no es RIR 0 (decisión de Dani, 2026-08-07), así que
 * necesita su propio valor, no un número reservado. */
export interface SetInput {
  weight: string;
  repsDone: string;
  rir: string;
  done: boolean;
  /** Bajada (dropset) o miniserie (myoreps) que se suma DESPUÉS de la última
   *  serie principal. No es una serie más: no cuenta para el volumen. */
  segmento?: boolean;
  /** Serie principal (1 = la primera) a la que pertenece el segmento. */
  segmentoDe?: number;
  /** Instante (ISO) en que se marcó como hecha. Ver `WorkoutSetLog.hechaEn`. */
  hechaEn?: string;
  /** D1b: el RIR de esta fila lo ha elegido el atleta (lo cambió, lo eligió en
   *  el selector rápido o marcó fallo). Sin la marca, el RIR que hay es el
   *  prerrelleno con el pautado. Ver `WorkoutSetLog.rirApuntado`. */
  rirApuntado?: boolean;
}

type Actualizar = (sIdx: number, field: keyof SetInput, value: string | boolean) => void;

/* ═══════════════════════════════════════════════════════════════════════════
   Cómo se apunta el RIR (D1, 17-11-2026)

   El RIR llegaba prerrellenado con el pautado y un toque en «Hecha» lo
   guardaba como si fuera del atleta: ese dato entraba en el RM estimado y en
   la carga de la sesión siguiente. Ahora cada serie guarda si el RIR lo eligió
   él (`rirApuntado`), y hay cuatro formas de pedírselo para que Dani elija
   viéndolas (banco `/dev/entreno`). La lógica es una sola; la variante solo
   cambia qué pasa al tocar «Hecha».

     · actual   — como hasta ahora: prerrellenado con el pautado. Por defecto.
     · selector — al tocar «Hecha» sale un selector de un toque (FALLO · 0 · 1 ·
                  2 · 3 · 4+) con el pautado resaltado; elegir marca la serie.
     · vacio    — el RIR llega vacío, con el pautado como pista, y no se puede
                  marcar la serie sin elegirlo.
     · ultima   — como hasta ahora, y al cerrar el ejercicio se pregunta solo
                  por la última serie.
   ═══════════════════════════════════════════════════════════════════════════ */

export type VarianteRir = 'actual' | 'selector' | 'vacio' | 'ultima';

/** La que queda en producción hasta que Dani elija. */
export const VARIANTE_RIR_POR_DEFECTO: VarianteRir = 'actual';

/** Para el conmutador del banco de pruebas. */
export const VARIANTES_RIR: { clave: VarianteRir; etiqueta: string; explicacion: string }[] = [
  { clave: 'actual', etiqueta: 'Actual', explicacion: 'El RIR llega con el pautado. Si no lo tocas, se guarda sin apuntar.' },
  { clave: 'selector', etiqueta: 'Selector', explicacion: 'Al tocar «Hecha» eliges el RIR en un toque y la serie queda marcada.' },
  { clave: 'vacio', etiqueta: 'Vacío', explicacion: 'El RIR llega vacío y no se puede marcar la serie sin elegirlo.' },
  { clave: 'ultima', etiqueta: 'Última', explicacion: 'Como la actual; al cerrar el ejercicio se pregunta por la última serie.' },
];

/** Opciones del selector rápido de un toque. «4+» se guarda como 4. */
export const RIR_RAPIDO: readonly { valor: string; texto: string }[] = [
  { valor: 'fallo', texto: 'FALLO' },
  { valor: '0', texto: '0' },
  { valor: '1', texto: '1' },
  { valor: '2', texto: '2' },
  { valor: '3', texto: '3' },
  { valor: '4', texto: '4+' },
];

/** La opción del selector rápido que corresponde a un RIR ('5' → la de «4+»).
 *  `null` si no es un RIR (vacío o ilegible). */
export function opcionRapidaDe(rir: string | undefined): string | null {
  if (rir === 'fallo') return 'fallo';
  if (rir == null || rir.trim() === '') return null;
  const n = Number(rir);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(Math.min(4, Math.round(n)));
}

/** «pautado: 1» / «pautado: fallo» — la pista que acompaña al RIR del coach. */
export function textoDePautado(pautado: string | undefined): string | null {
  if (pautado == null || pautado === '') return null;
  return `pautado: ${pautado === 'fallo' ? 'fallo' : pautado}`;
}

/**
 * El RIR pautado de toda la tabla en una etiqueta, agrupando series seguidas
 * con el mismo — «RIR 1» si todas piden lo mismo, «RIR 2x2, 1xFALLO» si la
 * última va al máximo. Va junto al rango de repeticiones (ver
 * `resumenRangosPautados`): es el objetivo del coach y sigue a la vista aunque
 * el atleta apunte otro en la fila.
 */
export function resumenRirPautado(pautados: readonly string[]): string | null {
  const grupos: { rir: string; count: number }[] = [];
  for (const p of pautados) {
    if (p == null || p === '') continue;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.rir === p) ultimo.count++;
    else grupos.push({ rir: p, count: 1 });
  }
  if (grupos.length === 0) return null;
  if (grupos.length === 1) return grupos[0].rir === 'fallo' ? 'Al fallo' : `RIR ${grupos[0].rir}`;
  return `RIR ${grupos.map(g => `${g.count}x${rirTexto(g.rir)}`).join(', ')}`;
}

/**
 * Lo que enseña la celda de RIR. En la variante `vacio`, una serie por hacer
 * cuyo RIR aún no ha elegido el atleta se ve vacía aunque por debajo lleve el
 * pautado: así cambiar de variante no toca los datos, solo lo que se pide.
 */
export function rirEnPantalla(fila: Pick<SetInput, 'rir' | 'done' | 'rirApuntado'>, variante: VarianteRir): string {
  return variante === 'vacio' && !fila.done && fila.rirApuntado !== true ? '' : fila.rir;
}

/** El atleta elige el RIR de una fila: se guarda el valor y que lo eligió él. */
export function apuntarRir(actualizar: Actualizar, sIdx: number, valor: string): void {
  actualizar(sIdx, 'rir', valor);
  actualizar(sIdx, 'rirApuntado', true);
}

/** Qué pasa al tocar «Hecha» en una fila sin marcar. */
export type PasoAlMarcar =
  /** Falta apuntar las repeticiones (F23). */
  | 'sin_reps'
  /** Variante `selector`: se abre el selector rápido junto a la fila. */
  | 'elegir_rir'
  /** Variante `vacio`: no se marca hasta que elija el RIR. */
  | 'falta_rir'
  | 'marcar';

/**
 * Lo que toca al dar una fila por hecha, según la variante. Las bajadas y
 * miniseries nunca piden RIR (llevan uno de relleno que no se enseña), y si el
 * atleta ya lo eligió no se le vuelve a preguntar.
 */
export function pasoAlMarcar(
  fila: Pick<SetInput, 'repsDone' | 'segmento' | 'rirApuntado'> | undefined, variante: VarianteRir,
): PasoAlMarcar {
  if (!fila || !tieneReps(fila)) return 'sin_reps';
  if (fila.segmento || fila.rirApuntado === true) return 'marcar';
  if (variante === 'selector') return 'elegir_rir';
  if (variante === 'vacio') return 'falta_rir';
  return 'marcar';
}

/** Lo que se le dice junto a la fila cuando intenta marcarla sin elegir el RIR. */
export const AVISO_SIN_RIR = 'Elige el RIR para marcarla como hecha.';

/**
 * Lo que se guarda en `WorkoutSetLog.rirApuntado` (D1b): `true` si el atleta
 * eligió o cambió el RIR (o marcó fallo); `false` si se quedó el prerrelleno
 * sin tocar. Al CORREGIR una sesión ya guardada se respeta lo que tuviera: un
 * registro antiguo sin la marca sigue sin ella (ahí no se sabe).
 *
 * En la variante `actual` (la de producción mientras Dani no elija otra) un RIR
 * sin tocar se guarda SIN marca, como siempre: marcarlo `false` dejaría sin RM
 * ni récords a todos los atletas de un día para otro, porque hoy casi nadie
 * toca el desplegable. El `false` solo se escribe en las variantes que le
 * piden el RIR al atleta, que es donde «no lo tocó» significa algo.
 */
export function rirApuntadoAlGuardar(
  fila: Pick<SetInput, 'rirApuntado'>, esCorreccion = false, variante: VarianteRir = VARIANTE_RIR_POR_DEFECTO,
): boolean | undefined {
  if (fila.rirApuntado != null) return fila.rirApuntado;
  return esCorreccion || variante === 'actual' ? undefined : false;
}

/** Una fila de la tabla como la serie que se guarda en el registro. */
export function filaASerie(s: SetInput, esCorreccion = false, variante: VarianteRir = VARIANTE_RIR_POR_DEFECTO): WorkoutSetLog {
  const apuntado = rirApuntadoAlGuardar(s, esCorreccion, variante);
  return {
    weight: parseFloat(s.weight) || 0,
    repsDone: parseInt(s.repsDone) || 0,
    rir: s.rir === 'fallo' ? 0 : parseInt(s.rir) || 0,
    alFallo: s.rir === 'fallo',
    ...(s.segmento ? { segmento: true } : {}),
    ...(s.segmento && s.segmentoDe ? { segmentoDe: s.segmentoDe } : {}),
    ...(s.hechaEn ? { hechaEn: s.hechaEn } : {}),
    ...(apuntado != null ? { rirApuntado: apuntado } : {}),
  };
}

/**
 * El RIR que llega de la pantalla de bloqueo. Allí «fallo» se enseña como 0, y
 * el toque vuelve con ese 0: no es que el atleta haya cambiado nada, así que la
 * fila se deja como estaba (`null`). Si el número es otro que el que tenía, lo
 * ha cambiado él y cuenta como apuntado.
 */
export function rirDesdeElBloqueo(rirDeLaFila: string | undefined, rirDelToque: number): { valor: string; apuntado: boolean } | null {
  if (!Number.isFinite(rirDelToque)) return null;
  if (rirDeLaFila === 'fallo' && rirDelToque === 0) return null;
  const valor = String(rirDelToque);
  return { valor, apuntado: valor !== rirDeLaFila };
}

/** Orden de ciclo del selector compacto de la tabla: el valor más bajo (serie
 * más dura) primero, con FALLO como un séptimo escalón aparte, no dentro del
 * 0-5. */
export const RIR_OPCIONES = ['fallo', '0', '1', '2', '3', '4', '5'] as const;

export function rirTexto(valor: string): string {
  return valor === 'fallo' ? 'FALLO' : valor;
}

/** Mismo criterio de color que la primitiva RirScale (ui/RirScale.tsx),
 * aplicado aquí a un `<select>` nativo en vez de a los 7 botones de la
 * primitiva: la tabla no tiene sitio para el selector completo por fila, así
 * que el toque abre la rueda nativa y esto solo pinta el valor ya elegido. */
export function rirClaseColor(valor: string): string {
  if (valor === 'fallo') return 'text-danger';
  const n = Number(valor);
  if (n <= 1) return 'text-accent-ink';
  if (n <= 3) return 'text-accent-ink/70';
  return 'text-ink-2';
}

/**
 * ¿Se puede dar esta fila por hecha? Solo con repeticiones (F23, 17-11-2026).
 * Antes se podía marcar «Hecha» una fila vacía y se guardaba una serie de
 * 0 kg × 0 repeticiones: contaba como serie, bajaba las medias y pasaba a ser
 * «la última vez». El peso NO se exige: 0 kg es lo normal en un ejercicio con
 * el peso del cuerpo.
 */
export function tieneReps(fila: Pick<SetInput, 'repsDone'> | undefined): boolean {
  return !!fila && parseInt(fila.repsDone, 10) > 0;
}

/** Lo que se le dice junto a la fila cuando intenta marcarla sin repeticiones. */
export const AVISO_SIN_REPS = 'Apunta las repeticiones para marcarla como hecha.';

/** Las filas que se guardan como series: marcadas y con repeticiones. Una fila
 *  marcada sin repeticiones (un borrador de antes de F23) no es una serie. */
export function seriesHechas<T extends Pick<SetInput, 'repsDone' | 'done'>>(filas: readonly T[]): T[] {
  return filas.filter(s => s.done && tieneReps(s));
}

/** Fila vacía por defecto para una bajada (dropset) o miniserie (myoreps)
 * añadida a mano por el atleta durante la sesión — mismo shape que cualquier
 * otra serie, sin campo nuevo en el modelo de datos (Contexto del plan:
 * "Dropset/myoreps: solo visual, dato simple"). */
export function nuevaSerieVacia(segmento = false, segmentoDe?: number): SetInput {
  return {
    weight: '', repsDone: '', rir: '0', done: false,
    ...(segmento ? { segmento: true } : {}),
    ...(segmento && segmentoDe ? { segmentoDe } : {}),
  };
}

/**
 * Resumen del rango de repeticiones pautado por el entrenador para TODA la
 * tabla, agrupando series consecutivas con el mismo rango — «8-12» si las
 * cuatro series piden lo mismo, «3x6-7, 1x8-9» si la última serie cambia.
 *
 * Va junto al botón «Historial», no por fila: meterlo debajo de cada input de
 * reps rompía la alineación de la tabla con las demás columnas (Dani,
 * 11-09-2026) — la fila con más contenido estiraba su celda y el input
 * quedaba descentrado respecto al de peso/RIR de al lado.
 *
 * `ExpandedSet` ya trae la prescripción EFECTIVA de la semana
 * (`resolveExerciseForWeek` aplica la progresión antes de expandir), así que
 * en la semana 3 de una progresión sale el rango de la semana 3, no el que el
 * coach escribió el primer día.
 */
export function resumenRangosPautados(sets: { reps: string }[]): string | null {
  const grupos: { reps: string; count: number }[] = [];
  for (const s of sets) {
    const reps = s.reps?.trim();
    if (!reps) continue;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.reps === reps) ultimo.count++;
    else grupos.push({ reps, count: 1 });
  }
  if (grupos.length === 0) return null;
  if (grupos.length === 1) return grupos[0].reps;
  return grupos.map(g => `${g.count}x${g.reps}`).join(', ');
}
