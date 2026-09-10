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

export interface IngresoMensual {
  mes: string; // 'YYYY-MM'
  totalCents: number;
}

/**
 * Dinero que ENTRÓ de verdad en un movimiento.
 *
 * No vale con `estado === 'pagado'`: desde 09-2026 un movimiento puede estar
 * `parcial` (llegó parte) o `impagado` (tenía que haber llegado y no llegó), y
 * un `filter(p => p.estado === 'pagado')` se deja fuera el dinero de los
 * parciales. Los descuentos y devoluciones ya vienen en negativo, así que
 * entran por aquí y restan solos.
 */
export function cobradoDe(m: MovimientoLike): number {
  if (m.estado === 'pagado') return m.importeCents;
  if (m.estado === 'parcial') return m.importeCobradoCents ?? 0;
  return 0;
}

/**
 * Lo que falta por cobrar de un movimiento.
 *
 * Ojo con `estado === 'pendiente'` a pelo: un `impagado` NO es `pendiente`, así
 * que desaparecía de los totales de «pendiente de cobro» — el dinero que más
 * falta hacía era justo el que no se veía por ningún lado.
 */
export function pendienteDe(m: MovimientoLike): number {
  if (m.estado === 'pendiente' || m.estado === 'impagado') return m.importeCents;
  if (m.estado === 'parcial') return m.importeCents - (m.importeCobradoCents ?? 0);
  return 0;
}

/** Suma lo cobrado de una lista de movimientos. */
export function sumaCobrado(movimientos: MovimientoLike[]): number {
  return movimientos.reduce((s, m) => s + cobradoDe(m), 0);
}

/** Suma lo que queda por cobrar, esté al día o impagado. */
export function sumaPendiente(movimientos: MovimientoLike[]): number {
  return movimientos.reduce((s, m) => s + pendienteDe(m), 0);
}

interface MovimientoLike {
  estado: EstadoPagoLike;
  importeCents: number;
  importeCobradoCents?: number;
}

/**
 * Cobrado real por mes (agrupado por `fechaCobro`
 * — NO por `fechaEmision`, que puede caer en un mes distinto de cuando entró
 * el dinero), para los últimos `meses` meses incluyendo el actual. Meses sin
 * ningún pago cobrado salen con `totalCents: 0`, no se omiten — el histograma
 * necesita huecos visibles, no una serie comprimida.
 */
export function ingresosPorMes(
  pagos: (MovimientoLike & { fechaCobro?: string })[],
  meses = 7,
  hoy: Date = new Date()
): IngresoMensual[] {
  const claves = Array.from({ length: meses }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const totales = new Map(claves.map(c => [c, 0]));
  for (const p of pagos) {
    if (!p.fechaCobro) continue;
    const cents = cobradoDe(p);
    if (cents === 0) continue;
    const clave = p.fechaCobro.slice(0, 7);
    if (totales.has(clave)) totales.set(clave, totales.get(clave)! + cents);
  }
  return claves.map(mes => ({ mes, totalCents: totales.get(mes)! }));
}

// Tipado laxo a propósito: `dinero.ts` no importa `EstadoPago` de `../types`
// para no crear una dependencia circular entre lib y types. Tiene que llevar
// los mismos valores que `EstadoPago`: si se añade uno allí y no aquí, esto
// deja de compilar donde se le pasa un `CrmPago`, que es lo que queremos.
type EstadoPagoLike = 'pendiente' | 'pagado' | 'impagado' | 'parcial';

/**
 * % de variación del último mes de la serie respecto al anterior. `null` si
 * no hay mes anterior con el que comparar o si fue 0 (división por cero, y
 * "+∞%" no es un dato útil para el badge).
 */
export function variacionMensualPct(serie: IngresoMensual[]): number | null {
  if (serie.length < 2) return null;
  const anterior = serie[serie.length - 2].totalCents;
  const actual = serie[serie.length - 1].totalCents;
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
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
