import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { UserProfile } from '../../src/types.js';
import { atletasParaClips } from '../atletas-activos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La lista que ve Clips.

   Dos cosas que, si se rompen, no se notan hasta que es tarde:

     · Quién entra. `estadoCrm` AUSENTE significa activo (los perfiles de antes
       del CRM no lo tienen). Si alguien «arregla» eso exigiendo el campo, los
       clientes más antiguos de Dani desaparecen del selector de Clips sin que
       nadie vea un error.
     · Qué sale. La respuesta se construye campo a campo a propósito. El test
       de abajo compara las CLAVES exactas, así que si un día se devuelve el
       documento entero, falla aquí y no en producción con el teléfono y el DNI
       de un cliente de viaje hacia otra app.
   ═══════════════════════════════════════════════════════════════════════════ */

const SECRETO = 'secreto-de-pruebas';

function perfil(p: Partial<UserProfile>): UserProfile {
  return { role: 'client', email: 'x@x.com', displayName: 'X', ...p } as UserProfile;
}

function respuestaFalsa() {
  const r = { code: 0, body: null as any, cabeceras: {} as Record<string, string> };
  const res = {
    status(c: number) { r.code = c; return res; },
    json(b: unknown) { r.body = b; return res; },
    setHeader(k: string, v: string) { r.cabeceras[k] = v; return res; },
    end() { return res; },
  } as unknown as VercelResponse;
  return { res, r };
}

const peticion = (opciones: { metodo?: string; secreto?: string | null } = {}) => ({
  method: opciones.metodo ?? 'GET',
  headers: opciones.secreto === null ? {} : { authorization: `Bearer ${opciones.secreto ?? SECRETO}` },
  query: {},
} as unknown as VercelRequest);

/** Un Firestore mínimo que SOLO sabe leer: si algo intentara escribir, revienta. */
function firestoreDeSoloLectura(perfiles: Record<string, Partial<UserProfile>>) {
  const lecturas: string[] = [];
  const prohibido = () => { throw new Error('la ruta de atletas activos no debe escribir NADA'); };
  const consulta = (coleccion: string, filtros: [string, string, unknown][]) => ({
    where(campo: string, op: string, valor: unknown) {
      return consulta(coleccion, [...filtros, [campo, op, valor]]);
    },
    async get() {
      lecturas.push(`${coleccion}:${filtros.map(f => f.join(' ')).join(',')}`);
      const docs = Object.entries(perfiles)
        .filter(([, d]) => filtros.every(([campo, op, valor]) => {
          const v = (d as Record<string, unknown>)[campo];
          return op === '==' ? v === valor : true;
        }))
        .map(([id, d]) => ({ id, data: () => d }));
      return { docs };
    },
  });
  return {
    lecturas,
    collection(coleccion: string) {
      return {
        ...consulta(coleccion, []),
        add: prohibido,
        doc: () => ({ set: prohibido, update: prohibido, create: prohibido, delete: prohibido }),
      };
    },
  };
}

async function ejecutar(db: unknown, opciones: Parameters<typeof peticion>[0] = {}) {
  vi.resetModules();
  vi.doMock('../_lib/auth.js', () => ({ getAdminDb: async () => db }));
  const handler = (await import('../atletas-activos.js')).default;
  const { res, r } = respuestaFalsa();
  await handler(peticion(opciones), res);
  return r;
}

beforeEach(() => { process.env.CLIPS_API_SECRET = SECRETO; vi.resetModules(); });

describe('atletasParaClips · quién cuenta como activo', () => {
  it('un estadoCrm AUSENTE cuenta como activo', () => {
    const salida = atletasParaClips([perfil({ email: 'viejo@x.com', displayName: 'Viejo' })]);
    expect(salida.map(a => a.email)).toEqual(['viejo@x.com']);
  });

  it("'activo' explícito también entra", () => {
    const salida = atletasParaClips([perfil({ email: 'a@x.com', estadoCrm: 'activo' })]);
    expect(salida).toHaveLength(1);
  });

  it('pausados, bajas, leads y llamadas agendadas quedan fuera', () => {
    const salida = atletasParaClips([
      perfil({ email: 'pausado@x.com', estadoCrm: 'pausado' }),
      perfil({ email: 'baja@x.com', estadoCrm: 'baja' }),
      perfil({ email: 'lead@x.com', estadoCrm: 'lead' }),
      perfil({ email: 'llamada@x.com', estadoCrm: 'llamada_agendada' }),
      perfil({ email: 'activo@x.com' }),
    ]);
    expect(salida.map(a => a.email)).toEqual(['activo@x.com']);
  });

  it('fuera los anonimizados, los archivados, el coach y los perfiles sin email', () => {
    const salida = atletasParaClips([
      perfil({ email: 'borrado@anonimo.local', anonimizado: true }),
      perfil({ email: 'archivado@x.com', archivadoCrm: true }),
      perfil({ email: 'coach@x.com', role: 'coach' }),
      perfil({ email: '' }),
      perfil({ email: 'activo@x.com' }),
    ]);
    expect(salida.map(a => a.email)).toEqual(['activo@x.com']);
  });

  it('sin nombre se usa el email como etiqueta, y la lista va ordenada', () => {
    const salida = atletasParaClips([
      perfil({ email: 'zoe@x.com', displayName: 'Zoe' }),
      perfil({ email: 'ana@x.com', displayName: '  ' }),
      perfil({ email: 'otro@x.com', displayName: 'Bruno' }),
    ]);
    expect(salida).toEqual([
      { nombre: 'ana@x.com', email: 'ana@x.com' },
      { nombre: 'Bruno', email: 'otro@x.com' },
      { nombre: 'Zoe', email: 'zoe@x.com' },
    ]);
  });

  it('no devuelve NI UN campo más que nombre y email', () => {
    const salida = atletasParaClips([perfil({
      email: 'activo@x.com',
      displayName: 'Ana',
      dni: '12345678Z',
      telefono: { prefijo: '+34', numero: '600000000' },
      direccion: 'Calle Falsa 123',
      actualWeight: 82,
      targetWeight: 75,
      initialWeight: 90,
      estadoCrm: 'activo',
      level: 3,
    })]);
    expect(Object.keys(salida[0]).sort()).toEqual(['email', 'nombre']);
  });
});

describe('api/atletas-activos · la puerta', () => {
  it('sin secreto en la cabecera: 401 y nada más', async () => {
    const db = firestoreDeSoloLectura({ u1: { role: 'client', email: 'a@x.com' } });
    const r = await ejecutar(db, { secreto: null });
    expect(r.code).toBe(401);
    expect(r.body).toEqual({ error: 'No autorizado' });
    // Y no se llega ni a leer la base de datos.
    expect(db.lecturas).toEqual([]);
  });

  it('con el secreto equivocado: 401', async () => {
    const r = await ejecutar(firestoreDeSoloLectura({}), { secreto: 'otro-secreto' });
    expect(r.code).toBe(401);
  });

  it('con un secreto del largo justo pero distinto: 401', async () => {
    const r = await ejecutar(firestoreDeSoloLectura({}), { secreto: 'secreto-de-pruebaX' });
    expect(r.code).toBe(401);
  });

  it('sin CLIPS_API_SECRET configurado: 503, no responde la lista', async () => {
    delete process.env.CLIPS_API_SECRET;
    const r = await ejecutar(firestoreDeSoloLectura({ u1: { role: 'client', email: 'a@x.com' } }));
    expect(r.code).toBe(503);
    expect(r.body.atletas).toBeUndefined();
  });

  it('solo GET: un POST con el secreto bueno se rechaza', async () => {
    const r = await ejecutar(firestoreDeSoloLectura({}), { metodo: 'POST' });
    expect(r.code).toBe(405);
  });

  it('con el secreto bueno devuelve la lista, sin cachear y sin escribir', async () => {
    const db = firestoreDeSoloLectura({
      u1: { role: 'client', email: 'ana@x.com', displayName: 'Ana' },
      u2: { role: 'client', email: 'pausado@x.com', displayName: 'Pausado', estadoCrm: 'pausado' },
      u3: { role: 'coach', email: 'coach@x.com', displayName: 'Coach' },
    });
    const r = await ejecutar(db);
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ atletas: [{ nombre: 'Ana', email: 'ana@x.com' }], total: 1 });
    expect(r.cabeceras['Cache-Control']).toBe('no-store');
    // Una sola lectura, ya filtrada por rol en la propia consulta.
    expect(db.lecturas).toEqual(['user_profiles:role == client']);
  });
});
