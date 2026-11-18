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
  /** D1b: el RIR de esta fila lo ha elegido el atleta (lo cambió o marcó
   *  fallo). Sin la marca, el RIR que hay es el prerrelleno con el pautado.
   *  Ver `WorkoutSetLog.rirApuntado`. */
  rirApuntado?: boolean;
}

type Actualizar = (sIdx: number, field: keyof SetInput, value: string | boolean) => void;

/* ═══════════════════════════════════════════════════════════════════════════
   Cómo se apunta el RIR (D1, 17-11-2026)

   El RIR llega prerrellenado con el pautado y el atleta lo puede cambiar. Un
   toque en «Hecha» lo guardaba como si fuera suyo: ese dato entraba en el RM
   estimado y en la carga de la sesión siguiente. Ahora cada serie guarda si el
   RIR lo eligió él (`rirApuntado`): si lo cambia o marca fallo, queda apuntado;
   si no lo toca, se guarda sin marca, como siempre.
   ═══════════════════════════════════════════════════════════════════════════ */

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

/** El atleta elige el RIR de una fila: se guarda el valor y que lo eligió él. */
export function apuntarRir(actualizar: Actualizar, sIdx: number, valor: string): void {
  actualizar(sIdx, 'rir', valor);
  actualizar(sIdx, 'rirApuntado', true);
}

/**
 * Una fila de la tabla como la serie que se guarda en el registro. La marca
 * `rirApuntado` (D1b) solo va si el atleta eligió o cambió el RIR (o marcó
 * fallo): un RIR sin tocar se guarda SIN marca, como siempre. Al corregir una
 * sesión ya guardada la fila trae la marca que tuviera el registro y se respeta.
 */
export function filaASerie(s: SetInput): WorkoutSetLog {
  return {
    weight: parseFloat(s.weight) || 0,
    repsDone: parseInt(s.repsDone) || 0,
    rir: s.rir === 'fallo' ? 0 : parseInt(s.rir) || 0,
    alFallo: s.rir === 'fallo',
    ...(s.segmento ? { segmento: true } : {}),
    ...(s.segmento && s.segmentoDe ? { segmentoDe: s.segmentoDe } : {}),
    ...(s.hechaEn ? { hechaEn: s.hechaEn } : {}),
    ...(s.rirApuntado != null ? { rirApuntado: s.rirApuntado } : {}),
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
