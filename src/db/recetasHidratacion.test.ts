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
