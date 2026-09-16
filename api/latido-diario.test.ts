import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* La puerta del endpoint. No se prueba lo que hace con los atletas —eso son
   los tests de `utils/latidoDiario.ts`— sino que NO lo haga sin permiso: es un
   endpoint que escribe en todos los documentos de todos los clientes. */

function respuestaFalsa() {
  const r = { code: 0, body: null as unknown, ended: false };
  const res = {
    status(c: number) { r.code = c; return res; },
    json(b: unknown) { r.body = b; return res; },
    end() { r.ended = true; return res; },
    setHeader() { return res; },
  } as unknown as VercelResponse;
  return { res, r };
}

function peticion(parcial: Partial<VercelRequest> = {}): VercelRequest {
  return { method: 'POST', headers: {}, query: {}, ...parcial } as VercelRequest;
}

const SECRETO = 'un-secreto-largo-de-verdad';

beforeEach(() => { vi.resetModules(); delete process.env.CRON_SECRET; });
afterEach(() => { delete process.env.CRON_SECRET; });

async function handler() {
  return (await import('./latido-diario')).default;
}

describe('api/latido-diario · quién puede dispararlo', () => {
  it('sin CRON_SECRET configurado no se ejecuta, ni siquiera sin credenciales', async () => {
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion(), res);
    expect(r.code).toBe(503);
  });

  it('sin la cabecera correcta responde 401', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion(), res);
    expect(r.code).toBe(401);
  });

  it('un secreto que no es el suyo responde 401', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(
      peticion({ headers: { authorization: 'Bearer otro-secreto-cualquiera' } }), res,
    );
    expect(r.code).toBe(401);
  });

  it('un prefijo del secreto tampoco vale', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(
      peticion({ headers: { authorization: `Bearer ${SECRETO.slice(0, -1)}` } }), res,
    );
    expect(r.code).toBe(401);
  });

  it('con el secreto bueno pasa la puerta y falla más adelante, por no haber cuenta de servicio', async () => {
    process.env.CRON_SECRET = SECRETO;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion({ headers: { authorization: `Bearer ${SECRETO}` } }), res);
    expect(r.code).toBe(503);
    expect(r.body).toMatchObject({ error: 'Sin cuenta de servicio configurada' });
  });

  it('un método que no es GET ni POST se rechaza antes de mirar nada', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion({ method: 'DELETE' }), res);
    expect(r.code).toBe(405);
  });
});
