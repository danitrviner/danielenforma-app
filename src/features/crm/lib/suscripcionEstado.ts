import type { CrmSuscripcion } from '../types';
import { diasHasta } from './fechas';

/**
 * A cuántos días vista de un `proximoCobro` una suscripción pasa a
 * "requiere acción" en la lista partida del CRM. Incluye vencidas (`dias`
 * negativo) — una suscripción ya vencida requiere MÁS atención, no menos.
 */
const UMBRAL_VENCE_PRONTO_DIAS = 7;

export type EstadoAccionSuscripcion =
  | { tipo: 'sin_plan' }
  | { tipo: 'vence_pronto'; suscripcion: CrmSuscripcion; dias: number }
  | { tipo: 'al_dia'; suscripcion: CrmSuscripcion };

/**
 * Estado de un cliente para la lista partida Requiere-acción/Al-día del CRM.
 * Con varias suscripciones activas a la vez, se evalúa la de `proximoCobro`
 * más próximo — es la primera que necesitaría atención.
 */
export function estadoSuscripcionCliente(
  suscripcionesDelCliente: CrmSuscripcion[],
  hoy: Date = new Date()
): EstadoAccionSuscripcion {
  const activas = suscripcionesDelCliente.filter(s => s.estado === 'activa');
  if (activas.length === 0) return { tipo: 'sin_plan' };

  const proxima = activas.reduce((a, b) => (a.proximoCobro <= b.proximoCobro ? a : b));
  const dias = diasHasta(proxima.proximoCobro, hoy);
  if (dias <= UMBRAL_VENCE_PRONTO_DIAS) return { tipo: 'vence_pronto', suscripcion: proxima, dias };
  return { tipo: 'al_dia', suscripcion: proxima };
}
