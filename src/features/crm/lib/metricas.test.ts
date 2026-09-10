import { describe, expect, it } from 'vitest';
import type { Cliente, CrmPago, CrmServicio } from '../types';
import {
  cobradoDe, pendienteDe, facturacionDelMes, porCobrar, mrr,
  fechaAltaDe, mesesContratados, permanenciaMedia, churnDelMes,
  ltvDe, ltvMedio, ticketMedio, agrupaCobrado,
  renovacionesDelMes, tasaDeRenovacion, estadoFinancieroDe,
} from './metricas';

function mov(p: Partial<CrmPago>): CrmPago {
  return {
    id: 'p1', clientId: 'c1', clientNombre: 'Juan', concepto: 'x',
    importeCents: 0, estado: 'pagado', fechaEmision: '2026-09-01',
    createdAt: '', updatedAt: '', createdBy: 'coach@x.com',
    ...p,
  };
}

function serv(p: Partial<CrmServicio>): CrmServicio {
  return {
    id: 's1', clientId: 'c1', clientNombre: 'Juan', nombre: 'Premium',
    importeCents: 0, periodicidad: 'mensual',
    fechaContratacion: '2026-01-01', fechaInicio: '2026-01-01',
    createdAt: '', updatedAt: '', createdBy: 'coach@x.com',
    ...p,
  };
}

function cli(p: Partial<Cliente>): Cliente {
  return { id: 'c1', fuente: 'contacto', nombre: 'Juan', estadoCrm: 'activo', ...p };
}

describe('cobradoDe / pendienteDe', () => {
  it('un pendiente no es facturación, por vencido que esté', () => {
    expect(cobradoDe(mov({ estado: 'pendiente', importeCents: 60000 }))).toBe(0);
    expect(cobradoDe(mov({ estado: 'impagado', importeCents: 60000 }))).toBe(0);
  });

  it('de un pago parcial solo cuenta lo que llegó', () => {
    const m = mov({ estado: 'parcial', importeCents: 60000, importeCobradoCents: 20000 });
    expect(cobradoDe(m)).toBe(20000);
    expect(pendienteDe(m)).toBe(40000);
  });

  it('un descuento resta solo, porque ya viene en negativo', () => {
    expect(cobradoDe(mov({ tipo: 'descuento', estado: 'pagado', importeCents: -5000 }))).toBe(-5000);
  });

  it('lo ya pagado no queda pendiente', () => {
    expect(pendienteDe(mov({ estado: 'pagado', importeCents: 60000 }))).toBe(0);
  });
});

describe('facturacionDelMes', () => {
  const movimientos = [
    mov({ tipo: 'alta',       estado: 'pagado', importeCents: 100000, fechaCobro: '2026-09-05' }),
    mov({ tipo: 'renovacion', estado: 'pagado', importeCents: 60000,  fechaCobro: '2026-09-20' }),
    mov({ tipo: 'upsell',     estado: 'pagado', importeCents: 30000,  fechaCobro: '2026-09-22' }),
    mov({ tipo: 'descuento',  estado: 'pagado', importeCents: -5000,  fechaCobro: '2026-09-22' }),
    mov({ tipo: 'renovacion', estado: 'pagado', importeCents: 60000,  fechaCobro: '2026-08-01' }), // otro mes
    mov({ tipo: 'renovacion', estado: 'pendiente', importeCents: 60000 }),                          // sin cobrar
  ];

  it('desglosa el mes en altas, renovaciones y upsells', () => {
    const f = facturacionDelMes(movimientos, '2026-09');
    expect(f.altasCents).toBe(100000);
    expect(f.renovacionesCents).toBe(60000);
    expect(f.upsellsCents).toBe(30000);
    expect(f.ajustesCents).toBe(-5000);
    expect(f.totalCents).toBe(185000);
  });

  it('el total incluye el descuento sin que nadie tenga que restarlo', () => {
    expect(facturacionDelMes(movimientos, '2026-09').totalCents)
      .toBe(100000 + 60000 + 30000 - 5000);
  });

  it('un movimiento sin tipo cuenta en el total pero no se reparte a ciegas', () => {
    // Los escritos antes de 09-2026, hasta que pase el script de migración.
    const f = facturacionDelMes([mov({ estado: 'pagado', importeCents: 40000, fechaCobro: '2026-09-09' })], '2026-09');
    expect(f.totalCents).toBe(40000);
    expect(f.altasCents + f.renovacionesCents + f.upsellsCents + f.ajustesCents).toBe(0);
  });

  it('un mes sin nada sale a cero, no falla', () => {
    expect(facturacionDelMes(movimientos, '2026-12').totalCents).toBe(0);
  });
});

describe('porCobrar', () => {
  it('separa lo que aún no toca de lo que ya falla', () => {
    const r = porCobrar([
      mov({ estado: 'pendiente', importeCents: 30000 }),
      mov({ estado: 'impagado',  importeCents: 60000 }),
      mov({ estado: 'pagado',    importeCents: 90000 }),
    ]);
    expect(r.pendienteCents).toBe(30000);
    expect(r.impagadoCents).toBe(60000);
  });

  it('de un parcial queda pendiente lo que falta', () => {
    const r = porCobrar([mov({ estado: 'parcial', importeCents: 60000, importeCobradoCents: 25000 })]);
    expect(r.pendienteCents).toBe(35000);
  });
});

describe('mrr', () => {
  it('reparte el contrato entre los meses que dura, no por la periodicidad declarada', () => {
    // 900 € de julio a diciembre son ~150 €/mes, se cobren de una vez o en tres
    // cuotas. «~» porque los meses se cuentan por días entre 30,44 (la media
    // real), y del 1 de julio al 31 de diciembre hay 184 días = 6,05 meses. La
    // diferencia es de un euro y pico sobre 150: para una cifra de recurrente
    // no importa, y a cambio no hay que decidir qué es «un mes» del 31 de enero.
    const s = serv({ importeCents: 90000, fechaInicio: '2026-07-01', fechaFin: '2026-12-31' });
    const v = mrr([s], '2026-09-10');
    expect(v).toBeGreaterThan(14500);
    expect(v).toBeLessThan(15200);
  });

  it('un servicio ya terminado o aún sin empezar no es recurrente', () => {
    expect(mrr([serv({ importeCents: 90000, fechaInicio: '2025-01-01', fechaFin: '2025-06-30' })], '2026-09-10')).toBe(0);
    expect(mrr([serv({ importeCents: 90000, fechaInicio: '2027-01-01', fechaFin: '2027-06-30' })], '2026-09-10')).toBe(0);
  });

  it('un servicio sin fecha de fin no se puede repartir y no entra', () => {
    expect(mrr([serv({ importeCents: 90000, fechaInicio: '2026-01-01' })], '2026-09-10')).toBe(0);
  });

  it('lo archivado no cuenta', () => {
    const s = serv({ importeCents: 90000, fechaInicio: '2026-07-01', fechaFin: '2026-12-31', archivado: true });
    expect(mrr([s], '2026-09-10')).toBe(0);
  });
});

describe('mesesContratados', () => {
  it('LAS PAUSAS NO CUENTAN: enero-febrero, pausa, y mayo-junio son cuatro meses, no seis', () => {
    // El caso que Dani decidió el 10-09-2026. Sale solo de medir los meses
    // cubiertos por servicios, sin inventar un histórico de pausas.
    const servicios = [
      serv({ id: 'a', fechaInicio: '2026-01-01', fechaFin: '2026-02-28' }),
      serv({ id: 'b', fechaInicio: '2026-05-01', fechaFin: '2026-06-30' }),
    ];
    expect(mesesContratados(servicios, '2026-09-10')).toBeCloseTo(3.9, 0);
  });

  it('dos servicios a la vez son tiempo, no dinero: no se cuentan dos veces', () => {
    const servicios = [
      serv({ id: 'a', fechaInicio: '2026-01-01', fechaFin: '2026-06-30' }),
      serv({ id: 'b', fechaInicio: '2026-03-01', fechaFin: '2026-04-30' }),  // dentro del anterior
    ];
    const soloUno = mesesContratados([servicios[0]], '2026-09-10');
    expect(mesesContratados(servicios, '2026-09-10')).toBe(soloUno);
  });

  it('dos tramos encadenados se funden en uno', () => {
    const seguidos = [
      serv({ id: 'a', fechaInicio: '2026-01-01', fechaFin: '2026-03-31' }),
      serv({ id: 'b', fechaInicio: '2026-03-31', fechaFin: '2026-06-30' }),
    ];
    const deUnaVez = [serv({ id: 'c', fechaInicio: '2026-01-01', fechaFin: '2026-06-30' })];
    expect(mesesContratados(seguidos, '2026-09-10')).toBe(mesesContratados(deUnaVez, '2026-09-10'));
  });

  it('un servicio en curso cuenta hasta hoy', () => {
    expect(mesesContratados([serv({ fechaInicio: '2026-06-10' })], '2026-09-10')).toBeCloseTo(3, 0);
  });

  it('sin servicios, cero', () => {
    expect(mesesContratados([], '2026-09-10')).toBe(0);
  });
});

describe('permanenciaMedia', () => {
  it('promedia solo a los que han contratado algo', () => {
    const mapa = new Map([
      ['c1', [serv({ fechaInicio: '2026-01-01', fechaFin: '2026-06-30' })]],  // ~6 meses
      ['c2', [serv({ fechaInicio: '2026-01-01', fechaFin: '2026-12-31' })]],  // ~12 meses
      ['c3', []],                                                             // un lead
    ]);
    const media = permanenciaMedia(mapa, '2026-09-10')!;
    expect(media).toBeGreaterThan(8);
    expect(media).toBeLessThan(10);
  });

  it('sin nadie que haya contratado, no hay media que dar', () => {
    expect(permanenciaMedia(new Map(), '2026-09-10')).toBeNull();
  });
});

describe('churnDelMes', () => {
  // Todos con un servicio empezado en enero: ya eran clientes en septiembre.
  const desdeEnero = (...ids: string[]) =>
    new Map(ids.map(id => [id, [serv({ clientId: id, fechaInicio: '2026-01-01' })]]));

  it('bajas del mes sobre los que ya eran clientes', () => {
    const clientes = [
      cli({ id: 'a', fechaBaja: '2026-09-15' }),
      cli({ id: 'b' }), cli({ id: 'c' }), cli({ id: 'd' }),
    ];
    expect(churnDelMes(clientes, '2026-09', desdeEnero('a', 'b', 'c', 'd'))).toBe(25);
  });

  it('LOS LEADS NO CUENTAN EN EL DENOMINADOR', () => {
    // Cinco clientes de verdad y una baja son un 20 %. Con diez contactos
    // nuevos apuntados ese mes salía un 7 % — un churn que mejora cuando
    // entran leads no mide nada.
    const clientes = [
      cli({ id: 'a', fechaBaja: '2026-09-15' }),
      cli({ id: 'b' }), cli({ id: 'c' }), cli({ id: 'd' }), cli({ id: 'e' }),
      ...Array.from({ length: 10 }, (_, i) => cli({ id: `lead${i}`, estadoCrm: 'lead' })),
    ];
    expect(churnDelMes(clientes, '2026-09', desdeEnero('a', 'b', 'c', 'd', 'e'))).toBe(20);
  });

  it('quien empezó ESTE mes no estaba al empezarlo', () => {
    const clientes = [cli({ id: 'a', fechaBaja: '2026-09-20' }), cli({ id: 'nuevo' })];
    const servicios = new Map([
      ['a', [serv({ clientId: 'a', fechaInicio: '2026-01-01' })]],
      ['nuevo', [serv({ clientId: 'nuevo', fechaInicio: '2026-09-05' })]],
    ]);
    expect(churnDelMes(clientes, '2026-09', servicios)).toBe(100);
  });

  it('quien ya se había ido antes tampoco estaba', () => {
    const clientes = [cli({ id: 'a', fechaBaja: '2026-09-15' }), cli({ id: 'viejo', fechaBaja: '2026-03-01' })];
    expect(churnDelMes(clientes, '2026-09', desdeEnero('a', 'viejo'))).toBe(100);
  });

  it('sin nadie activo no hay churn que calcular: es ruido, no un 100 %', () => {
    expect(churnDelMes([], '2026-09', new Map())).toBeNull();
    expect(churnDelMes([cli({ id: 'solo-lead' })], '2026-09', new Map())).toBeNull();
  });

  it('una baja de otro mes no cuenta en este', () => {
    expect(churnDelMes([cli({ id: 'a', fechaBaja: '2026-07-01' }), cli({ id: 'b' })], '2026-09', desdeEnero('b'))).toBe(0);
  });
});

describe('ltvDe / ltvMedio / ticketMedio', () => {
  const juan = [
    mov({ tipo: 'alta',       estado: 'pagado', importeCents: 100000 }),
    mov({ tipo: 'renovacion', estado: 'pagado', importeCents: 60000 }),
    mov({ tipo: 'devolucion', estado: 'pagado', importeCents: -10000 }),
    mov({ tipo: 'renovacion', estado: 'pendiente', importeCents: 60000 }),  // aún no ha entrado
  ];

  it('el LTV es lo cobrado, neto de devoluciones y sin contar lo pendiente', () => {
    expect(ltvDe(juan)).toBe(150000);
  });

  it('el LTV medio ignora a los leads, que si no hunden la media', () => {
    const mapa = new Map([['juan', juan], ['lead', []]]);
    expect(ltvMedio(mapa)).toBe(150000);
  });

  it('el ticket medio de alta mira solo las altas cobradas', () => {
    const movimientos = [
      mov({ tipo: 'alta', estado: 'pagado', importeCents: 100000 }),
      mov({ tipo: 'alta', estado: 'pagado', importeCents: 80000 }),
      mov({ tipo: 'alta', estado: 'pendiente', importeCents: 999999 }),
      mov({ tipo: 'renovacion', estado: 'pagado', importeCents: 60000 }),
    ];
    expect(ticketMedio(movimientos, 'alta')).toBe(90000);
  });

  it('sin ventas de ese tipo no se inventa un ticket', () => {
    expect(ticketMedio([], 'alta')).toBeNull();
  });
});

describe('agrupaCobrado', () => {
  it('ordena de más a menos dinero', () => {
    const filas = [
      { servicio: 'Básico',  cents: 30000 },
      { servicio: 'Premium', cents: 100000 },
      { servicio: 'Básico',  cents: 30000 },
    ];
    expect(agrupaCobrado(filas, f => f.servicio, f => f.cents)).toEqual([
      { grupo: 'Premium', totalCents: 100000, n: 1 },
      { grupo: 'Básico',  totalCents: 60000,  n: 2 },
    ]);
  });

  it('las filas sin grupo se quedan fuera en vez de crear un grupo vacío', () => {
    expect(agrupaCobrado([{ canal: undefined, cents: 100 }], f => f.canal, f => f.cents)).toEqual([]);
  });
});

describe('renovacionesDelMes', () => {
  const servicios = [
    serv({ id: 'a', importeCents: 60000, fechaFin: '2026-10-15', resultadoRenovacion: 'renovado' }),
    serv({ id: 'b', importeCents: 30000, fechaFin: '2026-10-18' }),                                    // pendiente
    serv({ id: 'c', importeCents: 60000, fechaFin: '2026-10-21', resultadoRenovacion: 'perdido' }),
    serv({ id: 'd', importeCents: 99999, fechaFin: '2026-11-01', resultadoRenovacion: 'renovado' }),   // otro mes
    serv({ id: 'e', importeCents: 99999, fechaFin: '2026-10-30', archivado: true }),
  ];

  it('el cuadro del mes sale de los servicios que caducan, sin ninguna colección de suscripciones', () => {
    expect(renovacionesDelMes(servicios, '2026-10')).toEqual({
      previstoCents: 150000, renovadoCents: 60000, pendienteCents: 30000, perdidoCents: 60000,
    });
  });

  it('lo previsto es la suma de las tres columnas', () => {
    const r = renovacionesDelMes(servicios, '2026-10');
    expect(r.renovadoCents + r.pendienteCents + r.perdidoCents).toBe(r.previstoCents);
  });

  it('un servicio sin fecha de fin no caduca y no entra', () => {
    expect(renovacionesDelMes([serv({ importeCents: 60000 })], '2026-10').previstoCents).toBe(0);
  });
});

describe('tasaDeRenovacion', () => {
  it('los pendientes no cuentan: todavía no se sabe', () => {
    const servicios = [
      serv({ id: 'a', resultadoRenovacion: 'renovado' }),
      serv({ id: 'b', resultadoRenovacion: 'renovado' }),
      serv({ id: 'c', resultadoRenovacion: 'renovado' }),
      serv({ id: 'd', resultadoRenovacion: 'perdido' }),
      serv({ id: 'e', resultadoRenovacion: 'pendiente' }),
      serv({ id: 'f' }),
    ];
    expect(tasaDeRenovacion(servicios)).toBe(75);
  });

  it('sin ninguna resuelta no hay tasa', () => {
    expect(tasaDeRenovacion([serv({})])).toBeNull();
  });
});

describe('estadoFinancieroDe', () => {
  it('manda lo peor: un impagado suelto deja al cliente impagado', () => {
    expect(estadoFinancieroDe([
      mov({ estado: 'pagado', importeCents: 60000 }),
      mov({ estado: 'pagado', importeCents: 60000 }),
      mov({ estado: 'impagado', importeCents: 60000 }),
    ])).toBe('impagado');
  });

  it('un impagado pesa más que un parcial y un parcial más que un pendiente', () => {
    expect(estadoFinancieroDe([mov({ estado: 'parcial' }), mov({ estado: 'pendiente' })])).toBe('parcial');
    expect(estadoFinancieroDe([mov({ estado: 'impagado' }), mov({ estado: 'parcial' })])).toBe('impagado');
  });

  it('todo cobrado es estar al día, y sin movimientos también', () => {
    expect(estadoFinancieroDe([mov({ estado: 'pagado' })])).toBe('al_dia');
    expect(estadoFinancieroDe([])).toBe('al_dia');
  });
});

describe('fechaAltaDe', () => {
  it('es el inicio del primer servicio, no la fecha de contratación', () => {
    const servicios = [
      serv({ id: 'b', fechaContratacion: '2025-12-01', fechaInicio: '2026-03-01' }),
      serv({ id: 'a', fechaContratacion: '2026-01-15', fechaInicio: '2026-01-20' }),
    ];
    expect(fechaAltaDe(servicios)).toBe('2026-01-20');
  });

  it('un lead sin servicios no tiene fecha de alta', () => {
    expect(fechaAltaDe([])).toBeNull();
  });
});
