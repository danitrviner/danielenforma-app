import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { ingredientesEditables, sePuedeEditar, macrosConGramos, cambiosConGramos, kcalDeIngrediente, gramosParaGuardar } from './editarRecetaPropia';
import type { LineaDiario } from './diarioCalorias';

/* Como las que guardan hoy los atletas: alimentos del banco con su cantidad. */
const deBanco: Recipe = {
  id: 'r_comida', ownerId: 'u1', name: 'Comida día alto', categories: [], extras: [], steps: [],
  ingredients: [
    { foodLabel: '30g arroz, pasta, couscous o quinoa', category: 'HC', mode: 'OMNIVORO', quantity: 2.67 },
    { foodLabel: '30g queso (curado, semicurado, cabra, mozzarella...)', category: 'MIX_GRASA', mode: 'OMNIVORO', quantity: 2 },
    { foodLabel: '10ml (1 cuchara) aceite (preferible AOVE)', category: 'GRASA', mode: 'OMNIVORO', quantity: 1 },
  ],
};

/* Vinculada al catálogo: gramos y valores por 100 g. */
const vinculada: Recipe = {
  id: 'r_cabra', ownerId: 'u1', name: 'Ensalada de queso de cabra', categories: [], ingredients: [], extras: [], steps: [],
  ingredientsText: [{ name: 'Rúcula', quantity: 50 }, { name: 'Queso de cabra', quantity: 80 }, { name: 'Nueces', quantity: 20 }, { name: 'Sal', quantity: 1 }],
  vinculo: {
    calculadoEn: '2026-11-17',
    ingredientes: [
      { n: 0, alimentoId: 'rucula', gramos: 50, min: 20, max: 100, porCien: { kcal: 25, p: 2.6, hc: 3.7, g: 0.7 } },
      { n: 1, alimentoId: 'cabra', gramos: 80, min: 30, max: 120, porCien: { kcal: 364, p: 22, hc: 0.1, g: 30 } },
      { n: 2, alimentoId: 'nueces', gramos: 20, min: 10, max: 40, porCien: { kcal: 654, p: 15, hc: 14, g: 65 } },
      { n: 3, alimentoId: null, gramos: 1, min: 1, max: 1 },
    ],
  },
};

describe('editar una receta propia · alimentos del banco', () => {
  it('gramos = gramaje de la etiqueta × cantidad', () => {
    expect(ingredientesEditables(deBanco)).toEqual([
      { n: 0, nombre: 'Arroz, pasta, couscous o quinoa', gramos: 80 },
      { n: 1, nombre: 'Queso', gramos: 60 },
      { n: 2, nombre: 'Aceite', gramos: 10 },
    ]);
  });

  it('bajar el queso baja las kcal y la grasa', () => {
    const antes = macrosConGramos(deBanco, {});
    const despues = macrosConGramos(deBanco, { 1: 30 });
    expect(despues.kcal).toBeLessThan(antes.kcal);
    expect(despues.g).toBeLessThan(antes.g);
    expect(kcalDeIngrediente(deBanco, 1, 30)).toBeLessThan(kcalDeIngrediente(deBanco, 1, 60));
  });

  it('guarda la cantidad nueva, los totales y los intercambios', () => {
    const c = cambiosConGramos(deBanco, { 1: 30 });
    expect(c.ingredients?.[1].quantity).toBe(1);
    expect(c.kcal).toBe(Math.round(macrosConGramos(deBanco, { 1: 30 }).kcal));
    expect(c.exchanges).toBeDefined();
    expect(c.name).toBeUndefined();
  });

  it('a 0 se quita', () => {
    const c = cambiosConGramos(deBanco, { 2: 0 }, 'Comida sin aceite');
    expect(c.ingredients?.map(i => i.category)).toEqual(['HC', 'MIX_GRASA']);
    expect(c.name).toBe('Comida sin aceite');
  });
});

describe('editar una receta propia · vinculada', () => {
  it('solo los ingredientes que cuentan, con su nombre', () => {
    expect(ingredientesEditables(vinculada).map(i => i.nombre)).toEqual(['Rúcula', 'Queso de cabra', 'Nueces']);
  });

  it('solo el dueño y si tiene gramos', () => {
    expect(sePuedeEditar(vinculada, 'u1')).toBe(true);
    expect(sePuedeEditar(vinculada, 'otro')).toBe(false);
    expect(sePuedeEditar({ ...vinculada, vinculo: undefined }, 'u1')).toBe(false);
    expect(sePuedeEditar(deBanco, 'u1')).toBe(true);
  });

  it('guarda gramos y cantidades del texto', () => {
    const c = cambiosConGramos(vinculada, { 1: 40 });
    expect(c.vinculo?.ingredientes.find(i => i.n === 1)?.gramos).toBe(40);
    expect(c.ingredientsText?.[1].quantity).toBe(40);
  });

  it('un ingrediente a 0 se quita del vínculo', () => {
    expect(cambiosConGramos(vinculada, { 2: 0 }).vinculo?.ingredientes.map(i => i.n)).toEqual([0, 1, 3]);
  });
});

describe('guardar una comida como receta', () => {
  const linea = (nombre: string, gramos: number, kcal: number, p: number, hc: number, g: number, tipo: LineaDiario['tipo'] = 'producto') =>
    ({ clave: nombre, idxs: [0], nombre, gramos, kcal, macros: { p, hc, g }, aproximado: false, tipo }) as LineaDiario;

  it('guarda gramos y valores por 100 g, y la receta sale editable con lo mismo', () => {
    const guardado = gramosParaGuardar([linea('Copos de avena', 60, 223, 8.1, 35.2, 4.2), linea('Queso de cabra', 80, 291, 17.6, 0.1, 24)], '2026-11-25')!;
    expect(guardado.ingredientsText).toEqual([{ name: 'Copos de avena', quantity: 60 }, { name: 'Queso de cabra', quantity: 80 }]);
    expect(guardado.vinculo?.ingredientes.every(i => i.fijo)).toBe(true);
    const receta: Recipe = { id: 'r', ownerId: 'u1', name: 'Desayuno', categories: [], ingredients: [], extras: [], steps: [], ...guardado };
    expect(ingredientesEditables(receta).map(i => [i.nombre, i.gramos])).toEqual([['Copos de avena', 60], ['Queso de cabra', 80]]);
    expect(Math.round(macrosConGramos(receta, {}).kcal)).toBe(514);
  });

  it('si una línea no tiene gramos, nada', () => {
    expect(gramosParaGuardar([linea('Copos de avena', 60, 223, 8.1, 35.2, 4.2), linea('Plato', 0, 400, 20, 40, 15, 'plato')], '2026-11-25')).toBeNull();
  });
});
