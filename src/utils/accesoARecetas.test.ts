import { describe, it, expect } from 'vitest';
import {
  listaDeMenuVigente, modoRecetarioVigente, filtrarPorLista, entraEnRecetario, MIN_RECETAS_DE_LISTA,
} from './accesoARecetas';

const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

describe('listaDeMenuVigente', () => {
  it('atleta > global > todas', () => {
    expect(listaDeMenuVigente(['a'], ['g'])).toEqual(['a']);
    expect(listaDeMenuVigente(undefined, ['g'])).toEqual(['g']);
    expect(listaDeMenuVigente(undefined, undefined)).toBe('rapidas');
  });
  it('una lista vacía no cuenta', () => {
    expect(listaDeMenuVigente([], ['g'])).toEqual(['g']);
    expect(listaDeMenuVigente([], [])).toBe('rapidas');
  });
});

describe('filtrarPorLista', () => {
  it('sin lista devuelve el pool entero', () => {
    const p = pool(10);
    expect(filtrarPorLista(p, undefined)).toBe(p);
  });
  it('«rapidas» deja solo las marcadas basica', () => {
    const p = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, basica: i < 7 }));
    expect(filtrarPorLista(p, 'rapidas')).toHaveLength(7);
  });
  it('«rapidas» con menos de 5 Rápidas en el pool no recorta', () => {
    const p = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, basica: i < 3 }));
    expect(filtrarPorLista(p, 'rapidas')).toBe(p);
  });
  it('deja solo las de la lista', () => {
    const lista = ['r1', 'r2', 'r3', 'r4', 'r5', 'r9'];
    expect(filtrarPorLista(pool(10), lista).map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r9']);
  });
  it('si dejaría muy pocas, ignora la lista', () => {
    const p = pool(10);
    expect(filtrarPorLista(p, ['r1', 'r2'])).toBe(p);
    expect(MIN_RECETAS_DE_LISTA).toBe(5);
  });
  it('ignora ids de la lista que no están en el pool', () => {
    const lista = ['r0', 'r1', 'r2', 'r3', 'r4', 'fuera'];
    expect(filtrarPorLista(pool(10), lista)).toHaveLength(5);
  });
});

describe('recetario', () => {
  it('por defecto todas', () => {
    expect(modoRecetarioVigente(undefined)).toBe('todas');
    expect(modoRecetarioVigente('recomendadas')).toBe('recomendadas');
  });
  it('en modo recomendadas solo entran las recomendadas', () => {
    expect(entraEnRecetario('a', 'recomendadas', ['a'])).toBe(true);
    expect(entraEnRecetario('b', 'recomendadas', ['a'])).toBe(false);
  });
  it('sin recomendadas no esconde nada', () => {
    expect(entraEnRecetario('b', 'recomendadas', [])).toBe(true);
    expect(entraEnRecetario('b', 'todas', ['a'])).toBe(true);
  });
});
