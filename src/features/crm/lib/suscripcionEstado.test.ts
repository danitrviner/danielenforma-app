import { describe, it, expect } from 'vitest';
import { estadoSuscripcionCliente, estadoPlanCliente } from './suscripcionEstado';
import type { CrmServicio, CrmSuscripcion } from '../types';

function sub(overrides: Partial<CrmSuscripcion>): CrmSuscripcion {
  return {
    id: 's1',
    clientId: 'c1',
    clientNombre: 'Ana',
    concepto: 'Mensual',
    importeCents: 4990,
    periodicidad: 'mensual',
    proximoCobro: '2026-08-15',
    estado: 'activa',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    createdBy: 'coach@enforma.com',
    ...overrides,
  };
}

describe('estadoSuscripcionCliente', () => {
  const hoy = new Date(2026, 7, 1); // 1 ago 2026

  it('sin suscripciones activas → sin_plan', () => {
    expect(estadoSuscripcionCliente([], hoy)).toEqual({ tipo: 'sin_plan' });
  });

  it('solo suscripciones pausadas → sin_plan (no cuentan como plan vigente)', () => {
    const estado = estadoSuscripcionCliente([sub({ estado: 'pausada', proximoCobro: '2026-08-02' })], hoy);
    expect(estado.tipo).toBe('sin_plan');
  });

  it('próximo cobro a más de 7 días → al_dia', () => {
    const estado = estadoSuscripcionCliente([sub({ proximoCobro: '2026-08-20' })], hoy);
    expect(estado.tipo).toBe('al_dia');
  });

  it('próximo cobro dentro de 7 días → vence_pronto', () => {
    const estado = estadoSuscripcionCliente([sub({ proximoCobro: '2026-08-05' })], hoy);
    expect(estado).toMatchObject({ tipo: 'vence_pronto', dias: 4 });
  });

  it('próximo cobro ya vencido → vence_pronto con días negativos', () => {
    const estado = estadoSuscripcionCliente([sub({ proximoCobro: '2026-07-20' })], hoy);
    expect(estado).toMatchObject({ tipo: 'vence_pronto', dias: -12 });
  });

  it('con varias activas, evalúa la de próximo cobro más cercano', () => {
    const estado = estadoSuscripcionCliente(
      [sub({ id: 's-lejos', proximoCobro: '2026-09-01' }), sub({ id: 's-cerca', proximoCobro: '2026-08-03' })],
      hoy
    );
    expect(estado).toMatchObject({ tipo: 'vence_pronto' });
    expect((estado as { suscripcion: CrmSuscripcion }).suscripcion.id).toBe('s-cerca');
  });
});

function servicio(overrides: Partial<CrmServicio>): CrmServicio {
  return {
    id: 'sv1', clientId: 'c1', clientNombre: 'Ana', nombre: 'Asesoría 6 meses',
    importeCents: 75000, tipo: 'alta', periodicidad: 'unico',
    fechaContratacion: '2026-06-01', fechaInicio: '2026-06-01', fechaFin: '2026-12-01',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', createdBy: 'coach@enforma.com',
    ...overrides,
  } as CrmServicio;
}

describe('estadoPlanCliente (servicios, que es lo que existe desde 09-2026)', () => {
  const hoy = new Date(2026, 7, 1); // 1 ago 2026

  it('un servicio vigente NO es «sin plan» — el fallo que Dani vio en todos los activos', () => {
    const r = estadoPlanCliente([servicio({})], [], hoy);
    expect(r.tipo).toBe('al_dia');
    expect(r.tipo === 'al_dia' && r.fecha).toBe('2026-12-01');
  });

  it('un servicio que acaba en menos de 7 días requiere acción, con su fecha', () => {
    const r = estadoPlanCliente([servicio({ fechaFin: '2026-08-05' })], [], hoy);
    expect(r).toMatchObject({ tipo: 'vence_pronto', fecha: '2026-08-05', dias: 4 });
  });

  it('si se renueva solo, manda el próximo cobro y no el fin', () => {
    const r = estadoPlanCliente([servicio({ renovacionAutomatica: true, proximoCobro: '2026-08-03', fechaFin: '2027-01-01' })], [], hoy);
    expect(r).toMatchObject({ tipo: 'vence_pronto', fecha: '2026-08-03' });
  });

  it('un servicio archivado o ya terminado no cuenta', () => {
    expect(estadoPlanCliente([servicio({ archivado: true })], [], hoy).tipo).toBe('sin_plan');
    expect(estadoPlanCliente([servicio({ fechaFin: '2026-07-01' })], [], hoy).tipo).toBe('sin_plan');
  });

  it('sin fin previsto ni renovación: al día, sin fecha', () => {
    const r = estadoPlanCliente([servicio({ fechaFin: undefined })], [], hoy);
    expect(r).toEqual(expect.objectContaining({ tipo: 'al_dia' }));
    expect(r.tipo === 'al_dia' && r.fecha).toBeUndefined();
  });

  it('con servicio y suscripción vieja a la vez manda la fecha más próxima', () => {
    const r = estadoPlanCliente([servicio({ fechaFin: '2026-12-01' })], [sub({ proximoCobro: '2026-08-04' })], hoy);
    expect(r).toMatchObject({ tipo: 'vence_pronto', fecha: '2026-08-04' });
    expect(r.tipo === 'vence_pronto' && r.suscripcion?.id).toBe('s1');
  });
});
