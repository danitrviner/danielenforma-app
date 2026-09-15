import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { escalarRecetaEntera, factorDeReceta } from './escalarRecetaEntera';

/* Los casos 2-5 de la lista de tests que pedía la auditoría (§10):
 * cambiar los intercambios de una receta tiene que cambiar la cantidad del
 * alimento que aporta ese macro, en los dos sentidos y para los tres macros.
 *
 * El camino real en la app: el atleta mueve el stepper de la fila de receta
 * (`handleEscalarReceta`, que escala los DietItem), y al abrir la ficha
 * `factorDeReceta` deduce el factor desde los intercambios que hay en el plato
 * y `escalarRecetaEntera` reescribe las cantidades. Estos tests recorren ese
 * mismo par de funciones, que es donde vive la regla. */

const ARROZ_CON_HUEVO: Recipe = {
  id: 'r1',
  name: 'Arroz con huevo',
  exchanges: { HC: 3, PROT: 2, GRASA: 1 },
  ingredientsText: [
    { name: 'Arroz cocido', quantity: 150, unit: 'g' },
    { name: 'Huevo', quantity: 100, unit: 'g' },
    { name: 'Aceite de oliva', quantity: 10, unit: 'g' },
  ],
  macros: { carb: 75, prot: 50, fat: 11 },
  kcal: 600,
  weight: 260,
} as Recipe;

/** Lo que hace la app: del total de intercambios del plato al factor. */
const escalarA = (recipe: Recipe, totalEnElPlato: number) => {
  const base = recipe.exchanges!.HC + recipe.exchanges!.PROT + recipe.exchanges!.GRASA;
  return escalarRecetaEntera(recipe, factorDeReceta(totalEnElPlato, base));
};

describe('subir intercambios sube las cantidades', () => {
  it('de 6 a 8 intercambios, el arroz sube', () => {
    // 6 int. en total → 8 es un factor de 1,333.
    const original = ARROZ_CON_HUEVO.ingredientsText![0].quantity;
    const escalada = escalarA(ARROZ_CON_HUEVO, 8);
    expect(escalada.ingredientsText![0].quantity).toBeGreaterThan(original);
    expect(escalada.ingredientsText![0].quantity).toBe(200);   // 150 × 1,333
  });

  it('sube TODOS los ingredientes, no solo el del hidrato', () => {
    const escalada = escalarA(ARROZ_CON_HUEVO, 8);
    expect(escalada.ingredientsText!.map(i => i.quantity)).toEqual([200, 133, 13]);
  });

  it('sube también los intercambios y las kcal', () => {
    const escalada = escalarA(ARROZ_CON_HUEVO, 8);
    expect(escalada.exchanges!.HC).toBeGreaterThan(ARROZ_CON_HUEVO.exchanges!.HC);
    expect(escalada.kcal!).toBeGreaterThan(ARROZ_CON_HUEVO.kcal!);
  });
});

describe('bajar intercambios baja las cantidades', () => {
  it('de 6 a 3 intercambios, el arroz baja a la mitad', () => {
    const escalada = escalarA(ARROZ_CON_HUEVO, 3);
    expect(escalada.ingredientsText![0].quantity).toBe(75);
    expect(escalada.ingredientsText![1].quantity).toBe(50);
  });

  it('baja los macros en la misma proporción', () => {
    // Redondeados a entero: medio gramo de hidrato no se pesa en una cocina, y
    // arrastrar decimales por toda la cadena solo añade ruido.
    const escalada = escalarA(ARROZ_CON_HUEVO, 3);
    expect(escalada.macros!.carb).toBe(38);   // 75 × 0,5
    expect(escalada.macros!.prot).toBe(25);   // 50 × 0,5
    expect(escalada.macros!.fat).toBe(6);     // 11 × 0,5
  });
});

describe('los tres macros se mueven, no solo el hidrato', () => {
  const casos = [
    { macro: 'carb' as const, nombre: 'hidratos' },
    { macro: 'prot' as const, nombre: 'proteína' },
    { macro: 'fat' as const, nombre: 'grasa' },
  ];

  for (const { macro, nombre } of casos) {
    it(`cambiar la ración cambia la ${nombre}`, () => {
      const masGrande = escalarA(ARROZ_CON_HUEVO, 9);
      const masPequena = escalarA(ARROZ_CON_HUEVO, 3);
      expect(masGrande.macros![macro]).toBeGreaterThan(ARROZ_CON_HUEVO.macros![macro]!);
      expect(masPequena.macros![macro]).toBeLessThan(ARROZ_CON_HUEVO.macros![macro]!);
    });
  }
});

describe('no escalar cuando no hay que escalar', () => {
  it('el mismo número de intercambios deja la receta intacta', () => {
    expect(escalarA(ARROZ_CON_HUEVO, 6)).toBe(ARROZ_CON_HUEVO);
  });

  it('una diferencia de menos del 5 % no mueve nada', () => {
    // Evita el «×0,98» que reescribía todas las cantidades por un redondeo.
    expect(escalarA(ARROZ_CON_HUEVO, 6.2)).toBe(ARROZ_CON_HUEVO);
  });
});
