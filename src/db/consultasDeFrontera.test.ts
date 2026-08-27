import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ═══════════════════════════════════════════════════════════════════════════
   Consultas que piden UN dato en vez del historial entero

   Varias pantallas del atleta leían todos los registros de una colección para
   quedarse con uno: el peso más reciente en Check-in, los dos extremos en
   Destacados, los pasos de hoy en el widget. A los dos años eso son cientos de
   documentos por sesión, creciendo un puñado cada día.

   Lo que se prueba aquí no es que devuelvan «algo», sino las dos cosas que se
   pueden romper en silencio:

   1. Que la consulta se construya con el filtro y el orden correctos — pedir
      el último peso con `asc` devuelve el primero, y nadie se daría cuenta.
   2. Que NO se sobrescriba la copia local. Guardar un único registro donde
      antes vivía el historial dejaría al atleta con un solo dato al quedarse
      sin conexión, sin ningún error de por medio.
   ═══════════════════════════════════════════════════════════════════════════ */

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

/** Lo que la última consulta pidió, para poder afirmar sobre ella. */
const consulta = { filtros: [] as string[], orden: [] as string[], limite: null as number | null };
const estado = { docs: [] as Array<{ id: string; data: Record<string, unknown> }> };

vi.mock('../firebase', () => ({
  db: {},
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (_db: unknown, col: string, id: string) => ({ __doc: `${col}/${id}` }),
  query: (base: unknown, ...clausulas: unknown[]) => {
    clausulas.forEach(c => {
      const cl = c as { __tipo: string; texto?: string; n?: number };
      if (cl.__tipo === 'where') consulta.filtros.push(cl.texto!);
      if (cl.__tipo === 'orderBy') consulta.orden.push(cl.texto!);
      if (cl.__tipo === 'limit') consulta.limite = cl.n!;
    });
    return base;
  },
  where: (campo: string, op: string, valor: unknown) =>
    ({ __tipo: 'where', texto: `${campo} ${op} ${String(valor)}` }),
  orderBy: (campo: string, dir = 'asc') => ({ __tipo: 'orderBy', texto: `${campo} ${dir}` }),
  limit: (n: number) => ({ __tipo: 'limit', n }),
  getDocs: async () => ({
    docs: estado.docs.map(d => ({ id: d.id, data: () => d.data })),
    size: estado.docs.length,
  }),
  addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
}));

vi.mock('./core', () => ({
  forceLocalOnly: false,
  setLocalBypassMode: vi.fn(),
  stripUndefined: (o: unknown) => o,
  esFalloDePermisos: () => false,
}));

const { getPesoExtremo, getStepsForDate, getBodyweightForAthlete } = await import('./athleteMetrics');

const ATLETA = 'atleta@enforma.com';
const CLAVE_PESOS = 'enforma_bodyweight_v1';

beforeEach(() => {
  consulta.filtros = []; consulta.orden = []; consulta.limite = null;
  estado.docs = [];
  localStorage.clear();
});

describe('getPesoExtremo', () => {
  it('pide el más reciente en orden descendente y solo uno', async () => {
    estado.docs = [{ id: 'p9', data: { athleteId: ATLETA, date: '2026-08-20', weight: 74 } }];
    const r = await getPesoExtremo(ATLETA, 'ultimo');
    expect(r?.weight).toBe(74);
    expect(consulta.orden).toEqual(['date desc']);
    expect(consulta.limite).toBe(1);
    expect(consulta.filtros).toContain(`athleteId == ${ATLETA}`);
  });

  it('pide el más antiguo en orden ascendente', async () => {
    estado.docs = [{ id: 'p1', data: { athleteId: ATLETA, date: '2026-01-02', weight: 80 } }];
    const r = await getPesoExtremo(ATLETA, 'primero');
    expect(r?.weight).toBe(80);
    expect(consulta.orden).toEqual(['date asc']);
  });

  it('devuelve null si el atleta no se ha pesado nunca', async () => {
    expect(await getPesoExtremo(ATLETA, 'ultimo')).toBeNull();
  });

  /* Si esto se rompe, el atleta se queda con UN peso sin conexión en vez de su
     historial, y no salta ningún error. */
  it('NO sobrescribe la copia local con el único registro que devuelve', async () => {
    const historial = [
      { id: 'a', athleteId: ATLETA, date: '2026-01-01', weight: 80 },
      { id: 'b', athleteId: ATLETA, date: '2026-08-20', weight: 74 },
    ];
    localStorage.setItem(CLAVE_PESOS, JSON.stringify(historial));
    estado.docs = [{ id: 'b', data: { athleteId: ATLETA, date: '2026-08-20', weight: 74 } }];

    await getPesoExtremo(ATLETA, 'ultimo');

    expect(JSON.parse(localStorage.getItem(CLAVE_PESOS)!)).toHaveLength(2);
  });
});

describe('getStepsForDate', () => {
  it('filtra por atleta Y por fecha, y pide un solo documento', async () => {
    estado.docs = [{ id: 's1', data: { athleteId: ATLETA, date: '2026-08-27', steps: 9000 } }];
    const r = await getStepsForDate(ATLETA, '2026-08-27');
    expect(r?.steps).toBe(9000);
    expect(consulta.filtros).toContain(`athleteId == ${ATLETA}`);
    expect(consulta.filtros).toContain('date == 2026-08-27');
    expect(consulta.limite).toBe(1);
  });

  it('devuelve null si ese día no tiene registro', async () => {
    expect(await getStepsForDate(ATLETA, '2026-08-27')).toBeNull();
  });
});

describe('ventana de historial', () => {
  it('sin ventana no añade filtro de fecha y sí refresca la copia local', async () => {
    estado.docs = [{ id: 'a', data: { athleteId: ATLETA, date: '2026-01-01', weight: 80 } }];
    await getBodyweightForAthlete(ATLETA);
    expect(consulta.filtros.some(f => f.startsWith('date >='))).toBe(false);
    expect(JSON.parse(localStorage.getItem(CLAVE_PESOS)!)).toHaveLength(1);
  });

  it('con ventana añade el filtro y NO toca la copia local', async () => {
    const historial = [{ id: 'viejo', athleteId: ATLETA, date: '2020-01-01', weight: 90 }];
    localStorage.setItem(CLAVE_PESOS, JSON.stringify(historial));
    estado.docs = [{ id: 'a', data: { athleteId: ATLETA, date: '2026-08-01', weight: 74 } }];

    await getBodyweightForAthlete(ATLETA, '2026-06-01');

    expect(consulta.filtros).toContain('date >= 2026-06-01');
    // El registro de 2020 sigue ahí: la ventana no borra el pasado del móvil.
    expect(JSON.parse(localStorage.getItem(CLAVE_PESOS)!)).toEqual(historial);
  });
});
