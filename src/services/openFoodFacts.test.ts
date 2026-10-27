import { describe, it, expect, vi, beforeEach } from 'vitest';

const corregidos = new Map<string, unknown>();
vi.mock('../db/productosCorregidos', () => ({
  getProductoCorregido: (c: string) => Promise.resolve(corregidos.get(c) ?? null),
}));
vi.mock('../db/apiBase', () => ({ apiUrl: (r: string) => `https://app${r}` }));

const { resolverProducto } = await import('./openFoodFacts');
const { trozoDeCodigo } = await import('../utils/offBucket');

const LOCAL = '8480000160164';
const FUERA = '5000159484695';

function responder(trozoLocal: 'ok' | 'falla', api: 'encontrado' | 'no' | 'falla') {
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/off/p/')) {
      if (trozoLocal === 'falla') throw new TypeError('sin red');
      const n = String(trozoDeCodigo(LOCAL)).padStart(3, '0');
      const datos = u.endsWith(`${n}.json`) ? { [LOCAL]: { c: LOCAL, n: 'Tomate', b: 'H', k: 29, p: 1, h: 6, g: 0 } } : {};
      return new Response(JSON.stringify(datos), { status: 200 });
    }
    if (u.includes('openfoodfacts.org')) {
      if (api === 'falla') throw new TypeError('sin red');
      if (api === 'no') return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ product: { code: FUERA, product_name: 'Walkers', nutriments: { 'energy-kcal_100g': 500, proteins_100g: 6, carbohydrates_100g: 55, fat_100g: 28 } } }), { status: 200 });
    }
    throw new Error(`URL inesperada ${u}`);
  }) as typeof fetch;
}

describe('resolverProducto', () => {
  beforeEach(() => corregidos.clear());

  it('la corrección del coach manda sobre todo', async () => {
    responder('ok', 'encontrado');
    corregidos.set(LOCAL, { c: LOCAL, n: 'Tomate corregido', b: 'H', k: 30, p: 1, h: 6, g: 0 });
    expect(await resolverProducto(LOCAL)).toMatchObject({ n: 'Tomate corregido' });
  });

  it('lo que está en la copia no sale a Open Food Facts', async () => {
    responder('ok', 'falla');
    expect(await resolverProducto(LOCAL)).toMatchObject({ n: 'Tomate' });
  });

  it('lo que no está en la copia se pregunta en directo', async () => {
    responder('ok', 'encontrado');
    expect(await resolverProducto(FUERA)).toMatchObject({ c: FUERA, n: 'Walkers', k: 500 });
  });

  it('si Open Food Facts no lo conoce, es null (no un error)', async () => {
    responder('ok', 'no');
    expect(await resolverProducto('4006381333931')).toBeNull();
  });

  it('sin red en ninguna de las dos, lanza', async () => {
    responder('falla', 'falla');
    await expect(resolverProducto('7622210449283')).rejects.toThrow();
  });
});
