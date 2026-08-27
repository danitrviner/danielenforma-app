import { describe, it, expect, beforeEach, vi } from 'vitest';

/* Las pruebas corren en Node, sin DOM, así que localStorage no existe: se
   monta uno en memoria — mismo patrón que utils/sesionEnCurso.test.ts. */
function montarLocalStorage() {
  const datos = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => { datos.set(k, v); },
    removeItem: (k: string) => { datos.delete(k); },
    clear: () => { datos.clear(); },
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size; },
  });
}
montarLocalStorage();

/* Mismo patrón que escriturasConTimeout.test.ts: se sustituye `../firebase`
   por lo mínimo que este módulo toca, controlable desde cada prueba. */
const estado = {
  versionDoc: null as { version: string } | null,
  docsCache: null as Array<{ id: string; data: Record<string, unknown> }> | null,
  cacheFalla: false,
  docsCompletos: [] as Array<{ id: string; data: Record<string, unknown> }>,
};

vi.mock('../firebase', () => ({
  db: {},
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (_db: unknown, coleccion: string, id: string) => ({ __doc: `${coleccion}/${id}` }),
  getDoc: async (ref: { __doc: string }) => ({
    exists: () => estado.versionDoc != null,
    data: () => estado.versionDoc,
    __ref: ref,
  }),
  getDocs: async (_ref: unknown) => ({
    docs: estado.docsCompletos.map(d => ({ id: d.id, data: () => d.data })),
    size: estado.docsCompletos.length,
  }),
  getDocsFromCache: async (_ref: unknown) => {
    if (estado.cacheFalla) throw new Error('sin caché local todavía');
    const docs = (estado.docsCache ?? []).map(d => ({ id: d.id, data: () => d.data }));
    return { docs, empty: docs.length === 0, size: docs.length };
  },
  setDoc: vi.fn(async () => {}),
}));

const { leerCatalogo, marcarCatalogoCambiado } = await import('./catalogoVersionado');
const firebaseMock = await import('../firebase');

const CLAVE_LOCAL = 'enforma_catalogo_version_ejercicios';
/** Escribe el sello tal y como lo guarda `leerCatalogo`: versión + recuento. */
const sellar = (version: string, n: number) =>
  localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ version, n }));
const mapear = (d: { id: string; data: () => Record<string, unknown> }) => ({ id: d.id, ...d.data() });

beforeEach(() => {
  estado.versionDoc = null;
  estado.docsCache = null;
  estado.cacheFalla = false;
  estado.docsCompletos = [];
  localStorage.clear();
  vi.mocked(firebaseMock.setDoc).mockClear();
});

describe('leerCatalogo — sin documento de versión', () => {
  it('cae al getDocs de siempre si catalogos/{nombre} no existe', async () => {
    estado.docsCompletos = [{ id: 'a', data: { name: 'Sentadilla' } }];
    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Sentadilla' }]);
    // Sin versión que guardar, no debe escribir nada en localStorage.
    expect(localStorage.getItem(CLAVE_LOCAL)).toBeNull();
  });
});

describe('leerCatalogo — versión coincide', () => {
  it('sirve la copia local sin tocar getDocs cuando la versión coincide', async () => {
    estado.versionDoc = { version: '2026-08-26T10:00:00.000Z' };
    sellar('2026-08-26T10:00:00.000Z', 1);
    estado.docsCache = [{ id: 'a', data: { name: 'De la caché local' } }];
    // Si esto se usara, el resultado sería distinto — así se distingue cuál sirvió.
    estado.docsCompletos = [{ id: 'b', data: { name: 'NO debería verse' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'De la caché local' }]);
  });

  it('si la caché local viene vacía (dispositivo nuevo), cae al getDocs completo', async () => {
    estado.versionDoc = { version: 'v1' };
    sellar('v1', 1);
    estado.docsCache = []; // getDocsFromCache no lanza, pero no trae nada
    estado.docsCompletos = [{ id: 'a', data: { name: 'Del servidor' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Del servidor' }]);
  });

  it('si getDocsFromCache falla (IndexedDB no disponible), cae al getDocs completo', async () => {
    estado.versionDoc = { version: 'v1' };
    sellar('v1', 1);
    estado.cacheFalla = true;
    estado.docsCompletos = [{ id: 'a', data: { name: 'Del servidor' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Del servidor' }]);
  });
});

describe('leerCatalogo — caché local incompleta', () => {
  /* El fallo que protegen estas dos: la copia local de Firestore se llena
     documento a documento, y varias consultas parciales escriben en ella sin
     traer el catálogo entero (`getWorkoutsByIds`, los `where('mesocycleId')`,
     el `limit(1)` que comprueba si hay que sembrar). Si el navegador purga
     IndexedDB pero deja el localStorage —Safari lo hace—, el sello sigue
     diciendo «al día» con cuatro documentos sueltos en la caché. Comprobar
     solo que no esté vacía daba esa lista corta por buena: el atleta veía tres
     rutinas en vez de todas, sin un error por ningún sitio. */

  it('NO sirve una caché con menos documentos de los que tenía el catálogo', async () => {
    estado.versionDoc = { version: 'v1' };
    sellar('v1', 40);                         // el catálogo entero son 40
    estado.docsCache = [                      // pero en la caché solo quedan 2
      { id: 'a', data: { name: 'suelto 1' } },
      { id: 'b', data: { name: 'suelto 2' } },
    ];
    estado.docsCompletos = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, data: { name: `Rutina ${i}` } }));

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toHaveLength(40);
    expect(resultado[0]).toEqual({ id: 'w0', name: 'Rutina 0' });
  });

  it('sirve la caché cuando tiene al menos los documentos esperados', async () => {
    estado.versionDoc = { version: 'v1' };
    sellar('v1', 2);
    estado.docsCache = [
      { id: 'a', data: { name: 'de la caché' } },
      { id: 'b', data: { name: 'de la caché' } },
    ];
    estado.docsCompletos = [{ id: 'z', data: { name: 'NO debería verse' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({ id: 'a', name: 'de la caché' });
  });

  it('un sello en el formato antiguo (versión suelta, sin recuento) fuerza relectura', async () => {
    estado.versionDoc = { version: 'v1' };
    localStorage.setItem(CLAVE_LOCAL, 'v1');   // como lo guardaba la versión anterior
    estado.docsCache = [{ id: 'a', data: { name: 'de la caché' } }];
    estado.docsCompletos = [{ id: 'z', data: { name: 'Del servidor' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'z', name: 'Del servidor' }]);
    // Y al releer deja el sello ya en el formato nuevo.
    expect(JSON.parse(localStorage.getItem(CLAVE_LOCAL)!)).toEqual({ version: 'v1', n: 1 });
  });
});

describe('leerCatalogo — versión distinta o desconocida', () => {
  it('hace getDocs completo y guarda la versión nueva cuando no coincide', async () => {
    estado.versionDoc = { version: 'v2' };
    sellar('v1', 1); // versión vieja en este dispositivo
    estado.docsCompletos = [{ id: 'a', data: { name: 'Versión nueva' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Versión nueva' }]);
    expect(JSON.parse(localStorage.getItem(CLAVE_LOCAL)!)).toEqual({ version: 'v2', n: 1 });
  });

  it('la primera vez en un dispositivo (sin versión local guardada) hace getDocs completo', async () => {
    estado.versionDoc = { version: 'v1' };
    // Sin nada en localStorage todavía.
    estado.docsCompletos = [{ id: 'a', data: { name: 'Primera vez' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Primera vez' }]);
    expect(JSON.parse(localStorage.getItem(CLAVE_LOCAL)!)).toEqual({ version: 'v1', n: 1 });
  });
});

describe('marcarCatalogoCambiado', () => {
  it('escribe un sello de versión en catalogos/{nombre}', async () => {
    await marcarCatalogoCambiado('ejercicios');
    expect(firebaseMock.setDoc).toHaveBeenCalledTimes(1);
    const [, datos, opts] = vi.mocked(firebaseMock.setDoc).mock.calls[0];
    expect(datos).toHaveProperty('version');
    expect(opts).toEqual({ merge: true });
  });

  it('no lanza si la escritura falla — no debe bloquear la operación real', async () => {
    vi.mocked(firebaseMock.setDoc).mockRejectedValueOnce(new Error('sin permisos'));
    await expect(marcarCatalogoCambiado('ejercicios')).resolves.toBeUndefined();
  });

  /* El dispositivo que escribe no debe invalidarse a sí mismo. Cuando no se
     refrescaba su sello local, cada edición de un ejercicio le costaba el
     catálogo entero (1.681 lecturas) en la relectura inmediata; ~29 ediciones
     seguidas agotaron la cuota diaria del proyecto el 22-08-2026. */
  it('deja el sello local al día para que el que escribe no se re-descargue el catálogo', async () => {
    sellar('v1', 3);
    await marcarCatalogoCambiado('ejercicios');

    const sello = JSON.parse(localStorage.getItem(CLAVE_LOCAL)!);
    const [, datos] = vi.mocked(firebaseMock.setDoc).mock.calls[0] as unknown as [unknown, { version: string }, unknown];
    expect(sello.version).toBe(datos.version);
    expect(sello.n).toBe(3);
  });

  it('tras marcar el cambio, una relectura se sirve de la caché sin tocar getDocs', async () => {
    sellar('v1', 2);
    await marcarCatalogoCambiado('ejercicios');
    const nueva = (vi.mocked(firebaseMock.setDoc).mock.calls[0] as unknown as [unknown, { version: string }, unknown])[1].version;

    // El servidor ya devuelve la versión nueva (el setDoc fue bien).
    estado.versionDoc = { version: nueva };
    estado.docsCache = [{ id: 'a', data: {} }, { id: 'b', data: {} }];
    estado.docsCompletos = [{ id: 'NO_DEBERIA_LEERSE', data: {} }];

    const r = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(r.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('no inventa un sello si este dispositivo nunca leyó el catálogo', async () => {
    localStorage.removeItem(CLAVE_LOCAL);
    await marcarCatalogoCambiado('ejercicios');
    expect(localStorage.getItem(CLAVE_LOCAL)).toBeNull();
  });
});
