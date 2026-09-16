import { describe, expect, it } from 'vitest';
import { Recipe } from '../types';
import { escalarRecetaEntera, factorDeReceta , escalaDeReceta } from './escalarRecetaEntera';

function receta(extra: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1', ownerId: 'recetas', name: 'Avena con plátano',
    categories: [], ingredients: [], extras: [], steps: [],
    ...extra,
  };
}

describe('escalarRecetaEntera', () => {
  it('dobla los gramos del recetario importado', () => {
    const r = receta({ ingredientsText: [{ name: 'Avena', quantity: 40 }, { name: 'Plátano', quantity: 120 }] });
    expect(escalarRecetaEntera(r, 2).ingredientsText).toEqual([
      { name: 'Avena', quantity: 80 },
      { name: 'Plátano', quantity: 240 },
    ]);
  });

  it('un ingrediente del índice sin cantidad no se convierte en NaN', () => {
    const r = receta({ ingredientsText: [{ name: 'Arroz', quantity: NaN }, { name: 'Pollo', quantity: 100 }] });
    const escalada = escalarRecetaEntera(r, 2);
    expect(Number.isNaN(escalada.ingredientsText![0].quantity)).toBe(true);
    expect(escalada.ingredientsText![1].quantity).toBe(200);
  });

  it('escala intercambios, kcal, macros y peso', () => {
    const r = receta({
      exchanges: { HC: 2, PROT: 1, GRASA: 0.5 },
      macros: { carb: 40, prot: 20, fat: 5 },
      kcal: 300, weight: 250,
    });
    const x2 = escalarRecetaEntera(r, 2);
    expect(x2.exchanges).toEqual({ HC: 4, PROT: 2, GRASA: 1 });
    expect(x2.macros).toEqual({ carb: 80, prot: 40, fat: 10 });
    expect(x2.kcal).toBe(600);
    expect(x2.weight).toBe(500);
  });

  it('los ingredientes del constructor se redondean al cuarto, no a entero', () => {
    const r = receta({ ingredients: [{ category: 'HC', foodLabel: '100g arroz', quantity: 1, mode: 'OMNIVORO' }] });
    expect(escalarRecetaEntera(r, 1.5).ingredients[0].quantity).toBe(1.5);
    expect(escalarRecetaEntera(r, 0.3).ingredients[0].quantity).toBe(0.25);
  });

  it('factor 1 devuelve la misma receta sin copiarla', () => {
    const r = receta({ kcal: 300 });
    expect(escalarRecetaEntera(r, 1)).toBe(r);
  });

  it('un factor imposible se ignora en vez de vaciar la receta', () => {
    const r = receta({ kcal: 300 });
    expect(escalarRecetaEntera(r, 0)).toBe(r);
    expect(escalarRecetaEntera(r, NaN)).toBe(r);
    expect(escalarRecetaEntera(r, -2)).toBe(r);
  });

  it('media receta baja los gramos a la mitad', () => {
    const r = receta({ ingredientsText: [{ name: 'Avena', quantity: 41 }] });
    expect(escalarRecetaEntera(r, 0.5).ingredientsText![0].quantity).toBe(21);
  });
});

describe('factorDeReceta', () => {
  it('4 intercambios sobre una receta de 2 es ×2', () => {
    expect(factorDeReceta(4, 2)).toBe(2);
  });

  it('una receta sin intercambios base no escala nada', () => {
    expect(factorDeReceta(4, 0)).toBe(1);
  });

  it('la deriva de redondeo no convierte una receta intacta en un ×0,98', () => {
    // Los dos totales se redondean por caminos distintos (snapExchanges vs
    // round2), y con ingredientes MIX pueden no cuadrar al céntimo.
    expect(factorDeReceta(2.95, 3)).toBe(1);
    expect(factorDeReceta(3.1, 3)).toBe(1);
  });

  it('media ración y ración doble sí se detectan', () => {
    expect(factorDeReceta(1.5, 3)).toBe(0.5);
    expect(factorDeReceta(6, 3)).toBe(2);
    expect(factorDeReceta(3.75, 3)).toBeCloseTo(1.25);
  });
});

describe('la escala guardada manda sobre la deducida', () => {
  /* Por qué hace falta guardarla (medido sobre 3.000 recetas reales el
   * 16-09-2026): `factorDeReceta` ignora los cambios de menos del 5 % para no
   * sacar un «×0,98» por ruido de redondeo. Pero un toque del stepper son 0,25
   * intercambios, y en un plato de 5,5 a 6 —pizza, pad thai, raviolis— eso es
   * un 4,2 %: por debajo del umbral. El atleta daba al «+» y la ficha seguía
   * diciendo los mismos gramos. Le pasaba al 9,1 % del recetario.
   *
   * No se puede arreglar bajando el umbral: el ruido de redondeo llega también
   * a 0,25 (MAX_TOTAL_DRIFT en exchangeRounding.ts), así que por tamaño son
   * indistinguibles. La única salida es que quien escala GUARDE lo que hizo. */

  it('usa la escala guardada aunque el cambio sea pequeño', () => {
    // 6 → 6,25 int. es un 4,2 %: `factorDeReceta` lo descartaría.
    expect(escalaDeReceta({ escala: 6.25 / 6 }, 6.25, 6)).toBeCloseTo(1.0417, 3);
  });

  it('sin escala guardada sigue deduciéndola, como hasta ahora', () => {
    expect(escalaDeReceta({}, 12, 6)).toBe(2);
  });

  it('sin escala guardada sigue ignorando el ruido de redondeo', () => {
    expect(escalaDeReceta({}, 5.88, 6)).toBe(1);
  });

  it('una escala guardada de 1 no escala', () => {
    expect(escalaDeReceta({ escala: 1 }, 6, 6)).toBe(1);
  });

  it('ignora una escala guardada absurda en vez de reventar la receta', () => {
    expect(escalaDeReceta({ escala: 0 }, 12, 6)).toBe(2);
    expect(escalaDeReceta({ escala: -1 }, 12, 6)).toBe(2);
    expect(escalaDeReceta({ escala: NaN }, 12, 6)).toBe(2);
  });
});
