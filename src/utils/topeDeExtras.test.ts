import { describe, it, expect } from 'vitest';
import type { MenuMeal, MenuComplement } from '../types';
import { topeDeExtra, acotarExtrasDeComida } from './menuEngine';

/* La regla, en palabras de Dani (auditoría §6):
 *
 *   «Los extras son solo alimentos que se añaden cuando la receta no cubre las
 *    necesidades de los macronutrientes o kcal. Para que no se coma de menos
 *    según lo que tenemos calculado.»
 *
 * Es decir: el extra existe para RELLENAR lo que falta, no para añadir por
 * encima. Si la comida ya llega a su objetivo, no cabe ningún extra.
 *
 * Hasta ahora no había ningún tope en la edición manual: el generador respetaba
 * sus límites, pero el atleta podía añadir extras sin fin desde la hoja de
 * extras de «Mi menú» y salirse del plan sin que nada se lo dijera. */

const comida = (over: Partial<MenuMeal> = {}): MenuMeal => ({
  id: 'm1', slot: 3, name: 'Comida', recipeId: 'r1', recipeName: 'Arroz con pollo',
  scale: 1, exch: { HC: 3, PROT: 2, GRASA: 1 }, kcal: 600, complements: [],
  objetivo: { HC: 5, PROT: 3, GRASA: 1.5 },
  ...over,
} as MenuMeal);

describe('topeDeExtra', () => {
  it('deja añadir justo lo que falta para el objetivo', () => {
    // El plato pone 3 HC de los 5 que toca: caben 2.
    expect(topeDeExtra(comida(), 'HC')).toBe(2);
  });

  it('no deja añadir nada cuando el objetivo ya está cubierto', () => {
    const cubierta = comida({ exch: { HC: 5, PROT: 3, GRASA: 1.5 } });
    expect(topeDeExtra(cubierta, 'HC')).toBe(0);
  });

  it('tampoco deja nada cuando el plato ya se pasó', () => {
    const pasada = comida({ exch: { HC: 7, PROT: 3, GRASA: 1.5 } });
    expect(topeDeExtra(pasada, 'HC')).toBe(0);
  });

  it('cuenta lo que ya ocupan los extras puestos', () => {
    const conPan = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 1 }],
    });
    expect(topeDeExtra(conPan, 'HC')).toBe(1);   // 5 − 3 del plato − 1 del pan
  });

  it('cuenta también las raciones extra del propio plato', () => {
    const conRacion = comida({
      racionesExtra: [{ ingrediente: 'Arroz', nombre: 'arroz', category: 'HC', quantity: 1, gramos: 30 }],
    });
    expect(topeDeExtra(conRacion, 'HC')).toBe(1);
  });

  it('al medir un extra que ya está puesto, no se cuenta a sí mismo', () => {
    // Si no, subir de 1 a 1,25 el pan que ya está sería imposible: su propio
    // peso se contaría como hueco ocupado.
    const conPan = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 1 }],
    });
    expect(topeDeExtra(conPan, 'HC', 0)).toBe(2);
  });

  it('sin objetivo guardado no pone tope, en vez de inventárselo', () => {
    // Los menús publicados antes de 09-2026 no llevan `objetivo`. Recortar
    // sobre una suposición sería peor que no recortar.
    const antigua = comida({ objetivo: undefined });
    expect(topeDeExtra(antigua, 'HC')).toBe(Infinity);
  });
});

describe('acotarExtrasDeComida', () => {
  it('recorta el extra que se pasa del objetivo', () => {
    const pasada = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 4 }],
    });
    const { meal, recortado } = acotarExtrasDeComida(pasada);
    expect(recortado).toBe(true);
    expect(meal.complements[0].quantity).toBe(2);
  });

  it('quita del todo un extra que no cabe', () => {
    const cubierta = comida({
      exch: { HC: 5, PROT: 3, GRASA: 1.5 },
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 2 }],
    });
    const { meal } = acotarExtrasDeComida(cubierta);
    expect(meal.complements).toEqual([]);
  });

  it('no toca una comida que cabe', () => {
    const cabe = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 2 }],
    });
    const { meal, recortado } = acotarExtrasDeComida(cabe);
    expect(recortado).toBe(false);
    expect(meal).toBe(cabe);
  });

  it('es idempotente: recortar lo ya recortado no cambia nada', () => {
    const pasada = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 4 }],
    });
    const una = acotarExtrasDeComida(pasada).meal;
    const dos = acotarExtrasDeComida(una);
    expect(dos.recortado).toBe(false);
    expect(dos.meal).toBe(una);
  });

  it('sin objetivo guardado no recorta nada', () => {
    const antigua = comida({
      objetivo: undefined,
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 9 }],
    });
    const { meal, recortado } = acotarExtrasDeComida(antigua);
    expect(recortado).toBe(false);
    expect(meal).toBe(antigua);
  });

  it('recalcula las kcal cuando recorta', () => {
    const pasada = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 4 }],
      kcal: 9999,
    });
    const { meal } = acotarExtrasDeComida(pasada);
    expect(meal.kcal).toBeLessThan(9999);
  });

  it('recorta también las raciones extra del propio plato', () => {
    const pasada = comida({
      racionesExtra: [{ ingrediente: 'Arroz', nombre: 'arroz', category: 'HC', quantity: 6, gramos: 180 }],
    });
    const { meal, recortado } = acotarExtrasDeComida(pasada);
    expect(recortado).toBe(true);
    expect(meal.racionesExtra![0].quantity).toBe(2);
    // Los gramos se recortan en la misma proporción: 180 g eran 6 int., así que
    // 2 int. son 60 g. Dejarlos en 180 enseñaría un gramaje que no corresponde.
    expect(meal.racionesExtra![0].gramos).toBe(60);
  });
});
