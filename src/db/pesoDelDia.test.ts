import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDoc = vi.fn(async () => undefined);
const updateDoc = vi.fn(async () => undefined);
vi.mock('../firebase', () => ({
  db: {}, collection: vi.fn(), doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDocs: vi.fn(), addDoc: vi.fn(), setDoc: (...a: unknown[]) => setDoc(...(a as [])), updateDoc: (...a: unknown[]) => updateDoc(...(a as [])),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(), orderBy: vi.fn(),
}));
vi.mock('./core', () => ({
  forceLocalOnly: false, setLocalBypassMode: vi.fn(), stripUndefined: (o: unknown) => o, esFalloDePermisos: () => false,
}));

import { guardarPesoDelDia, idPesoDelDia } from './athleteMetrics';

beforeEach(() => {
  setDoc.mockClear(); updateDoc.mockClear();
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(),
  });
});

describe('guardarPesoDelDia', () => {
  it('sin registro de hoy escribe con el id determinista {email}_{fecha}', async () => {
    const e = await guardarPesoDelDia('a@b.c', '2026-10-22', 80.4);
    expect(e.id).toBe(idPesoDelDia('a@b.c', '2026-10-22'));
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('guardar dos veces el mismo día cae en el MISMO documento', async () => {
    await guardarPesoDelDia('a@b.c', '2026-10-22', 80.4);
    await guardarPesoDelDia('a@b.c', '2026-10-22', 80.4);
    const ids = setDoc.mock.calls.map(c => (c as unknown as [{ id: string }])[0].id);
    expect(new Set(ids).size).toBe(1);
  });
  it('con un registro de hoy (aunque tenga id aleatorio) lo corrige y no crea otro', async () => {
    const existente = { id: 'xYz123', athleteId: 'a@b.c', date: '2026-10-22', weight: 81, createdAt: '2026-10-22T08:00:00Z' };
    const e = await guardarPesoDelDia('a@b.c', '2026-10-22', 80.4, existente);
    expect(e).toMatchObject({ id: 'xYz123', weight: 80.4 });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
