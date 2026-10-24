import type { CrmPago, CrmServicio, TipoDeServicio } from '../types';
import { cobradoDe } from './dinero';
import { ETIQUETA_SIN_CLASIFICAR, etiquetaDeTipoServicio } from './catalogoServicios';

/* ═══════════════════════════════════════════════════════════════════════════
   Ingresos por servicio (R-03)

   Agrupa lo cobrado por el TIPO de servicio (trimestral, semestral, anual,
   otro) y no por su nombre escrito a mano. Un servicio sin tipo —o un cobro
   suelto sin servicio— cae en «Sin clasificar»: se ve, no se esconde.

   Las cifras son las mismas que las de «Cash recaudado» (por fecha de COBRO) y
   un test comprueba que los totales cuadran con `resumenPeriodo`:
     · cobrado neto = lo cobrado en el periodo MENOS las devoluciones (las
       devoluciones son movimientos con importe negativo, así que `cobradoDe` ya
       las resta);
     · altas = servicios de alta con algún cobro en el periodo;
     · ticket medio = cobrado de altas ÷ altas;
     · renovación = renovados ÷ (renovados + perdidos) de los servicios que
       terminan en el periodo (los pendientes aún no cuentan).

   NO hay rentabilidad: no existen campos de costes ni comisiones.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FilaIngresos {
  /** Etiqueta para pintar: «Trimestral», …, «Sin clasificar». */
  grupo: string;
  tipo: TipoDeServicio | null;
  cobradoNetoCents: number;
  /** Cuántos movimientos cobrados suman (para «N cobros»). */
  cobros: number;
  altas: number;
  ticketMedioCents: number | null;
  renovados: number;
  perdidos: number;
  /** Porcentaje con un decimal, o `null` si aún no hay ninguno resuelto. */
  tasaRenovacion: number | null;
}

const ORDEN_TIPOS: Array<TipoDeServicio | null> = ['trimestral', 'semestral', 'anual', 'otro', null];

export function ingresosPorServicio(
  pagos: CrmPago[],
  servicios: CrmServicio[],
  desde: string,
  hasta: string,
): FilaIngresos[] {
  const tipoPorServicio = new Map(servicios.map(s => [s.id, s.tipoServicio ?? null]));
  const tipoDe = (servicioId?: string): TipoDeServicio | null =>
    (servicioId ? tipoPorServicio.get(servicioId) : null) ?? null;

  type Acc = {
    neto: number; cobros: number; altasCobradas: number; altasServicios: Set<string>;
    renovados: number; perdidos: number;
  };
  const acc = new Map<TipoDeServicio | null, Acc>();
  const de = (t: TipoDeServicio | null): Acc => {
    let a = acc.get(t);
    if (!a) { a = { neto: 0, cobros: 0, altasCobradas: 0, altasServicios: new Set(), renovados: 0, perdidos: 0 }; acc.set(t, a); }
    return a;
  };

  for (const p of pagos) {
    if (!p.fechaCobro || p.fechaCobro < desde || p.fechaCobro > hasta) continue;
    const cents = cobradoDe(p);
    if (cents === 0) continue;
    const a = de(tipoDe(p.servicioId));
    a.neto += cents;
    if (cents > 0) a.cobros += 1;
    if (p.tipo === 'alta' && cents > 0) {
      a.altasCobradas += cents;
      a.altasServicios.add(p.servicioId ?? `suelto_${p.id}`);
    }
  }

  for (const s of servicios) {
    if (s.archivado || !s.fechaFin || s.fechaFin < desde || s.fechaFin > hasta) continue;
    const a = de(s.tipoServicio ?? null);
    if (s.resultadoRenovacion === 'renovado') a.renovados += 1;
    else if (s.resultadoRenovacion === 'perdido') a.perdidos += 1;
  }

  return ORDEN_TIPOS
    .filter(t => acc.has(t))
    .map((t): FilaIngresos => {
      const a = acc.get(t) as Acc;
      const altas = a.altasServicios.size;
      const resueltos = a.renovados + a.perdidos;
      return {
        grupo: t ? etiquetaDeTipoServicio(t) : ETIQUETA_SIN_CLASIFICAR,
        tipo: t,
        cobradoNetoCents: a.neto,
        cobros: a.cobros,
        altas,
        ticketMedioCents: altas > 0 ? Math.round(a.altasCobradas / altas) : null,
        renovados: a.renovados,
        perdidos: a.perdidos,
        tasaRenovacion: resueltos > 0 ? Math.round((a.renovados / resueltos) * 1000) / 10 : null,
      };
    })
    .filter(f => f.cobradoNetoCents !== 0 || f.altas > 0 || f.renovados + f.perdidos > 0)
    // Por dinero, de más a menos; «Sin clasificar» siempre al final para que se vea que falta.
    .sort((x, y) => (x.tipo === null ? 1 : 0) - (y.tipo === null ? 1 : 0) || y.cobradoNetoCents - x.cobradoNetoCents);
}

/** Suma de las filas: debe coincidir con «Cash recaudado» del mismo periodo. */
export function totalIngresos(filas: FilaIngresos[]): number {
  return filas.reduce((t, f) => t + f.cobradoNetoCents, 0);
}
