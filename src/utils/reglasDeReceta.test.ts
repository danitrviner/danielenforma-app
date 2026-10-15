import { describe, it, expect } from 'vitest';
import {
  recetasOcultas, recetaPermitida, conRegla, etiquetaDeDias, etiquetaDeAmbitos, type ReglaDeReceta,
} from './reglasDeReceta';

describe('recetasOcultas', () => {
  const reglas: ReglaDeReceta[] = [{ recipeId: 'a' }, { recipeId: 'b', dias: ['tue'] }];

  it('sin día solo cuentan las reglas de todos los días', () => {
    expect([...recetasOcultas(reglas, 'menu')]).toEqual(['a']);
  });
  it('con día, también las de ese día', () => {
    expect([...recetasOcultas(reglas, 'menu', ['tue'])].sort()).toEqual(['a', 'b']);
    expect([...recetasOcultas(reglas, 'menu', ['wed'])]).toEqual(['a']);
  });
  it('en una tanda basta que afecte a uno de los días', () => {
    expect([...recetasOcultas(reglas, 'menu', ['mon', 'tue', 'wed'])].sort()).toEqual(['a', 'b']);
  });
  it('sin reglas no oculta nada', () => {
    expect(recetasOcultas(undefined, 'menu', ['mon']).size).toBe(0);
  });
});

describe('ámbitos', () => {
  const reglas: ReglaDeReceta[] = [
    { recipeId: 'soloMenu', ambitos: ['menu'] },
    { recipeId: 'menuYCambios', ambitos: ['menu', 'cambios'] },
    { recipeId: 'todo' },
  ];
  it('cada ámbito ve solo lo que le toca', () => {
    expect([...recetasOcultas(reglas, 'menu')].sort()).toEqual(['menuYCambios', 'soloMenu', 'todo']);
    expect([...recetasOcultas(reglas, 'cambios')].sort()).toEqual(['menuYCambios', 'todo']);
    expect([...recetasOcultas(reglas, 'recetario')]).toEqual(['todo']);
  });
  it('una regla de solo menú sigue permitiendo la receta en el recetario', () => {
    expect(recetaPermitida('soloMenu', reglas, 'menu')).toBe(false);
    expect(recetaPermitida('soloMenu', reglas, 'recetario')).toBe(true);
  });
});

describe('recetaPermitida', () => {
  const reglas: ReglaDeReceta[] = [
    { recipeId: 'a' }, { recipeId: 'b', dias: ['tue', 'thu'] }, { recipeId: 'c', ambitos: ['cambios'] },
  ];
  it('coincide con recetasOcultas en todas las combinaciones', () => {
    for (const ambito of ['menu', 'cambios', 'recetario'] as const) {
      for (const dias of [undefined, ['mon' as const], ['tue' as const], ['thu' as const, 'fri' as const]]) {
        const ocultas = recetasOcultas(reglas, ambito, dias);
        for (const id of ['a', 'b', 'c', 'd']) expect(recetaPermitida(id, reglas, ambito, dias)).toBe(!ocultas.has(id));
      }
    }
  });
});

describe('conRegla', () => {
  it('añade, cambia días y quita', () => {
    let r = conRegla([], 'a', {});
    expect(r).toEqual([{ recipeId: 'a' }]);
    r = conRegla(r, 'a', { dias: ['mon', 'fri'] });
    expect(r).toEqual([{ recipeId: 'a', dias: ['mon', 'fri'] }]);
    r = conRegla(r, 'a', null);
    expect(r).toEqual([]);
  });
  it('cambiar los días no pierde el ámbito, y al revés', () => {
    let r = conRegla([], 'a', { ambitos: ['menu'] });
    r = conRegla(r, 'a', { dias: ['tue'] });
    expect(r).toEqual([{ recipeId: 'a', dias: ['tue'], ambitos: ['menu'] }]);
    r = conRegla(r, 'a', { ambitos: ['menu', 'cambios'] });
    expect(r).toEqual([{ recipeId: 'a', dias: ['tue'], ambitos: ['menu', 'cambios'] }]);
  });
  it('todos los días o todos los ámbitos equivalen a «todos» y no se guardan', () => {
    expect(conRegla([], 'a', { dias: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], ambitos: ['menu', 'cambios', 'recetario'] }))
      .toEqual([{ recipeId: 'a' }]);
  });
  it('una lista vacía se ignora: la regla seguiría escondiendo en todas partes', () => {
    expect(conRegla([], 'a', { ambitos: [], dias: [] })).toEqual([{ recipeId: 'a' }]);
  });
  it('etiquetas', () => {
    expect(etiquetaDeDias(undefined)).toBe('todos los días');
    expect(etiquetaDeDias(['mon', 'wed'])).toBe('L, X');
    expect(etiquetaDeAmbitos(undefined)).toBe('menú, cambios y recetario');
    expect(etiquetaDeAmbitos(['menu', 'recetario'])).toBe('menú y recetario');
  });
});
