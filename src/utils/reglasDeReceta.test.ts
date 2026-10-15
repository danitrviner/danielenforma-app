import { describe, it, expect } from 'vitest';
import { recetasOcultas, recetaPermitida, conRegla, etiquetaDeDias } from './reglasDeReceta';

describe('recetasOcultas', () => {
  const reglas = [{ recipeId: 'a' }, { recipeId: 'b', dias: ['tue' as const] }];

  it('sin día solo cuentan las reglas de todos los días', () => {
    expect([...recetasOcultas(reglas)]).toEqual(['a']);
  });
  it('con día, también las de ese día', () => {
    expect([...recetasOcultas(reglas, ['tue'])].sort()).toEqual(['a', 'b']);
    expect([...recetasOcultas(reglas, ['wed'])]).toEqual(['a']);
  });
  it('en una tanda basta que afecte a uno de los días', () => {
    expect([...recetasOcultas(reglas, ['mon', 'tue', 'wed'])].sort()).toEqual(['a', 'b']);
  });
  it('sin reglas no oculta nada', () => {
    expect(recetasOcultas(undefined, ['mon']).size).toBe(0);
  });
});

describe('recetaPermitida', () => {
  const reglas = [{ recipeId: 'a' }, { recipeId: 'b', dias: ['tue' as const, 'thu' as const] }];
  it('coincide con recetasOcultas', () => {
    for (const dias of [undefined, ['mon' as const], ['tue' as const], ['thu' as const, 'fri' as const]]) {
      const ocultas = recetasOcultas(reglas, dias);
      for (const id of ['a', 'b', 'c']) expect(recetaPermitida(id, reglas, dias)).toBe(!ocultas.has(id));
    }
  });
});

describe('conRegla', () => {
  it('añade, sustituye y quita', () => {
    let r = conRegla([], 'a');
    expect(r).toEqual([{ recipeId: 'a' }]);
    r = conRegla(r, 'a', ['mon', 'fri']);
    expect(r).toEqual([{ recipeId: 'a', dias: ['mon', 'fri'] }]);
    r = conRegla(r, 'a', null);
    expect(r).toEqual([]);
  });
  it('los siete días equivalen a «todos» y no se guardan como lista', () => {
    expect(conRegla([], 'a', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).toEqual([{ recipeId: 'a' }]);
  });
  it('etiqueta de días', () => {
    expect(etiquetaDeDias(undefined)).toBe('todos los días');
    expect(etiquetaDeDias(['mon', 'wed'])).toBe('L, X');
  });
});
