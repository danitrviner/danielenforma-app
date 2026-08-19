import { describe, it, expect } from 'vitest';
import { estadoSuscripcionCliente } from './suscripcionEstado';
import type { CrmSuscripcion } from '../types';

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
