import { describe, it, expect } from 'vitest';
import type { DietItem, Recipe } from '../types';
import { racionQueCabe, acotarRacion, marcaDeCupo, ordenarParaElegir, ingredientesDeFicha, conRetoques } from './usarReceta';

const receta = (id: string, name: string, kcal: number, p: number, hc: number, g: number): Recipe =>
  ({ id, ownerId: 'x', name, categories: [], ingredients: [], extras: [], steps: [], kcal, macros: { prot: p, carb: hc, fat: g } });

describe('racionQueCabe', () => {
  it('da la ración más grande en cuartos que no se pasa', () => {
    expect(racionQueCabe(400, 640)).toBe(1.5);
    expect(racionQueCabe(400, 400)).toBe(1);
    expect(racionQueCabe(400, 399)).toBe(0.75);
  });
  it('no baja de un cuarto ni sube de cuatro', () => {
    expect(racionQueCabe(400, 50)).toBe(0.25);
    expect(racionQueCabe(100, 5000)).toBe(4);
    expect(racionQueCabe(0, 500)).toBe(0.25);
  });
});

describe('acotarRacion', () => {
  it('redondea a cuartos dentro de los límites', () => {
    expect(acotarRacion(1.1)).toBe(1);
    expect(acotarRacion(0)).toBe(0.25);
    expect(acotarRacion(9)).toBe(4);
    expect(acotarRacion(NaN)).toBe(1);
  });
});

describe('marcaDeCupo', () => {
  const hueco = { kcal: 500, p: 35, hc: 55, g: 15 };
  it('marca la que cabe', () => {
    expect(marcaDeCupo(receta('a', 'A', 450, 30, 50, 12), hueco)).toEqual({ tipo: 'encaja' });
  });
  it('dice cuánto se pasa la que no', () => {
    expect(marcaDeCupo(receta('b', 'B', 720, 45, 80, 25), hueco)).toEqual({ tipo: 'sobra', kcal: 220 });
  });
  it('no marca nada sin hueco o sin datos', () => {
    expect(marcaDeCupo(receta('c', 'C', 0, 0, 0, 0), hueco)).toBeNull();
    expect(marcaDeCupo(receta('a', 'A', 450, 30, 50, 12), { kcal: 0, p: 0, hc: 0, g: 0 })).toBeNull();
  });
});

describe('ordenarParaElegir', () => {
  it('pone favoritas, luego las que encajan y luego el resto, sin esconder ninguna', () => {
    const hueco = { kcal: 500, p: 35, hc: 55, g: 15 };
    const lista = [receta('grande', 'Zeta', 900, 60, 100, 30), receta('cabe', 'Beta', 450, 30, 50, 12), receta('fav', 'Omega', 950, 60, 110, 30)];
    expect(ordenarParaElegir(lista, hueco, new Set(['fav'])).map(r => r.id)).toEqual(['fav', 'cabe', 'grande']);
  });
});

describe('retoques por ingrediente', () => {
  const items: DietItem[] = [
    { category: 'HC', foodLabel: 'Arroz', quantity: 2, lineaId: 'l1', gramos: 150, nutrientes: { kcal: 195, p: 4, hc: 42, g: 0.5 } },
    { category: 'PROT', foodLabel: 'Arroz', quantity: 0.25, lineaId: 'l1' },
    { category: 'GRASA', foodLabel: 'Aceite', quantity: 1, lineaId: 'l2', gramos: 10, nutrientes: { kcal: 90, p: 0, hc: 0, g: 10 } },
  ];
  it('agrupa las líneas de un mismo ingrediente', () => {
    const ings = ingredientesDeFicha(items);
    expect(ings.map(i => [i.nombre, i.gramos, i.kcal, i.idxs])).toEqual([['Arroz', 150, 195, [0, 1]], ['Aceite', 10, 90, [2]]]);
  });
  it('escala solo el ingrediente retocado', () => {
    const out = conRetoques(items, { 1: 0.5 });
    expect(out[0]).toEqual(items[0]);
    expect(out[2].gramos).toBe(5);
    expect(out[2].nutrientes).toEqual({ kcal: 45, p: 0, hc: 0, g: 5 });
    expect(out[2].quantity).toBe(0.5);
  });
});
