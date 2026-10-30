import { describe, it, expect } from 'vitest';
import { partirPorArchivado, tieneCuentaActiva } from './archivado';
import type { Cliente } from '../types';

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: 'c1', fuente: 'contacto', contactoId: 'c1', nombre: 'Ana', estadoCrm: 'activo', ...over,
});

describe('partirPorArchivado', () => {
  it('separa archivados de los que se trabajan, conservando el orden', () => {
    const lista = [
      cliente({ id: 'a', nombre: 'Ana' }),
      cliente({ id: 'b', nombre: 'Beto', archivado: true }),
      cliente({ id: 'c', nombre: 'Cris' }),
    ];
    const { visibles, archivados } = partirPorArchivado(lista);
    expect(visibles.map(c => c.id)).toEqual(['a', 'c']);
    expect(archivados.map(c => c.id)).toEqual(['b']);
  });

  it('sin archivados, nadie se pierde por el camino', () => {
    const lista = [cliente({ id: 'a' }), cliente({ id: 'b' })];
    const { visibles, archivados } = partirPorArchivado(lista);
    expect(visibles).toHaveLength(2);
    expect(archivados).toHaveLength(0);
  });
});

describe('tieneCuentaActiva', () => {
  it('un contacto sin cuenta no tiene acceso que quitar', () => {
    expect(tieneCuentaActiva(cliente())).toBe(false);
  });

  it('una cuenta viva sí: archivarla o borrarla le quita el acceso', () => {
    expect(tieneCuentaActiva(cliente({ fuente: 'perfil', userId: 'uid1', email: 'a@b.com' }))).toBe(true);
  });

  it('un perfil ya anonimizado («borrado_xxxx») no tiene nada que bloquear', () => {
    expect(tieneCuentaActiva(cliente({ fuente: 'perfil', userId: 'uid1', email: 'borrado@anonimo.local', anonimizado: true }))).toBe(false);
  });
});
