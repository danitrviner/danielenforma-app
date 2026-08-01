// Fechas del CRM. Todo se guarda como ISO 'YYYY-MM-DD' (día) o ISO completo
// (instantes). Estas funciones son puras y no dependen de Firestore.
//
// Cuidado con `new Date('2026-08-01')`: JS lo interpreta como UTC medianoche,
// que en España es el 1 de agosto a las 02:00 — pero en zonas al oeste de
// Greenwich cae el día ANTERIOR. Por eso todo lo que parsea un día usa
// `parseDia`, que construye la fecha en hora local.

import type { Periodicidad } from '../types';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' → Date en hora LOCAL a medianoche. */
export function parseDia(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Date → 'YYYY-MM-DD' en hora local (no `toISOString`, que pasa por UTC). */
export function aDiaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function hoyISO(): string {
  return aDiaISO(new Date());
}

/** '2026-08-01' → «01 ago 2026». Cadena vacía si no hay fecha. */
export function formatDia(iso?: string): string {
  if (!iso) return '';
  const d = parseDia(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Días enteros de hoy a `iso`. Positivo = futuro, negativo = pasado. */
export function diasHasta(iso: string, desde: Date = new Date()): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = parseDia(iso);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** «hoy», «mañana», «en 3 días», «hace 12 días»… */
export function tiempoRelativo(iso?: string, desde: Date = new Date()): string {
  if (!iso) return '';
  const d = diasHasta(iso, desde);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  // Se cuenta en días hasta el mes, sin colapsar a semanas: un coach piensa en
  // «hace 12 días», no en «hace 2 sem», y redondear a semanas borra justo la
  // precisión que se usa para decidir si algo se ha ido de plazo.
  const p = Math.abs(d);
  const prefijo = d > 0 ? 'en' : 'hace';
  // `d === 1` y `d === -1` ya han salido arriba como «mañana»/«ayer», así que
  // los días nunca llegan aquí en singular; meses y años sí pueden.
  if (p < 31) return `${prefijo} ${p} días`;
  if (p < 365) return `${prefijo} ${plural(Math.round(p / 30), 'mes', 'meses')}`;
  return `${prefijo} ${plural(Math.floor(p / 365), 'año', 'años')}`;
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const MESES_POR_PERIODO: Record<Exclude<Periodicidad, 'unico'>, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export function mesesDePeriodicidad(p: Periodicidad): number | null {
  return p === 'unico' ? null : MESES_POR_PERIODO[p];
}

/**
 * Avanza un día ISO un periodo. Devuelve el mismo día para 'unico' (un pago
 * único no se repite, así que el llamante no debería llamar aquí).
 *
 * Ojo con el desbordamiento de mes: 31-ene + 1 mes en JS da 3-mar (porque
 * febrero no tiene 31). Aquí se ancla al último día del mes destino → 28-feb.
 * Sin esto, una suscripción dada de alta un día 31 se va desplazando sola.
 */
export function avanzarPeriodo(iso: string, periodicidad: Periodicidad): string {
  const meses = mesesDePeriodicidad(periodicidad);
  if (meses == null) return iso;
  const d = parseDia(iso);
  const diaOriginal = d.getDate();
  const destino = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimoDiaDestino = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(diaOriginal, ultimoDiaDestino));
  return aDiaISO(destino);
}

/** Suma meses a un día ISO, con el mismo anclaje de fin de mes. */
export function sumarMeses(iso: string, meses: number): string {
  const d = parseDia(iso);
  const diaOriginal = d.getDate();
  const destino = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(diaOriginal, ultimoDia));
  return aDiaISO(destino);
}

/** Acepta 'dd/mm/aaaa' y 'aaaa-mm-dd'. Devuelve ISO o null. Para la importación. */
export function parseFechaFlexible(input: string): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return validarYFormatear(Number(y), Number(m), Number(d));
  }
  const es = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (es) {
    const [, d, m, y] = es;
    return validarYFormatear(Number(y), Number(m), Number(d));
  }
  return null;
}

function validarYFormatear(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const fecha = new Date(y, m - 1, d);
  // Rechaza 31/02: JS lo normalizaría a 03/03 en silencio.
  if (fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return aDiaISO(fecha);
}
