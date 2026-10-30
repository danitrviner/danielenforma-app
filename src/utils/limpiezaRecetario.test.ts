import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { FILTRO_LIMPIEZA_VACIO, compararDuplicados, filtrarParaLimpiar, gruposDuplicados } from './limpiezaRecetario';

const r = (id: string, name: string, extra: Partial<Recipe> = {}) =>
  ({ id, name, intakeTypes: [1], ingredientsText: [{ name: 'Leche', quantity: 0 }, { name: 'Plátano', quantity: 0 }], categoria: 'Desayuno y dulces', ...extra }) as Recipe;

const RECETAS = [
  r('a', 'Batido de plátano'),
  r('b', 'Barrita Mini Go Energy (SiS)', { intakeTypes: [], ingredientsText: [{ name: 'Barrita', quantity: 0 }], categoria: 'Alimentos y suplementos' }),
  r('c', '3Carb gel 24g HC', { intakeTypes: [], categoria: 'Suplementos deportivos' }),
  r('d', 'Arroz con pollo', { intakeTypes: [3, 5], ingredientsText: [{ name: 'Arroz', quantity: 0 }, { name: 'Pollo', quantity: 0 }, { name: 'Aceite', quantity: 0 }, { name: 'Sal', quantity: 0 }, { name: 'Ajo', quantity: 0 }] }),
  r('e', 'Arroz con  pollo ', { intakeTypes: [3] }),
  r('f', 'Tostada con queso batido', { intakeTypes: [2] }),
];

describe('filtrarParaLimpiar', () => {
  it('los atajos se suman entre sí', () => {
    const ids = filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, atajos: ['batidos', 'barritas'] }, {}).map(x => x.id);
    expect(ids).toEqual(['a', 'b']);
  });
  it('el resto de filtros se cruzan', () => {
    const ids = filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, texto: 'arroz', momentos: [5] }, {}).map(x => x.id);
    expect(ids).toEqual(['d']);
  });
  it('«sin momento» y geles y productos de marca', () => {
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, momentos: [0] }, {}).map(x => x.id)).toEqual(['b', 'c']);
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, atajos: ['geles'] }, {}).map(x => x.id)).toEqual(['c']);
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, atajos: ['producto'] }, {}).map(x => x.id)).toEqual(['b']);
  });
  it('duplicados por nombre aunque cambien espacios', () => {
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, atajos: ['duplicados'] }, {}).map(x => x.id)).toEqual(['d', 'e']);
  });
  it('el estado separa sin revisar, mantenidas y retiradas', () => {
    const limpieza = { retiradas: { a: 'x' }, mantenidas: { d: 'x' } };
    expect(filtrarParaLimpiar(RECETAS, FILTRO_LIMPIEZA_VACIO, limpieza).map(x => x.id)).toEqual(['b', 'c', 'e', 'f']);
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, estado: 'retiradas' }, limpieza).map(x => x.id)).toEqual(['a']);
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, estado: 'mantenidas' }, limpieza).map(x => x.id)).toEqual(['d']);
  });
  it('por número de ingredientes', () => {
    expect(filtrarParaLimpiar(RECETAS, { ...FILTRO_LIMPIEZA_VACIO, ingredientes: '5+' }, {}).map(x => x.id)).toEqual(['d']);
  });
});

describe('gruposDuplicados', () => {
  it('agrupa por nombre y deja fuera las retiradas', () => {
    expect(gruposDuplicados(RECETAS, {}).map(g => g.map(x => x.id))).toEqual([['d', 'e']]);
    expect(gruposDuplicados(RECETAS, { retiradas: { e: 'x' } })).toEqual([]);
  });
});

describe('compararDuplicados', () => {
  const c = (id: string, ing: Array<[string, number]>, pasos = ['Mezcla todo']) =>
    ({ id, name: 'X', ingredientsText: ing.map(([name, quantity]) => ({ name, quantity })), stepsText: pasos.map((description, position) => ({ position, description })) }) as Recipe;
  it('idénticas, otra cantidad, otros pasos y distintas', () => {
    expect(compararDuplicados([c('a', [['Arroz', 60]]), c('b', [['arroz', 60]])]).tipo).toBe('identicas');
    const otra = compararDuplicados([c('a', [['Arroz', 60], ['Sal', 1]]), c('b', [['Arroz', 80], ['Sal', 1]])]);
    expect(otra.tipo).toBe('otra_cantidad');
    expect(otra.filas.map(f => f.distinta)).toEqual([true, false]);
    expect(compararDuplicados([c('a', [['Arroz', 60]]), c('b', [['Arroz', 60]], ['Hierve el arroz'])]).tipo).toBe('otros_pasos');
    const dist = compararDuplicados([c('a', [['Arroz', 60]]), c('b', [['Arroz', 60], ['Sésamo', 1]])]);
    expect(dist.tipo).toBe('distintas');
    expect(dist.filas[1].gramos).toEqual([null, 1]);
  });
});
