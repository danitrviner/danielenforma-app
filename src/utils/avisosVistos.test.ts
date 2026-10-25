import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../dbService', () => ({ updateUserProfile: vi.fn(() => Promise.resolve()) }));

import { vecesVisto, apuntarVisto, DESCARTADO } from './avisosVistos';
import { updateUserProfile } from '../dbService';

const almacen = new Map<string, string>();
beforeEach(() => {
  almacen.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => { almacen.set(k, v); },
    removeItem: (k: string) => { almacen.delete(k); },
  });
});

describe('avisosVistos', () => {
  it('cuenta las vistas y las guarda también en el perfil', () => {
    const p = { email: 'a@b.c', userId: 'u1' };
    expect(vecesVisto(p, 'x')).toBe(0);
    apuntarVisto(p, 'x', 1);
    expect(vecesVisto(p, 'x')).toBe(1); // «1» del formato nuevo NO es «cerrado»
    expect(updateUserProfile).toHaveBeenCalledWith('u1', { avisosVistos: { x: 1 } });
  });

  it('lo guardado en el perfil manda aunque el móvil se haya limpiado (cierre de sesión)', () => {
    expect(vecesVisto({ email: 'otro@b.c', avisosVistos: { guia: 1 } }, 'guia')).toBe(1);
  });

  it('lee el formato antiguo del Coachmark: «x» o «1» es cerrado', () => {
    almacen.set('viejo', 'x');
    expect(vecesVisto({ email: 'z@b.c' }, 'y', 'viejo')).toBe(DESCARTADO);
    almacen.set('viejo2', '1');
    expect(vecesVisto({ email: 'z@b.c' }, 'w', 'viejo2')).toBe(DESCARTADO);
  });
});
