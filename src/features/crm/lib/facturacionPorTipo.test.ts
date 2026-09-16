import { describe, it, expect } from 'vitest';
import type { CrmPago, TipoMovimiento } from '../types';
import { facturacionDelMes } from './metricas';

/* El criterio de aceptación que pedía la auditoría (§1.4):
 *
 *   2 nuevas altas por 100 € y 120 €  = 220 €
 *   2 renovaciones por 80 € y 100 €   = 180 €
 *   Total                             = 400 €
 *
 * Una nueva alta NO cuenta como renovación, y al revés.
 *
 * El reparto ya lo hacía bien `facturacionDelMes`. Lo que fallaba estaba aguas
 * arriba: el `tipo` no se escribía casi nunca —ni en «Registrar pago» ni en los
 * cobros que genera una suscripción—, así que el desglose salía en blanco y el
 * panel lo escondía entero. Estos tests fijan la cuenta; los de más abajo,
 * que el tipo llegue a escribirse. */

const cobro = (euros: number, tipo?: TipoMovimiento): CrmPago => ({
  id: `p${Math.random()}`, clientId: 'c1', clientNombre: 'Ana',
  concepto: 'Plan', importeCents: euros * 100,
  estado: 'pagado', fechaEmision: '2026-09-01', fechaCobro: '2026-09-10',
  ...(tipo ? { tipo } : {}),
} as CrmPago);

describe('altas y renovaciones se cuentan por separado', () => {
  const mes = '2026-09';

  it('el ejemplo de la auditoría cuadra', () => {
    const f = facturacionDelMes(
      [cobro(100, 'alta'), cobro(120, 'alta'), cobro(80, 'renovacion'), cobro(100, 'renovacion')],
      mes,
    );
    expect(f.altasCents).toBe(22000);
    expect(f.renovacionesCents).toBe(18000);
    expect(f.totalCents).toBe(40000);
  });

  it('una alta no suma en renovaciones', () => {
    const f = facturacionDelMes([cobro(100, 'alta')], mes);
    expect(f.renovacionesCents).toBe(0);
  });

  it('una renovación no suma en altas', () => {
    const f = facturacionDelMes([cobro(80, 'renovacion')], mes);
    expect(f.altasCents).toBe(0);
  });

  it('un cobro sin tipo suma en el total pero no se reparte', () => {
    // Preferible a repartirlo por adivinación: así se nota que falta el dato.
    const f = facturacionDelMes([cobro(50)], mes);
    expect(f.totalCents).toBe(5000);
    expect(f.altasCents + f.renovacionesCents + f.upsellsCents).toBe(0);
  });

  it('solo cuenta lo cobrado dentro del mes', () => {
    const otroMes = { ...cobro(999, 'alta'), fechaCobro: '2026-08-10' } as CrmPago;
    expect(facturacionDelMes([otroMes], mes).totalCents).toBe(0);
  });

  it('un cobro pendiente todavía no es facturación', () => {
    const pendiente = { ...cobro(300, 'alta'), estado: 'pendiente', fechaCobro: undefined } as CrmPago;
    expect(facturacionDelMes([pendiente], mes).totalCents).toBe(0);
  });
});
