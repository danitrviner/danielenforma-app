import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* La puerta de api/avisar.ts: solo el coach, solo con un id de aviso, solo
   avisos recientes y dirigidos a un atleta. El envío en sí lo prueban
   push.test.ts y utils/avisosPush.test.ts. */

const estado = vi.hoisted(() => ({
  token: null as null | { uid: string; email: string; emailVerified: boolean; authTimeMs: number },
  aviso: null as null | Record<string, unknown>,
  avisar: vi.fn(async () => ({ enviados: 1, borrados: 0 })),
}));

vi.mock('../_lib/auth.js', async (original) => {
  const real = await original<typeof import('../_lib/auth')>();
  return {
    ...real,
    verifyFirebaseIdToken: vi.fn(async () => estado.token),
    getAdminDb: vi.fn(async () => ({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: !!estado.aviso, data: () => estado.aviso }) }) }),
    })),
  };
});
vi.mock('../_lib/push.js', () => ({
  avisarPorPush: estado.avisar,
  obtenerMensajeria: vi.fn(async () => ({})),
}));

import handler, { idDeAvisoValido } from '../avisar';

function respuestaFalsa() {
  const r = { code: 0, body: null as unknown };
  const res = {
    status(c: number) { r.code = c; return res; },
    json(b: unknown) { r.body = b; return res; },
    end() { return res; },
    setHeader() { return res; },
  } as unknown as VercelResponse;
  return { res, r };
}

const peticion = (body: unknown, conToken = true) => ({
  method: 'POST', headers: conToken ? { authorization: 'Bearer x' } : {}, body,
}) as unknown as VercelRequest;

const COACH = { uid: 'c', email: 'danitrviner@gmail.com', emailVerified: true, authTimeMs: 0 };

beforeEach(() => {
  estado.token = COACH;
  estado.aviso = { recipientEmail: 'ana@x.com', type: 'cuestionario_nuevo', title: 'T', body: 'B', link: 'checkin', createdAt: new Date().toISOString(), read: false };
  estado.avisar.mockClear();
});

describe('api/avisar · quién y qué', () => {
  it('sin token, 401', async () => {
    const { res, r } = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }, false), res);
    expect(r.code).toBe(401);
  });

  it('un atleta (o un correo sin verificar) no puede: 403', async () => {
    estado.token = { uid: 'a', email: 'ana@x.com', emailVerified: true, authTimeMs: 0 };
    const { res, r } = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }), res);
    expect(r.code).toBe(403);
    estado.token = { ...COACH, emailVerified: false };
    const otra = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }), otra.res);
    expect(otra.r.code).toBe(403);
    expect(estado.avisar).not.toHaveBeenCalled();
  });

  it('sin id de aviso válido, 400', async () => {
    const { res, r } = respuestaFalsa();
    await handler(peticion({}), res);
    expect(r.code).toBe(400);
    expect(idDeAvisoValido('a/b')).toBe(false);
    expect(idDeAvisoValido('cuestionario_nuevo_ana@x.com_q1_2026-11-18')).toBe(true);
  });

  it('aviso inexistente, 404', async () => {
    estado.aviso = null;
    const { res, r } = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }), res);
    expect(r.code).toBe(404);
  });

  it('el coach con un aviso recién creado para un atleta: se manda', async () => {
    const { res, r } = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }), res);
    expect(r.code).toBe(200);
    expect(estado.avisar).toHaveBeenCalledTimes(1);
  });

  it('un aviso para el propio coach o uno antiguo no se manda', async () => {
    estado.aviso = { ...estado.aviso, recipientEmail: 'danitrviner@gmail.com' };
    const a = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }), a.res);
    expect(a.r.body).toMatchObject({ enviados: 0, motivo: 'no_es_para_un_atleta' });

    estado.aviso = { ...estado.aviso, recipientEmail: 'ana@x.com', createdAt: '2026-01-01T00:00:00.000Z' };
    const b = respuestaFalsa();
    await handler(peticion({ avisoId: 'a' }), b.res);
    expect(b.r.body).toMatchObject({ enviados: 0, motivo: 'aviso_antiguo' });
    expect(estado.avisar).not.toHaveBeenCalled();
  });
});
