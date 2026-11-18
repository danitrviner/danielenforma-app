import { addDays } from '../trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La semana de la revisión en vídeo (18-11-2026)

   La pantalla de Revisión mira una ventana que elige el coach (7 días, el
   bloque entero, desde la última revisión). Lo que se cuenta en el vídeo, en
   cambio, es SIEMPRE una semana: los 7 días que acaban en el último día de esa
   ventana, comparados con los 7 de antes. Es la comparación fija que pidió
   Dani, además de la del bloque que ya tiene el selector.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SemanaDeRevision {
  /** Primer día de la semana (incluido). */
  desde: string;
  /** Último día (incluido): el final de la ventana de la pantalla. */
  hasta: string;
  /** La semana anterior, los 7 días justo antes. */
  anteriorDesde: string;
  anteriorHasta: string;
}

export function semanaDeRevision(hasta: string): SemanaDeRevision {
  return {
    desde: addDays(hasta, -6),
    hasta,
    anteriorDesde: addDays(hasta, -13),
    anteriorHasta: addDays(hasta, -7),
  };
}

export const enRango = (fecha: string, desde: string, hasta: string) => fecha >= desde && fecha <= hasta;

/** `Date` o ISO a `AAAA-MM-DD` en hora local. `null` si no es una fecha. */
export function diaLocal(valor: Date | string | undefined | null): string | null {
  if (valor == null) return null;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Número a la española con los decimales justos («1.990», «7,3»). */
export function num(n: number, decimales = 1): string {
  const r = Math.round(n * 10 ** decimales) / 10 ** decimales;
  const [entero, dec] = Math.abs(r).toFixed(decimales).split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const signo = r < 0 ? '−' : '';
  return dec && Number(dec) !== 0 ? `${signo}${miles},${dec.replace(/0+$/, '')}` : `${signo}${miles}`;
}
