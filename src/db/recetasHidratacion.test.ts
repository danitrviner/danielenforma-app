import { describe, it, expect } from 'vitest';
import { hidratarEntradaIndice, noEsUnPlato, esSuplementoPuroPorNombre } from './recetasHidratacion';
import type { Recipe } from '../types';

const receta = (over: Partial<Recipe>): Recipe => ({
  id: 'r', ownerId: 'recetas', name: 'X', categories: [], ingredients: [], extras: [], steps: [], ...over,
} as Recipe);

describe('lo que no es un plato sale de los platos principales', () => {
  // Los cuatro que Dani encontró a mano en la pestaña de principales.
  it.each([
    ['Agua', []],
    ['Aloe vera Eco (Enzime Sabinco)', [{ name: 'Aloe Vera', quantity: 1 }]],
    ['Amilopectina - Neutro (Myprotein)', [{ name: 'Amilopectina', quantity: 1 }]],
    ['Anxistop (Life Pro)', [{ name: 'Anxistop', quantity: 1 }]],
  ])('%s deja de ser «Platos salados / principales»', (name, ingredientsText) => {
    const out = hidratarEntradaIndice(receta({
      name, categoria: 'Platos salados / principales', intakeTypes: [], ingredientsText,
    } as Partial<Recipe>));
    expect(out.categoria).toBe('Alimentos y suplementos');
    expect(out.categories).toEqual(['Alimentos y suplementos']);
  });

  it('un plato de verdad se queda donde está', () => {
    const out = hidratarEntradaIndice(receta({
      name: 'Arroz con pollo y verduras',
      categoria: 'Platos salados / principales',
      intakeTypes: [3, 5],
      ingredientsText: [{ name: 'Arroz', quantity: 100 }, { name: 'Pollo', quantity: 150 }, { name: 'Pimiento', quantity: 50 }],
    } as Partial<Recipe>));
    expect(out.categoria).toBe('Platos salados / principales');
  });

  it('un plato de UN ingrediente pero con tipo de ingesta sigue siendo plato', () => {
    // Las dos condiciones tienen que darse a la vez: una pieza de fruta como
    // merienda es un plato aunque lleve un solo ingrediente.
    expect(noEsUnPlato({ intakeTypes: [4], ingredientsText: [{ name: 'Manzana', quantity: 1 }] })).toBe(false);
  });

  it('un suplemento con tipo de ingesta lo pilla la lista de nombres', () => {
    const out = hidratarEntradaIndice(receta({
      name: 'Creatina monohidrato',
      categoria: 'Platos salados / principales',
      intakeTypes: [2],
      ingredientsText: [{ name: 'Creatina', quantity: 5 }, { name: 'Agua', quantity: 200 }],
    } as Partial<Recipe>));
    expect(out.categoria).toBe('Suplementos deportivos');
  });

  it('la lista de nombres no confunde palabras que contienen otras', () => {
    expect(esSuplementoPuroPorNombre('Ensalada de arroz con taurina')).toBe(true);
    expect(esSuplementoPuroPorNombre('Tarta de zanahoria')).toBe(false);
    expect(esSuplementoPuroPorNombre('Descafeinado con leche')).toBe(false);
  });
});

describe('vínculo compacto del índice (26-10-2026)', () => {
  it('rehidrata las tuplas con los valores por 100 g de cada alimento', () => {
    const out = hidratarEntradaIndice(
      { ...receta({ name: 'Arroz con pollo' }), vin: [[0, 'arroz', 90, 45, 180, 'h'], [1, null, 1, 1, 1, 0]] } as never,
      { arroz: [360, 6.7, 80, 0.6] },
    );
    expect(out.vinculo?.ingredientes).toEqual([
      { n: 0, alimentoId: 'arroz', gramos: 90, min: 45, max: 180, palanca: 'hc', porCien: { kcal: 360, p: 6.7, hc: 80, g: 0.6 } },
      { n: 1, alimentoId: null, gramos: 1, min: 1, max: 1, fijo: true },
    ]);
    expect((out as unknown as { vin?: unknown }).vin).toBeUndefined();
  });
});
