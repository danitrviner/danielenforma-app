import { describe, expect, it } from 'vitest';
import { UserProfile } from '../types';
import { esAnonimizado, esBaja, atletasActivos } from './atletas';

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1', email: 'a@x.com', displayName: 'A', role: 'client',
    avatarUrl: '', level: 1, xp: 0, currentStreak: 0, maxStreak: 0,
    initialWeight: 70, targetWeight: 70, actualWeight: 70,
    ...overrides,
  };
}

describe('esAnonimizado', () => {
  it('true solo si anonimizado === true', () => {
    expect(esAnonimizado(perfil({ anonimizado: true }))).toBe(true);
    expect(esAnonimizado(perfil({ anonimizado: false }))).toBe(false);
    expect(esAnonimizado(perfil())).toBe(false);
  });
});

describe('esBaja', () => {
  it('true solo si estadoCrm === "baja"', () => {
    expect(esBaja(perfil({ estadoCrm: 'baja' }))).toBe(true);
    expect(esBaja(perfil({ estadoCrm: 'activo' }))).toBe(false);
    expect(esBaja(perfil({ estadoCrm: 'pausado' }))).toBe(false);
    expect(esBaja(perfil())).toBe(false);
  });
});

describe('atletasActivos', () => {
  it('deja fuera anonimizados y bajas, conserva el resto', () => {
    const activos = perfil({ email: 'activo@x.com', estadoCrm: 'activo' });
    const pausado = perfil({ email: 'pausado@x.com', estadoCrm: 'pausado' });
    const sinEstado = perfil({ email: 'sin-estado@x.com' });
    const baja = perfil({ email: 'baja@x.com', estadoCrm: 'baja' });
    const anonimo = perfil({ email: 'borrado_x@anonimo.local', anonimizado: true, estadoCrm: 'baja' });

    const resultado = atletasActivos([activos, pausado, sinEstado, baja, anonimo]);

    expect(resultado.map(p => p.email)).toEqual(['activo@x.com', 'pausado@x.com', 'sin-estado@x.com']);
  });

  it('lista vacía sin atletas: array vacío', () => {
    expect(atletasActivos([])).toEqual([]);
  });
});
