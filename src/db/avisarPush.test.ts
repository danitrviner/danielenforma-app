import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Cuándo pide el cliente el push al servidor: solo cuando el COACH crea un
   aviso para OTRA persona. Lo que crea el atleta (para sí mismo o para el
   coach) no sale del navegador por este camino. Y nunca lanza. */

const estado = vi.hoisted(() => ({ usuario: null as null | { email: string; getIdToken: () => Promise<string> } }));
vi.mock('../firebase', () => ({ auth: { get currentUser() { return estado.usuario; } } }));
vi.mock('./apiBase', () => ({ apiUrl: (r: string) => r }));

import { debePedirPush, pedirPushDelAviso } from './avisarPush';

beforeEach(() => { estado.usuario = null; vi.restoreAllMocks(); });

describe('debePedirPush', () => {
  it('coach → atleta, sí; el resto, no', () => {
    expect(debePedirPush('danitrviner@gmail.com', 'ana@x.com')).toBe(true);
    expect(debePedirPush('DaniTrViner@gmail.com', 'ana@x.com')).toBe(true);
    expect(debePedirPush('danitrviner@gmail.com', 'danitrviner@gmail.com')).toBe(false);
    expect(debePedirPush('ana@x.com', 'danitrviner@gmail.com')).toBe(false);
    expect(debePedirPush('ana@x.com', 'ana@x.com')).toBe(false);
    expect(debePedirPush(null, 'ana@x.com')).toBe(false);
  });
});

describe('pedirPushDelAviso', () => {
  it('llama a /api/avisar con el id y el token del coach', async () => {
    estado.usuario = { email: 'danitrviner@gmail.com', getIdToken: async () => 'tok' };
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await pedirPushDelAviso('aviso_1', 'ana@x.com');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/avisar');
    expect(JSON.parse(init.body as string)).toEqual({ avisoId: 'aviso_1' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('el atleta no llama a nada', async () => {
    estado.usuario = { email: 'ana@x.com', getIdToken: async () => 'tok' };
    const f = vi.spyOn(globalThis, 'fetch');
    await pedirPushDelAviso('aviso_1', 'danitrviner@gmail.com');
    expect(f).not.toHaveBeenCalled();
  });

  it('si el servidor falla, no lanza', async () => {
    estado.usuario = { email: 'danitrviner@gmail.com', getIdToken: async () => 'tok' };
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sin red'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(pedirPushDelAviso('aviso_1', 'ana@x.com')).resolves.toBeUndefined();
  });
});
