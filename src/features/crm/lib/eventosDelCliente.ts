import type { CrmServicio, CrmPago, CrmSuscripcion } from '../types';
import { hoyIsoLocal } from '../../../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   El historial del cliente, como registro de actividad

   Antes esta pestaña eran métricas agregadas y una lista de servicios. Servía
   para saber CUÁNTO, no para saber QUÉ PASÓ Y CUÁNDO, que es lo que pedía la
   auditoría (§1.6): alta, cambio de servicio, renovación, acciones económicas.

   Sigue siendo 100 % derivado: no hay colección de eventos ni nada que
   mantener sincronizado. Se calcula de lo que ya está cargado en la ficha.

   Dos cosas que se corrigen de paso:

   · Las CUOTAS no son ventas. Un servicio de 3×329 € generaba tres documentos
     de pago, y el contador decía «3 cobros» de un solo plan vendido. Aquí una
     cuota se anota como cobro (que lo es) pero se marca como parte de un plan,
     para que nadie la confunda con una venta nueva.
   · Las SUSCRIPCIONES no salían por ningún lado, ni en el historial ni en el
     resumen, aunque fueran dinero real del cliente.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TipoEvento =
  | 'alta'            // primer servicio contratado
  | 'servicio'        // otro servicio contratado después
  | 'renovacion'      // servicio o cobro marcado como renovación
  | 'suscripcion'     // alta de una suscripción recurrente
  | 'cobro'           // dinero que entró
  | 'devolucion'      // dinero que salió
  | 'fin';            // un servicio llegó a su fecha de fin

export interface EventoDelCliente {
  fecha: string;              // ISO 'YYYY-MM-DD'
  tipo: TipoEvento;
  titulo: string;
  detalle?: string;
  importeCents?: number;
  /** Cuota de un plan fraccionado: cobro real, pero no una venta nueva. */
  esCuota?: boolean;
  /** Para la `key` de React: estable entre renders. */
  id: string;
}

/**
 * Todo lo que le ha pasado a un cliente, de lo más reciente a lo más antiguo.
 *
 * El orden es por fecha descendente y, a igualdad de fecha, por un orden de
 * importancia fijo: primero lo que explica el día (un alta) y después sus
 * consecuencias (el cobro). Sin ese desempate, dos cosas del mismo día salían
 * en el orden en que Firestore las devolviera, que cambia entre cargas.
 */
export function eventosDelCliente(
  servicios: readonly CrmServicio[],
  pagos: readonly CrmPago[],
  suscripciones: readonly CrmSuscripcion[] = [],
): EventoDelCliente[] {
  const eventos: EventoDelCliente[] = [];

  // El primer servicio por fecha es el alta; los demás son contrataciones.
  const porFecha = [...servicios].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  const idDelAlta = porFecha[0]?.id;

  for (const s of servicios) {
    const esRenovacion = s.tipo === 'renovacion';
    eventos.push({
      id: `serv_${s.id}`,
      fecha: s.fechaInicio,
      tipo: esRenovacion ? 'renovacion' : s.id === idDelAlta ? 'alta' : 'servicio',
      titulo: s.nombre,
      detalle: s.descripcion || undefined,
      importeCents: s.importeCents,
    });

    // El fin solo se anota cuando YA ha pasado: un contrato que vence el mes
    // que viene no es historia todavía, es una previsión.
    if (s.fechaFin && s.fechaFin <= hoyISO()) {
      eventos.push({
        id: `fin_${s.id}`,
        fecha: s.fechaFin,
        tipo: 'fin',
        titulo: `Fin de ${s.nombre}`,
      });
    }
  }

  for (const sub of suscripciones) {
    eventos.push({
      id: `sub_${sub.id}`,
      fecha: sub.createdAt.slice(0, 10),
      tipo: 'suscripcion',
      titulo: sub.concepto,
      detalle: `Suscripción ${sub.periodicidad}`,
      importeCents: sub.importeCents,
    });
  }

  for (const p of pagos) {
    // Sin fecha de cobro no ha entrado dinero: es una previsión, no un hecho.
    if (!p.fechaCobro) continue;
    const devuelto = p.importeCents < 0 || p.tipo === 'devolucion';
    eventos.push({
      id: `pago_${p.id}`,
      fecha: p.fechaCobro,
      tipo: devuelto ? 'devolucion' : 'cobro',
      titulo: p.concepto,
      importeCents: p.importeCents,
      // `totalCuotas` lo pone `createCrmServicioConPago` al fraccionar un plan.
      esCuota: (p.totalCuotas ?? 0) > 1,
    });
  }

  return eventos.sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || PESO[a.tipo] - PESO[b.tipo] || a.id.localeCompare(b.id));
}

/** Orden dentro de un mismo día: primero la causa, después el efecto. */
const PESO: Record<TipoEvento, number> = {
  alta: 0, renovacion: 1, servicio: 2, suscripcion: 3, cobro: 4, devolucion: 5, fin: 6,
};

// Tercera copia de «hoy en local» que había en el repo; ahora la compartida.
const hoyISO = hoyIsoLocal;

/**
 * Cuántas VENTAS ha habido, que no es lo mismo que cuántos cobros.
 *
 * Un plan de 3×329 € son tres documentos de pago y una sola venta. El contador
 * anterior decía «3 cobros» y daba a entender tres compras.
 */
export function ventasDe(servicios: readonly CrmServicio[], suscripciones: readonly CrmSuscripcion[] = []): number {
  return servicios.length + suscripciones.length;
}
