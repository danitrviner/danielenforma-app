import { describe, it, expect } from 'vitest';
import type { CrmPago, CrmServicio, EstadoPago, TipoDeServicio, TipoMovimiento } from '../types';
import { ingresosPorServicio, totalIngresos } from './ingresosPorServicio';
import { resumenPeriodo } from './metricas';

let n = 0;
const servicio = (id: string, tipoServicio?: TipoDeServicio, extra: Partial<CrmServicio> = {}): CrmServicio => ({
  id, clientId: 'c', clientNombre: 'Ana', nombre: id, importeCents: 0, periodicidad: 'trimestral',
  fechaContratacion: '2026-09-01', fechaInicio: '2026-09-01', createdAt: '', updatedAt: '', createdBy: 'coach',
  ...(tipoServicio ? { tipoServicio } : {}), ...extra,
} as CrmServicio);
const pago = (servicioId: string | undefined, euros: number, tipo: TipoMovimiento, fechaCobro: string | undefined, estado: EstadoPago = 'pagado'): CrmPago => ({
  id: `p${n++}`, clientId: 'c', clientNombre: 'Ana', concepto: 'x', importeCents: euros * 100, tipo, estado,
  fechaEmision: fechaCobro ?? '2026-09-01', ...(fechaCobro ? { fechaCobro } : {}), createdAt: '', updatedAt: '', createdBy: 'coach',
  ...(servicioId ? { servicioId } : {}),
} as CrmPago);

const D = '2026-09-01', H = '2026-09-30';

describe('ingresosPorServicio', () => {
  const servicios = [servicio('s1', 'trimestral'), servicio('s2', 'trimestral'), servicio('s3', 'anual'), servicio('s4')];

  it('agrupa por tipo y no por el nombre del servicio', () => {
    const f = ingresosPorServicio([
      pago('s1', 300, 'alta', '2026-09-10'), pago('s2', 330, 'alta', '2026-09-12'), pago('s3', 900, 'alta', '2026-09-15'),
    ], servicios, D, H);
    expect(f.map(x => [x.grupo, x.cobradoNetoCents])).toEqual([['Anual', 90000], ['Trimestral', 63000]]);
  });

  it('una devolución resta: el cobrado es neto', () => {
    const f = ingresosPorServicio([
      pago('s1', 300, 'alta', '2026-09-10'), pago('s1', -100, 'devolucion', '2026-09-20'),
    ], servicios, D, H);
    expect(f[0].cobradoNetoCents).toBe(20000);
  });

  it('un servicio sin tipo y un cobro suelto van a «Sin clasificar», al final', () => {
    const f = ingresosPorServicio([
      pago('s4', 500, 'alta', '2026-09-10'), pago(undefined, 50, 'alta', '2026-09-11'), pago('s1', 10, 'renovacion', '2026-09-12'),
    ], servicios, D, H);
    expect(f.map(x => x.grupo)).toEqual(['Trimestral', 'Sin clasificar']);
    expect(f[1].cobradoNetoCents).toBe(55000);
  });

  it('solo cuenta lo cobrado dentro del periodo y por fecha de cobro', () => {
    const f = ingresosPorServicio([
      pago('s1', 300, 'alta', '2026-08-31'), pago('s1', 300, 'alta', '2026-10-01'), pago('s1', 300, 'alta', undefined, 'pendiente'),
      pago('s1', 100, 'alta', '2026-09-30'),
    ], servicios, D, H);
    expect(f).toHaveLength(1);
    expect(f[0].cobradoNetoCents).toBe(10000);
  });

  it('altas y ticket medio: por servicio de alta, no por cuota', () => {
    // Un servicio de 300 € fraccionado en 3 cuotas de 100: UNA alta, ticket 300.
    const f = ingresosPorServicio([
      pago('s1', 100, 'alta', '2026-09-05'), pago('s1', 100, 'alta', '2026-09-15'), pago('s1', 100, 'alta', '2026-09-25'),
      pago('s2', 500, 'alta', '2026-09-10'),
    ], servicios, D, H);
    expect(f[0]).toMatchObject({ altas: 2, ticketMedioCents: 40000 });
  });

  it('la renovación cuenta renovados sobre resueltos de los que terminan en el periodo', () => {
    const f = ingresosPorServicio([pago('s1', 10, 'alta', '2026-09-10')], [
      servicio('s1', 'trimestral', { fechaFin: '2026-09-10', resultadoRenovacion: 'renovado' }),
      servicio('s2', 'trimestral', { fechaFin: '2026-09-20', resultadoRenovacion: 'perdido' }),
      servicio('s5', 'trimestral', { fechaFin: '2026-09-25', resultadoRenovacion: 'pendiente' }), // aún no cuenta
      servicio('s6', 'trimestral', { fechaFin: '2026-10-05', resultadoRenovacion: 'perdido' }),   // fuera del periodo
      servicio('s7', 'trimestral', { fechaFin: '2026-09-12', resultadoRenovacion: 'perdido', archivado: true }), // archivado
    ], D, H);
    expect(f[0]).toMatchObject({ renovados: 1, perdidos: 1, tasaRenovacion: 50 });
  });

  it('sin renovaciones resueltas no hay tasa', () => {
    const f = ingresosPorServicio([pago('s1', 10, 'alta', '2026-09-10')], servicios, D, H);
    expect(f[0].tasaRenovacion).toBeNull();
  });

  it('el total cuadra siempre con «Cash recaudado» del mismo periodo', () => {
    const pagos = [
      pago('s1', 300, 'alta', '2026-09-10'), pago('s3', 900, 'alta', '2026-09-15'), pago('s4', 120, 'renovacion', '2026-09-16'),
      pago(undefined, 40, 'alta', '2026-09-17'), pago('s1', -50, 'devolucion', '2026-09-18'),
      pago('s2', 80, 'alta', '2026-10-02'), pago('s2', 70, 'alta', undefined, 'pendiente'),
      pago('s2', 60, 'alta', '2026-09-19', 'parcial'),
    ];
    pagos[pagos.length - 1].importeCobradoCents = 2500;
    const filas = ingresosPorServicio(pagos, servicios, D, H);
    expect(totalIngresos(filas)).toBe(resumenPeriodo(pagos, D, H).recaudadoCents);
  });
});
