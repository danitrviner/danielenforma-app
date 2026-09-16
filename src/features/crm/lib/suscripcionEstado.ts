import type { CrmServicio, CrmSuscripcion } from '../types';
import { aDiaISO, diasHasta } from './fechas';
import { servicioActual } from '../hooks/useServicios';

/**
 * A cuántos días vista de la fecha clave un plan pasa a "requiere acción" en
 * la lista partida del CRM. Incluye vencidos (`dias` negativo) — un plan ya
 * vencido requiere MÁS atención, no menos.
 */
const UMBRAL_VENCE_PRONTO_DIAS = 7;

/* ═══════════════════════════════════════════════════════════════════════════
   Estado del PLAN de un cliente, no de su suscripción.

   Hasta el 16-09 esto solo miraba `crmSuscripciones`. Pero desde 09-2026 una
   suscripción es un servicio con `renovacionAutomatica` + `proximoCobro`, y
   no se crean suscripciones nuevas — así que TODOS los clientes con un
   servicio vigente salían como «Sin plan asignado» en la lista de activos
   (Dani, 16-09: «te salen sin plan asignado todos, no entiendo por qué»).

   Ahora la fecha clave sale del servicio vigente (`proximoCobro` si se
   renueva solo; si no, `fechaFin`) y, para las suscripciones viejas que
   siguen existiendo, de su `proximoCobro`. Manda la más próxima.
   ═══════════════════════════════════════════════════════════════════════════ */

export type EstadoPlanCliente =
  | { tipo: 'sin_plan' }
  | { tipo: 'vence_pronto'; fecha: string; dias: number; servicio?: CrmServicio; suscripcion?: CrmSuscripcion }
  | { tipo: 'al_dia'; fecha?: string; servicio?: CrmServicio; suscripcion?: CrmSuscripcion };

export function estadoPlanCliente(
  serviciosDelCliente: CrmServicio[],
  suscripcionesDelCliente: CrmSuscripcion[],
  hoy: Date = new Date(),
): EstadoPlanCliente {
  const candidatos: { fecha: string | undefined; servicio?: CrmServicio; suscripcion?: CrmSuscripcion }[] = [];

  const servicio = servicioActual(serviciosDelCliente, aDiaISO(hoy));
  if (servicio) {
    const fecha = servicio.renovacionAutomatica && servicio.proximoCobro ? servicio.proximoCobro : servicio.fechaFin;
    candidatos.push({ fecha, servicio });
  }
  for (const s of suscripcionesDelCliente) {
    if (s.estado === 'activa') candidatos.push({ fecha: s.proximoCobro, suscripcion: s });
  }
  if (candidatos.length === 0) return { tipo: 'sin_plan' };

  // Un servicio sin fin previsto ni renovación no vence nunca: al día, sin fecha.
  const conFecha = candidatos.filter((c): c is typeof c & { fecha: string } => !!c.fecha);
  if (conFecha.length === 0) {
    const { servicio: sv, suscripcion: su } = candidatos[0];
    return { tipo: 'al_dia', servicio: sv, suscripcion: su };
  }
  const proximo = conFecha.reduce((a, b) => (a.fecha <= b.fecha ? a : b));
  const dias = diasHasta(proximo.fecha, hoy);
  if (dias <= UMBRAL_VENCE_PRONTO_DIAS) {
    return { tipo: 'vence_pronto', fecha: proximo.fecha, dias, servicio: proximo.servicio, suscripcion: proximo.suscripcion };
  }
  return { tipo: 'al_dia', fecha: proximo.fecha, servicio: proximo.servicio, suscripcion: proximo.suscripcion };
}

/** @deprecated Solo suscripciones. Se mantiene para los tests antiguos; usar `estadoPlanCliente`. */
export type EstadoAccionSuscripcion = EstadoPlanCliente;
export function estadoSuscripcionCliente(suscripcionesDelCliente: CrmSuscripcion[], hoy: Date = new Date()): EstadoPlanCliente {
  return estadoPlanCliente([], suscripcionesDelCliente, hoy);
}
