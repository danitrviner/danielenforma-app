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
  if (n <= 1) return 'text-accent';
  if (n <= 3) return 'text-accent/70';
  return 'text-ink-2';
}

/** Fila vacía por defecto para una bajada (dropset) o miniserie (myoreps)
 * añadida a mano por el atleta durante la sesión — mismo shape que cualquier
 * otra serie, sin campo nuevo en el modelo de datos (Contexto del plan:
 * "Dropset/myoreps: solo visual, dato simple"). */
export function nuevaSerieVacia(): SetInput {
  return { weight: '', repsDone: '', rir: '0', done: false };
}
