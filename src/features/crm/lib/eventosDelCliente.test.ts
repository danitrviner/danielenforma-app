import { describe, it, expect } from 'vitest';
import type { CrmServicio, CrmPago, CrmSuscripcion } from '../types';
import { eventosDelCliente, ventasDe } from './eventosDelCliente';

const servicio = (over: Partial<CrmServicio> = {}): CrmServicio => ({
  id: 's1', clientId: 'c1', clientNombre: 'Ana', nombre: 'Plan 12 semanas',
  importeCents: 98700, fechaContratacion: '2026-01-10', fechaInicio: '2026-01-10',
  createdAt: '', updatedAt: '', createdBy: 'coach@x.com', ...over,
} as CrmServicio);

const pago = (over: Partial<CrmPago> = {}): CrmPago => ({
  id: 'p1', clientId: 'c1', clientNombre: 'Ana', concepto: 'Plan',
  importeCents: 32900, estado: 'pagado', fechaEmision: '2026-01-10',
  fechaCobro: '2026-01-10', createdAt: '', updatedAt: '', ...over,
} as CrmPago);

describe('eventosDelCliente', () => {
  it('el primer servicio es el alta, los siguientes no', () => {
    const ev = eventosDelCliente(
      [servicio({ id: 'viejo', fechaInicio: '2026-01-10' }), servicio({ id: 'nuevo', fechaInicio: '2026-06-01' })],
      [],
    );
    expect(ev.find(e => e.id === 'serv_viejo')!.tipo).toBe('alta');
    expect(ev.find(e => e.id === 'serv_nuevo')!.tipo).toBe('servicio');
  });

  it('un servicio marcado como renovación se anota como tal, no como alta', () => {
    const ev = eventosDelCliente([servicio({ tipo: 'renovacion' })], []);
    expect(ev[0].tipo).toBe('renovacion');
  });

  it('va de lo más reciente a lo más antiguo', () => {
    const ev = eventosDelCliente(
      [servicio({ id: 'a', fechaInicio: '2026-01-10' }), servicio({ id: 'b', fechaInicio: '2026-06-01' })],
      [],
    );
    expect(ev.map(e => e.fecha)).toEqual(['2026-06-01', '2026-01-10']);
  });

  it('el mismo día, primero la causa y luego el cobro', () => {
    // Sin desempate salían en el orden que devolviera Firestore, que cambia.
    const ev = eventosDelCliente([servicio()], [pago()]);
    expect(ev.map(e => e.tipo)).toEqual(['alta', 'cobro']);
  });

  it('una cuota se marca como tal: es un cobro, no una venta nueva', () => {
    const ev = eventosDelCliente([], [pago({ totalCuotas: 3, numeroCuota: 2 })]);
    expect(ev[0].esCuota).toBe(true);
  });

  it('un cobro suelto no es una cuota', () => {
    expect(eventosDelCliente([], [pago()])[0].esCuota).toBe(false);
  });

  it('un pago sin fecha de cobro no entra: es previsión, no historia', () => {
    expect(eventosDelCliente([], [pago({ estado: 'pendiente', fechaCobro: undefined })])).toEqual([]);
  });

  it('una devolución se distingue de un cobro', () => {
    const ev = eventosDelCliente([], [pago({ importeCents: -5000 })]);
    expect(ev[0].tipo).toBe('devolucion');
  });

  it('las suscripciones aparecen, que antes no salían por ningún lado', () => {
    const sub = {
      id: 'sub1', clientId: 'c1', clientNombre: 'Ana', concepto: 'Mensualidad',
      importeCents: 6000, periodicidad: 'mensual', proximoCobro: '2026-02-01',
      estado: 'activa', createdAt: '2026-01-15T10:00:00.000Z', updatedAt: '', createdBy: '',
    } as CrmSuscripcion;
    const ev = eventosDelCliente([], [], [sub]);
    expect(ev[0].tipo).toBe('suscripcion');
    expect(ev[0].fecha).toBe('2026-01-15');
  });

  it('el fin de un contrato futuro todavía no es historia', () => {
    const ev = eventosDelCliente([servicio({ fechaFin: '2099-12-31' })], []);
    expect(ev.some(e => e.tipo === 'fin')).toBe(false);
  });

  it('el fin de un contrato ya pasado sí se anota', () => {
    const ev = eventosDelCliente([servicio({ fechaFin: '2026-04-01' })], []);
    expect(ev.some(e => e.tipo === 'fin')).toBe(true);
  });

  it('sin nada que contar, no inventa eventos', () => {
    expect(eventosDelCliente([], [])).toEqual([]);
  });
});

describe('ventasDe', () => {
  it('un plan fraccionado en tres cuotas es UNA venta', () => {
    // El contador anterior miraba los pagos y decía «3 cobros», que se leía
    // como tres compras.
    expect(ventasDe([servicio()], [])).toBe(1);
  });

  it('cuenta también las suscripciones', () => {
    expect(ventasDe([servicio()], [{ id: 'sub1' } as CrmSuscripcion])).toBe(2);
  });
});
