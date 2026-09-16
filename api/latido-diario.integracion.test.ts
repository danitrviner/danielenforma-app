import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* ═══════════════════════════════════════════════════════════════════════════
   El latido de punta a punta, contra un Firestore de mentira.

   Los otros tests cubren las piezas: `utils/latidoDiario` decide bien, la
   puerta del endpoint no deja pasar a nadie. Lo que falta cubrir es el CABLE:
   que los lectores de `db-admin` pidan las colecciones que son, que las
   acciones que devuelve el orquestador se traduzcan en las escrituras
   correctas, y que un atleta que revienta no se lleve por delante al
   siguiente. Sin esto, la primera vez que se ejecuta de verdad es a las dos de
   la mañana en producción.
   ═══════════════════════════════════════════════════════════════════════════ */

const SECRETO = 'secreto-de-pruebas';
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
function haceDias(n: number): string {
  const [y, m, d] = HOY.split('-').map(Number);
  const f = new Date(y, m - 1, d - n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

type Doc = Record<string, unknown> & { id?: string };
type Escritura = { coleccion: string; id: string; op: 'set' | 'update' | 'create'; datos: unknown };

/** Un Firestore mínimo: lo justo que usa `api/_lib/db-admin.ts`. */
function firestoreFalso(datos: Record<string, Record<string, Doc>>, opciones: { revientaEn?: string } = {}) {
  const escrituras: Escritura[] = [];

  const hacerConsulta = (coleccion: string, filtros: [string, string, unknown][]) => ({
    where(campo: string, op: string, valor: unknown) {
      return hacerConsulta(coleccion, [...filtros, [campo, op, valor]]);
    },
    async get() {
      if (opciones.revientaEn === coleccion) throw new Error(`boom en ${coleccion}`);
      const docs = Object.entries(datos[coleccion] ?? {})
        .filter(([, d]) => filtros.every(([campo, op, valor]) => {
          const v = (d as Record<string, unknown>)[campo];
          if (op === '==') return v === valor;
          if (op === 'in') return (valor as unknown[]).includes(v);
          if (op === '>=') return String(v) >= String(valor);
          return true;
        }))
        .map(([id, d]) => ({ id, data: () => d }));
      return { docs };
    },
  });

  return {
    collection(coleccion: string) {
      return {
        ...hacerConsulta(coleccion, []),
        doc(id: string) {
          return {
            id,
            get: async () => {
              const d = datos[coleccion]?.[id];
              return { exists: !!d, id, data: () => d };
            },
            set: async (v: unknown) => { escrituras.push({ coleccion, id, op: 'set', datos: v }); },
            update: async (v: unknown) => { escrituras.push({ coleccion, id, op: 'update', datos: v }); },
            create: async (v: unknown) => {
              if (datos[coleccion]?.[id]) throw new Error('ya existe');
              escrituras.push({ coleccion, id, op: 'create', datos: v });
            },
          };
        },
      };
    },
    escrituras,
  };
}

function respuestaFalsa() {
  const r = { code: 0, body: null as any };
  const res = {
    status(c: number) { r.code = c; return res; },
    json(b: unknown) { r.body = b; return res; },
    setHeader() { return res; },
    end() { return res; },
  } as unknown as VercelResponse;
  return { res, r };
}

const peticion = (query: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { authorization: `Bearer ${SECRETO}` },
  query,
} as unknown as VercelRequest);

/** Dos atletas: uno con una sesión abandonada y otro dado de baja. */
function datosBase() {
  return {
    user_profiles: {
      u1: { userId: 'u1', email: 'ana@x.com', displayName: 'Ana', role: 'client', level: 0 },
      u2: { userId: 'u2', email: 'baja@x.com', displayName: 'Baja', role: 'client', estadoCrm: 'baja' },
      u3: { userId: 'u3', email: 'coach@x.com', displayName: 'Coach', role: 'coach' },
    },
    workoutAssignments: {
      as_vieja: { athleteId: 'ana@x.com', workoutId: 'w', date: haceDias(20), status: 'pending' },
      as_reciente: { athleteId: 'ana@x.com', workoutId: 'w', date: haceDias(2), status: 'pending' },
    },
    workoutLogs: {}, bodyweightLogs: {}, stepLogs: {}, exercises: {},
    nutritionPrograms: {}, athleteDietConfigs: {}, diets: {},
    dietCompletionLogs: {}, roadmaps: {}, weeklyChallenges: {}, cardioSessions: {},
    notifications: {},
  } as Record<string, Record<string, Doc>>;
}

async function ejecutar(db: unknown, query: Record<string, string> = {}) {
  vi.resetModules();
  vi.doMock('./_lib/auth.js', () => ({
    COACH_EMAIL: 'coach@x.com',
    getAdminDb: async () => db,
  }));
  const handler = (await import('./latido-diario')).default;
  const { res, r } = respuestaFalsa();
  await handler(peticion(query), res);
  return r;
}

beforeEach(() => { process.env.CRON_SECRET = SECRETO; vi.resetModules(); });

describe('api/latido-diario · de punta a punta', () => {
  it('marca la sesión abandonada y deja en paz la reciente', async () => {
    const db = firestoreFalso(datosBase());
    const r = await ejecutar(db);

    expect(r.code).toBe(200);
    const perdidas = db.escrituras.filter(
      e => e.coleccion === 'workoutAssignments' && e.op === 'update',
    );
    expect(perdidas).toHaveLength(1);
    expect(perdidas[0].id).toBe('as_vieja');
    expect(perdidas[0].datos).toEqual({ status: 'perdido' });
  });

  it('salta a los atletas dados de baja y al propio coach', async () => {
    const db = firestoreFalso(datosBase());
    const r = await ejecutar(db);
    const correos = (r.body.detalle as { email: string }[]).map(d => d.email);
    expect(correos).toEqual(['ana@x.com']);
  });

  it('en seco no escribe absolutamente nada', async () => {
    const db = firestoreFalso(datosBase());
    const r = await ejecutar(db, { seco: '1' });
    expect(r.code).toBe(200);
    expect(db.escrituras).toEqual([]);
    expect(r.body.enSeco).toBe(true);
  });

  it('el resumen que se guarda no lleva ni un correo', async () => {
    const db = firestoreFalso(datosBase());
    await ejecutar(db);
    const registro = db.escrituras.find(e => e.coleccion === 'latidos');
    expect(registro).toBeDefined();
    expect(JSON.stringify(registro!.datos)).not.toContain('@');
  });

  it('un atleta que revienta no impide que se procesen los demás', async () => {
    // `workoutLogs` casca para todos, así que el resumen debe traer el error
    // anotado por atleta y aun así responder 200.
    const db = firestoreFalso(datosBase(), { revientaEn: 'workoutLogs' });
    const r = await ejecutar(db);
    expect(r.code).toBe(200);
    expect(r.body.conError).toBe(1);
    expect((r.body.detalle as { error?: string }[])[0].error).toContain('boom');
  });

  it('pasarlo dos veces seguidas no duplica escrituras nuevas', async () => {
    const datos = datosBase();
    const db1 = firestoreFalso(datos);
    await ejecutar(db1);
    // La segunda vuelta corre sobre un Firestore que YA tiene la sesión
    // marcada y el reto creado: no debe volver a tocarlos.
    datos.workoutAssignments.as_vieja.status = 'perdido';
    for (const e of db1.escrituras) {
      if (e.coleccion === 'weeklyChallenges' || e.coleccion === 'notifications') {
        datos[e.coleccion][e.id] = e.datos as Doc;
      }
    }
    const db2 = firestoreFalso(datos);
    await ejecutar(db2);

    expect(db2.escrituras.filter(e => e.coleccion === 'workoutAssignments')).toHaveLength(0);
    expect(db2.escrituras.filter(e => e.coleccion === 'notifications')).toHaveLength(0);
  });
});
