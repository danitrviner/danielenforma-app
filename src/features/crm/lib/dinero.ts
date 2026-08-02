// Dinero en céntimos enteros. Ver la nota de convención en ../types.ts.
//
// La regla: en Firestore y en todo el estado de React viaja `importeCents`
// (entero). Los euros solo existen en dos sitios — el `<input>` donde el coach
// escribe, y el texto que lee. Nunca en medio.

const EUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 4990 → «49,90 €» */
export function formatEuros(cents: number): string {
  return EUR.format((cents ?? 0) / 100);
}

/** 4990 → «49,90 €»; 500000 → «5.000 €» (sin decimales si son .00, para tablas densas) */
export function formatEurosCompacto(cents: number): string {
  const v = (cents ?? 0) / 100;
  if (Number.isInteger(v)) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
    }).format(v);
  }
  return EUR.format(v);
}

/**
 * Texto de un input a céntimos. Acepta «49,90», «49.90», «1.234,56», «49 €».
 * Devuelve null si no hay un número reconocible — el llamante decide si eso
 * es un error de validación o un campo vacío.
 */
export function parseEurosACents(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/[€\s]/g, '');
  if (!s) return null;

  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    // «1.234,56» → el último separador manda como decimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (tieneComa) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Math.round evita que 49.90 * 100 = 4989.999... acabe en 4989.
  return Math.round(n * 100);
}

/** 4990 → «49,90» — para precargar un input de edición. */
export function centsAInputEuros(cents: number): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',');
}

export function sumaCents(items: { importeCents: number }[]): number {
  return items.reduce((acc, i) => acc + (i.importeCents ?? 0), 0);
}

/**
 * Reparte un importe en N cuotas enteras en céntimos, sin perder ni un
 * céntimo por redondeo: todas iguales salvo la última, que absorbe el resto
 * de la división. `Math.round(98700 / 3)` tres veces sumaría de más o de
 * menos según el importe — esto no, la suma siempre cuadra exacta.
 */
export function repartirEnCuotas(importeCents: number, cuotas: number): number[] {
  const n = Math.max(1, Math.floor(cuotas));
  const base = Math.floor(importeCents / n);
  const resto = importeCents - base * (n - 1);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? resto : base));
}
