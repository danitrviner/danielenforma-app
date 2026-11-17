import { describe, it, expect, beforeEach, vi } from 'vitest';

/* El plan semanal lo escriben dos pantallas: Mi semana (los platos) y el
   panel de Rutinas (las sesiones fuera, 17-11-2026). Ninguna puede borrar lo
   de la otra. Mismo patrón que catalogoVersionado.test.ts: localStorage en
   memoria y `../firebase` sustituido por lo mínimo. */
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

const estado = { docEnFirestore: null as Record<string, unknown> | null, rechaza: false };

vi.mock('../firebase', () => ({
  db: {},
  doc: (_db: unknown, coleccion: string, id: string) => ({ __doc: `${coleccion}/${id}` }),
  getDoc: async (ref: { __doc: string }) => ({
    id: ref.__doc.split('/')[1],
    exists: () => estado.docEnFirestore != null,
    data: () => estado.docEnFirestore,
  }),
  setDoc: vi.fn(async () => { if (estado.rechaza) throw new Error('permission-denied'); }),
}));
// `core` arrastra Auth y App Check: aquí solo hace falta lo que usa el módulo.
vi.mock('./core', () => ({
  forceLocalOnly: false,
  setLocalBypassMode: () => {},
  stripUndefined: <T,>(o: T) => JSON.parse(JSON.stringify(o)) as T,
  esFalloDePermisos: (err: unknown) => String(err).includes('permission-denied'),
}));
vi.mock('../monitorizacion', () => ({ reportarError: () => {} }));

const { guardarSesionesFuera, savePlanSemanal } = await import('./planSemanal');
const firebaseMock = await import('../firebase');
const setDoc = firebaseMock.setDoc as unknown as ReturnType<typeof vi.fn>;

const EMAIL = 'atleta@ejemplo.com';
const LUNES = '2026-11-16';
const PLATO = { id: 'p1', nombre: 'Arroz con pollo', origen: { tipo: 'receta' as const, id: 'r1' }, macros: { p: 40, hc: 60, g: 10, kcal: 490 }, veces: 5, grupo: 'tanda' as const };

beforeEach(() => {
  localStorage.clear();
  estado.docEnFirestore = null;
  estado.rechaza = false;
  setDoc.mockClear();
});

describe('guardarSesionesFuera', () => {
  it('con el plan de comidas ya guardado, fusiona solo las sesiones: los platos no se tocan', async () => {
    estado.docEnFirestore = { athleteId: EMAIL, semana: LUNES, platos: [PLATO] };
    const plan = await guardarSesionesFuera(EMAIL, LUNES, ['a1']);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, datos, opciones] = setDoc.mock.calls[0];
    expect(ref).toEqual({ __doc: `planesSemanales/${EMAIL}_${LUNES}` });
    expect(Object.keys(datos).sort()).toEqual(['sesionesFuera', 'updatedAt']);
    expect(datos.sesionesFuera).toEqual(['a1']);
    expect(opciones).toEqual({ merge: true });
    // Lo que devuelve (y la copia local) conserva los platos.
    expect(plan.platos).toEqual([PLATO]);
    expect(plan.sesionesFuera).toEqual(['a1']);
  });

  it('sin plan todavía, lo crea con la lista de platos vacía', async () => {
    const plan = await guardarSesionesFuera(EMAIL, LUNES, ['a1', 'a2']);
    const [, datos, opciones] = setDoc.mock.calls[0];
    expect(opciones).toBeUndefined();
    expect(datos).toMatchObject({ athleteId: EMAIL, semana: LUNES, platos: [], sesionesFuera: ['a1', 'a2'] });
    expect(plan.id).toBe(`${EMAIL}_${LUNES}`);
  });
});

describe('guardarSesionesFuera rechazado', () => {
  it('sin permiso, la copia local vuelve a como estaba y el error sube', async () => {
    await guardarSesionesFuera(EMAIL, LUNES, ['a1']);
    estado.rechaza = true;
    await expect(guardarSesionesFuera(EMAIL, LUNES, ['a1', 'a2'])).rejects.toThrow('permission-denied');
    const local = JSON.parse(localStorage.getItem('enforma_planes_semanales_v1') ?? '[]');
    expect(local[0].sesionesFuera).toEqual(['a1']);
  });

  it('sin permiso y sin copia previa, no deja nada en el móvil', async () => {
    estado.rechaza = true;
    await expect(guardarSesionesFuera(EMAIL, LUNES, ['a1'])).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem('enforma_planes_semanales_v1') ?? '[]')).toEqual([]);
  });
});

describe('savePlanSemanal (Mi semana)', () => {
  it('guardar los platos no borra las sesiones fuera: fusiona y no las manda', async () => {
    await guardarSesionesFuera(EMAIL, LUNES, ['a1']);
    setDoc.mockClear();
    const plan = await savePlanSemanal({ athleteId: EMAIL, semana: LUNES, platos: [PLATO] });
    const [, datos, opciones] = setDoc.mock.calls[0];
    expect(opciones).toEqual({ merge: true });
    expect('sesionesFuera' in datos).toBe(false);
    expect(datos.platos).toEqual([PLATO]);
    // La copia local las conserva.
    expect(plan.sesionesFuera).toEqual(['a1']);
  });

  it('si trae sus propias sesiones fuera, sustituye el documento entero como antes', async () => {
    await savePlanSemanal({ athleteId: EMAIL, semana: LUNES, platos: [], sesionesFuera: ['b'] });
    const [, datos, opciones] = setDoc.mock.calls[0];
    expect(opciones).toBeUndefined();
    expect(datos.sesionesFuera).toEqual(['b']);
  });
});
