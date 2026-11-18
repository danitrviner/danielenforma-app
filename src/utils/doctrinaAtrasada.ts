/* ═══════════════════════════════════════════════════════════════════════════
   La doctrina guardada que se queda atrás (11-11-2026)

   Guardar la doctrina desde el panel del asistente crea una copia entera del
   texto, y desde ese momento el asistente lee la copia y deja de recibir lo
   que cambie en el texto por defecto. El 11-11-2026 las dos copias de
   producción llevaban meses así: la de entrenamiento era el texto del 2 de
   septiembre sin una sola línea propia, y le faltaba todo lo añadido después.

   Dos defensas, las dos puras:
     · un texto igual al de por defecto NO es una copia: no se guarda;
     · cada copia recuerda de qué versión del texto por defecto partió
       (`huella`), y así se puede avisar cuando esa versión ya no es la actual
       y enseñar las líneas que le faltan.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Huella corta de un texto (djb2). Solo para saber si dos versiones son la misma. */
export function huella(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const lineas = (t: string) => t.split('\n').map(l => l.trim()).filter(Boolean);

/** ¿El texto es el de por defecto (salvando espacios al principio y al final)? */
export function esElPorDefecto(texto: string, porDefecto: string): boolean {
  return texto.trim() === porDefecto.trim();
}

/** Líneas del texto por defecto que la copia no tiene, en su orden. */
export function lineasQueFaltan(guardada: string, porDefecto: string): string[] {
  const tiene = new Set(lineas(guardada));
  return lineas(porDefecto).filter(l => !tiene.has(l));
}

export interface DoctrinaAtrasada {
  /** Cuándo se guardó la copia (ISO), si se sabe. */
  desde?: string;
  /** Líneas del texto por defecto actual que no están en la copia. */
  faltan: string[];
  /**
   * `true` = el texto por defecto ha cambiado seguro desde que se guardó.
   * `false` = copia antigua que no recuerda de qué versión partió: le faltan
   * líneas, pero no se puede saber si se quitaron a propósito.
   */
  seguro: boolean;
}

/**
 * Si la copia se ha quedado atrás, cuánto. `null` si está al día: parte de la
 * versión actual del texto por defecto, o no le falta ninguna línea.
 */
export function doctrinaAtrasada(
  copia: { text: string; base?: string; updatedAt?: string }, porDefecto: string,
): DoctrinaAtrasada | null {
  if (copia.base && copia.base === huella(porDefecto)) return null;
  const faltan = lineasQueFaltan(copia.text, porDefecto);
  if (faltan.length === 0) return null;
  return { desde: copia.updatedAt, faltan, seguro: !!copia.base };
}
