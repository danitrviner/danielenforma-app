import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { sinRetiradas } from './recipes';

const r = (id: string) => ({ id, name: id }) as Recipe;

describe('sinRetiradas', () => {
  it('quita las retiradas y deja el resto en su orden', () => {
    expect(sinRetiradas([r('a'), r('b'), r('c')], { retiradas: { b: '2026-10-29' } }).map(x => x.id)).toEqual(['a', 'c']);
  });
  it('las mantenidas no cuentan como retiradas', () => {
    expect(sinRetiradas([r('a'), r('b')], { mantenidas: { a: '2026-10-29' } })).toHaveLength(2);
  });
  it('sin limpieza devuelve la misma lista', () => {
    const lista = [r('a')];
    expect(sinRetiradas(lista, {})).toBe(lista);
  });
});
