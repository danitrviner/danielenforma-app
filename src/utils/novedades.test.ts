import { describe, it, expect } from 'vitest';
import type { Novedad } from '../data/novedades';
import { novedadesPendientes, idMasReciente } from './novedades';

const n = (id: string, fecha: string): Novedad => ({ id, fecha, titulo: id, puntos: [] });
// De la más reciente a la más antigua.
const LISTA = [n('c', '2026-10-20'), n('b', '2026-10-10'), n('a', '2026-09-01')];
const ids = (l: Novedad[]) => l.map(x => x.id);

describe('novedadesPendientes', () => {
  it('sin nada visto, todas las posteriores al alta', () => {
    expect(ids(novedadesPendientes(LISTA, { creadaEn: '2026-08-01T10:00:00Z' }))).toEqual(['c', 'b', 'a']);
  });
  it('solo las que están por delante de la última vista', () => {
    expect(ids(novedadesPendientes(LISTA, { vistas: 'b', creadaEn: '2026-08-01T10:00:00Z' }))).toEqual(['c']);
    expect(novedadesPendientes(LISTA, { vistas: 'c', creadaEn: '2026-08-01T10:00:00Z' })).toEqual([]);
  });
  it('no cuenta lo anterior o igual al día del alta', () => {
    expect(ids(novedadesPendientes(LISTA, { creadaEn: '2026-10-10T08:00:00Z' }))).toEqual(['c']);
  });
  it('un id visto que ya no existe equivale a no haber visto nada', () => {
    expect(ids(novedadesPendientes(LISTA, { vistas: 'retirada', creadaEn: '2026-09-15T00:00:00Z' }))).toEqual(['c', 'b']);
  });
  it('sin fecha de alta no filtra por ella', () => {
    expect(ids(novedadesPendientes(LISTA, {}))).toEqual(['c', 'b', 'a']);
  });
  it('el id a guardar es el de la más reciente', () => {
    expect(idMasReciente(LISTA)).toBe('c');
    expect(idMasReciente([])).toBeUndefined();
  });
});
