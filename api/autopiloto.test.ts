import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* La puerta del consumidor del autopiloto: igual que la del latido, no se
   prueba lo que hace con los episodios (eso es api/agente.test.ts) sino que
   NO lo haga sin permiso. Es un endpoint que llama a un modelo de pago y
   escribe en los documentos de todos los atletas. */

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
const peticion = (parcial: Partial<VercelRequest> = {}): VercelRequest => ({ method: 'POST', headers: {}, query: {}, ...parcial } as VercelRequest);
const SECRETO = 'un-secreto-largo-de-verdad';

beforeEach(() => { vi.resetModules(); delete process.env.CRON_SECRET; delete process.env.ANTHROPIC_API_KEY; delete process.env.FIREBASE_SERVICE_ACCOUNT; });
afterEach(() => { delete process.env.CRON_SECRET; delete process.env.ANTHROPIC_API_KEY; });

const handler = async () => (await import('./autopiloto')).default;

describe('api/autopiloto · quién puede dispararlo', () => {
  it('sin CRON_SECRET no se ejecuta', async () => {
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion(), res);
    expect(r.code).toBe(503);
  });
  it('con otro secreto responde 401', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion({ headers: { authorization: 'Bearer otro' } }), res);
    expect(r.code).toBe(401);
  });
  it('sin clave de Anthropic no arranca aunque el secreto sea bueno', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion({ headers: { authorization: `Bearer ${SECRETO}` } }), res);
    expect(r.code).toBe(500);
  });
  it('sin cuenta de servicio responde 503', async () => {
    process.env.CRON_SECRET = SECRETO;
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion({ headers: { authorization: `Bearer ${SECRETO}` } }), res);
    expect(r.code).toBe(503);
  });
  it('un GET cualquiera sin cabecera también es 401', async () => {
    process.env.CRON_SECRET = SECRETO;
    const { res, r } = respuestaFalsa();
    await (await handler())(peticion({ method: 'GET' }), res);
    expect(r.code).toBe(401);
  });
});
