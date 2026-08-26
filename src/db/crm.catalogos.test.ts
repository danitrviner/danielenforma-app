import { describe, it, expect, beforeEach, vi } from 'vitest';

/* Las cinco colecciones del CRM pasaron a servirse desde la copia local del
   dispositivo (`leerCatalogo`), y eso solo es correcto mientras se cumplan dos
   cosas. Estas pruebas guardan justo esas dos, porque las dos fallan EN
   SILENCIO: no dan error, dan un número de facturación equivocado.

     1. Toda escritura marca el sello de su catálogo. Una que no lo marque deja
        al resto de dispositivos del coach —y a la otra pestaña— sirviendo de
        su caché una lista sin ese cobro, para siempre. El caso peligroso no es
        el de hoy sino el de mañana: quien añada una función de escritura nueva
        y se olvide del sello.

     2. Las consultas por cliente, que antes iban a Firestore con un
        `where('clientId')` y ahora filtran sobre el catálogo completo,
        devuelven exactamente lo mismo. Un filtro de más o de menos aquí es
        dinero atribuido al cliente que no es. */

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: null },
  onAuthStateChanged: () => () => {},
  appCheckListo: Promise.resolve(),
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (a: unknown, b?: string, c?: string) =>
    typeof b === 'string' ? { __doc: `${b}/${c ?? 'auto'}` } : { id: 'nuevo', __doc: 'auto' },
  addDoc: vi.fn(async () => ({ id: 'nuevo' })),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: async () => ({ exists: () => true, data: () => estado.suscripcionEnServidor }),
      set: () => {},
      update: () => {},
    }),
  ),
  writeBatch: () => ({ set: () => {}, commit: async () => {} }),
}));

vi.mock('./core', () => ({
  authReady: Promise.resolve(),
  stripUndefined: (o: unknown) => o,
  conTimeout: (_etiqueta: string, promesa: Promise<unknown>) => promesa,
  EscrituraEncolada: class extends Error {},
}));

/* `leerCatalogo` tiene sus propias pruebas (catalogoVersionado.test.ts). Aquí
   solo interesa QUÉ catálogo se lee y QUÉ sellos se marcan. */
const estado = {
  documentos: [] as Array<Record<string, unknown>>,
  suscripcionEnServidor: {} as Record<string, unknown>,
};

vi.mock('./catalogoVersionado', () => ({
  leerCatalogo: vi.fn(async () => estado.documentos),
  marcarCatalogoCambiado: vi.fn(async () => {}),
}));

const crm = await import('./crm');
const { leerCatalogo, marcarCatalogoCambiado } = await import('./catalogoVersionado');

/** Sellos marcados durante la llamada, en orden de colección. */
function sellosMarcados(): string[] {
  return vi.mocked(marcarCatalogoCambiado).mock.calls.map(c => c[0]).sort();
}

beforeEach(() => {
  estado.documentos = [];
  estado.suscripcionEnServidor = {};
  vi.mocked(marcarCatalogoCambiado).mockClear();
  vi.mocked(leerCatalogo).mockClear();
});

describe('lecturas del CRM — van por el catálogo versionado', () => {
  const casos = [
    ['getCrmContactos', 'crmContactos'],
    ['getCrmServicios', 'crmServicios'],
    ['getCrmPagos', 'crmPagos'],
    ['getCrmSuscripciones', 'crmSuscripciones'],
    ['getCrmReuniones', 'crmReuniones'],
  ] as const;

  for (const [fn, coleccion] of casos) {
    it(`${fn}() lee '${coleccion}' con sello, no la colección entera`, async () => {
      await (crm as unknown as Record<string, () => Promise<unknown>>)[fn]();
      expect(leerCatalogo).toHaveBeenCalledTimes(1);
      // Nombre del sello y nombre de la colección, en ese orden.
      expect(vi.mocked(leerCatalogo).mock.calls[0].slice(0, 2)).toEqual([coleccion, coleccion]);
    });
  }
});

describe('escrituras del CRM — todas marcan su sello', () => {
  const base = { clientId: 'c1', clientNombre: 'Ana', createdBy: 'coach@x.com' };

  it('createCrmContacto', async () => {
    await crm.createCrmContacto({ nombre: 'Ana' } as never);
    expect(sellosMarcados()).toEqual(['crmContactos']);
  });

  it('updateCrmContacto', async () => {
    await crm.updateCrmContacto('c1', { nombre: 'Ana María' });
    expect(sellosMarcados()).toEqual(['crmContactos']);
  });

  it('deleteCrmContacto', async () => {
    await crm.deleteCrmContacto('c1');
    expect(sellosMarcados()).toEqual(['crmContactos']);
  });

  it('importarCrmContactosBatch', async () => {
    await crm.importarCrmContactosBatch([{ nombre: 'Ana' }, { nombre: 'Luis' }] as never);
    expect(sellosMarcados()).toEqual(['crmContactos']);
  });

  it('createCrmServicioConPago sin pago marca solo servicios', async () => {
    await crm.createCrmServicioConPago(
      { ...base, nombre: 'Plan', importeCents: 0, fechaContratacion: '2026-01-01' } as never,
      { generarPago: false },
    );
    expect(sellosMarcados()).toEqual(['crmServicios']);
  });

  it('createCrmServicioConPago con cuotas marca servicios Y pagos', async () => {
    const { pagos } = await crm.createCrmServicioConPago(
      { ...base, nombre: 'Plan 12 semanas', importeCents: 98700, fechaContratacion: '2026-01-01' } as never,
      { generarPago: true, cuotas: 3 },
    );
    expect(pagos).toHaveLength(3);
    expect(sellosMarcados()).toEqual(['crmPagos', 'crmServicios']);
  });

  it('updateCrmServicio', async () => {
    await crm.updateCrmServicio('s1', { nombre: 'Otro' });
    expect(sellosMarcados()).toEqual(['crmServicios']);
  });

  it('archivarCrmServicio (baja lógica, pasa por updateCrmServicio)', async () => {
    await crm.archivarCrmServicio('s1');
    expect(sellosMarcados()).toEqual(['crmServicios']);
  });

  it('createCrmPago', async () => {
    await crm.createCrmPago({ ...base, concepto: 'Mes 1', importeCents: 5000 } as never);
    expect(sellosMarcados()).toEqual(['crmPagos']);
  });

  it('updateCrmPago', async () => {
    await crm.updateCrmPago('p1', { estado: 'pagado' });
    expect(sellosMarcados()).toEqual(['crmPagos']);
  });

  it('deleteCrmPago', async () => {
    await crm.deleteCrmPago('p1');
    expect(sellosMarcados()).toEqual(['crmPagos']);
  });

  it('createCrmSuscripcion', async () => {
    await crm.createCrmSuscripcion({ ...base, concepto: 'Mensual', importeCents: 5000 } as never);
    expect(sellosMarcados()).toEqual(['crmSuscripciones']);
  });

  it('updateCrmSuscripcion', async () => {
    await crm.updateCrmSuscripcion('su1', { importeCents: 6000 });
    expect(sellosMarcados()).toEqual(['crmSuscripciones']);
  });

  it('createCrmReunion', async () => {
    await crm.createCrmReunion({ ...base, fecha: '2026-01-01' } as never);
    expect(sellosMarcados()).toEqual(['crmReuniones']);
  });

  it('updateCrmReunion', async () => {
    await crm.updateCrmReunion('r1', { realizada: true });
    expect(sellosMarcados()).toEqual(['crmReuniones']);
  });

  it('registrarCobroSuscripcion marca pagos Y suscripciones', async () => {
    const sub = {
      id: 'su1', ...base, concepto: 'Mensual', importeCents: 5000,
      periodicidad: 'mensual', proximoCobro: '2026-02-01',
    };
    estado.suscripcionEnServidor = sub;
    await crm.registrarCobroSuscripcion(sub as never, 'coach@x.com');
    expect(sellosMarcados()).toEqual(['crmPagos', 'crmSuscripciones']);
  });

  it('registrarCobroSuscripcion NO marca nada si pierde la carrera', async () => {
    // Otra invocación ya avanzó `proximoCobro`: la transacción lanza
    // `CobroYaRegistrado` y no hay nada nuevo que invalidar — quien ganó ya
    // marcó los dos sellos.
    const sub = {
      id: 'su1', ...base, concepto: 'Mensual', importeCents: 5000,
      periodicidad: 'mensual', proximoCobro: '2026-02-01',
    };
    estado.suscripcionEnServidor = { ...sub, proximoCobro: '2026-03-01' };
    await expect(crm.registrarCobroSuscripcion(sub as never, 'coach@x.com')).rejects.toThrow(
      crm.CobroYaRegistrado,
    );
    expect(sellosMarcados()).toEqual([]);
  });
});

describe('consultas por cliente — filtran el catálogo, sin ir al servidor', () => {
  it('devuelven solo lo del cliente pedido y nada del vecino', async () => {
    estado.documentos = [
      { id: 'a', clientId: 'ana', importeCents: 100 },
      { id: 'b', clientId: 'luis', importeCents: 999 },
      { id: 'c', clientId: 'ana', importeCents: 200 },
    ];
    expect(await crm.getCrmPagosByCliente('ana')).toEqual([
      { id: 'a', clientId: 'ana', importeCents: 100 },
      { id: 'c', clientId: 'ana', importeCents: 200 },
    ]);
    expect(await crm.getCrmServiciosByCliente('luis')).toEqual([
      { id: 'b', clientId: 'luis', importeCents: 999 },
    ]);
    expect(await crm.getCrmSuscripcionesByCliente('nadie')).toEqual([]);
    expect(await crm.getCrmReunionesByCliente('ana')).toHaveLength(2);
  });

  it('no compara de forma laxa: un clientId parecido no cuenta', async () => {
    estado.documentos = [
      { id: 'a', clientId: 'ana' },
      { id: 'b', clientId: 'ana2' },
      { id: 'c', clientId: undefined },
    ];
    expect(await crm.getCrmPagosByCliente('ana')).toEqual([{ id: 'a', clientId: 'ana' }]);
  });
});
