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
  }),
  getDocsFromCache: async (_ref: unknown) => {
    if (estado.cacheFalla) throw new Error('sin caché local todavía');
    return { docs: (estado.docsCache ?? []).map(d => ({ id: d.id, data: () => d.data })), empty: (estado.docsCache ?? []).length === 0 };
  },
  setDoc: vi.fn(async () => {}),
}));

const { leerCatalogo, marcarCatalogoCambiado } = await import('./catalogoVersionado');
const firebaseMock = await import('../firebase');

const CLAVE_LOCAL = 'enforma_catalogo_version_ejercicios';
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
    localStorage.setItem(CLAVE_LOCAL, '2026-08-26T10:00:00.000Z');
    estado.docsCache = [{ id: 'a', data: { name: 'De la caché local' } }];
    // Si esto se usara, el resultado sería distinto — así se distingue cuál sirvió.
    estado.docsCompletos = [{ id: 'b', data: { name: 'NO debería verse' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'De la caché local' }]);
  });

  it('si la caché local viene vacía (dispositivo nuevo), cae al getDocs completo', async () => {
    estado.versionDoc = { version: 'v1' };
    localStorage.setItem(CLAVE_LOCAL, 'v1');
    estado.docsCache = []; // getDocsFromCache no lanza, pero no trae nada
    estado.docsCompletos = [{ id: 'a', data: { name: 'Del servidor' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Del servidor' }]);
  });

  it('si getDocsFromCache falla (IndexedDB no disponible), cae al getDocs completo', async () => {
    estado.versionDoc = { version: 'v1' };
    localStorage.setItem(CLAVE_LOCAL, 'v1');
    estado.cacheFalla = true;
    estado.docsCompletos = [{ id: 'a', data: { name: 'Del servidor' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Del servidor' }]);
  });
});

describe('leerCatalogo — versión distinta o desconocida', () => {
  it('hace getDocs completo y guarda la versión nueva cuando no coincide', async () => {
    estado.versionDoc = { version: 'v2' };
    localStorage.setItem(CLAVE_LOCAL, 'v1'); // versión vieja en este dispositivo
    estado.docsCompletos = [{ id: 'a', data: { name: 'Versión nueva' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Versión nueva' }]);
    expect(localStorage.getItem(CLAVE_LOCAL)).toBe('v2');
  });

  it('la primera vez en un dispositivo (sin versión local guardada) hace getDocs completo', async () => {
    estado.versionDoc = { version: 'v1' };
    // Sin nada en localStorage todavía.
    estado.docsCompletos = [{ id: 'a', data: { name: 'Primera vez' } }];

    const resultado = await leerCatalogo('ejercicios', 'exercises', mapear);
    expect(resultado).toEqual([{ id: 'a', name: 'Primera vez' }]);
    expect(localStorage.getItem(CLAVE_LOCAL)).toBe('v1');
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
});
