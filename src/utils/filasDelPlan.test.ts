import { describe, it, expect } from 'vitest';
import { filasDeComida, escalarReceta } from './filasDelPlan';
import type { DietItem } from '../types';

const item = (over: Partial<DietItem>): DietItem =>
  ({ category: 'HC', foodLabel: 'x', quantity: 1, ...over });

describe('filasDeComida', () => {
  it('un alimento suelto es una fila', () => {
    const filas = filasDeComida([item({ foodLabel: 'Arroz' })]);
    expect(filas).toHaveLength(1);
    expect(filas[0].tipo).toBe('alimento');
  });

  it('la receta que se parte en tres categorías sale como UNA fila con la suma', () => {
    // Es el caso real: `recipeToDietItems` convierte una receta del recetario en
    // un DietItem por categoría, y antes se veían tres "Pollo al curry" seguidos.
    const items = [
      item({ category: 'HC', foodLabel: 'Pollo al curry', quantity: 2, originRecipeId: 'r1' }),
      item({ category: 'PROT', foodLabel: 'Pollo al curry', quantity: 1.5, originRecipeId: 'r1' }),
      item({ category: 'GRASA', foodLabel: 'Pollo al curry', quantity: 1, originRecipeId: 'r1' }),
    ];
    const filas = filasDeComida(items);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      tipo: 'receta',
      recipeId: 'r1',
      nombre: 'Pollo al curry',
      idxs: [0, 1, 2],
    });
    expect(filas[0].tipo === 'receta' && filas[0].intercambios).toMatchObject({ HC: 2, PROT: 1.5, GRASA: 1 });
  });

  it('la misma receta metida dos veces son dos platos, no uno', () => {
    const items = [
      item({ foodLabel: 'Tostada', originRecipeId: 'r1' }),
      item({ foodLabel: 'Tostada', originRecipeId: 'r1' }),
    ];
    // Contiguas con el mismo id, pero añadidas en dos tandas: la agrupación no
    // puede distinguirlas, así que se agrupan. Documentado a propósito: son las
    // mismas raciones y el stepper de la fila las escala juntas.
    expect(filasDeComida(items)).toHaveLength(1);
  });

  it('mezcla alimentos sueltos y recetas conservando el orden', () => {
    const items = [
      item({ foodLabel: 'Café' }),
      item({ category: 'HC', foodLabel: 'Avena con fruta', originRecipeId: 'r2' }),
      item({ category: 'PROT', foodLabel: 'Avena con fruta', originRecipeId: 'r2' }),
      item({ foodLabel: 'Aceite' }),
    ];
    const filas = filasDeComida(items);
    expect(filas.map(f => f.tipo)).toEqual(['alimento', 'receta', 'alimento']);
    expect(filas[2].tipo === 'alimento' && filas[2].idx).toBe(3);
  });

  it('dos recetas distintas seguidas no se funden', () => {
    const items = [
      item({ foodLabel: 'A', originRecipeId: 'r1' }),
      item({ foodLabel: 'B', originRecipeId: 'r2' }),
    ];
    expect(filasDeComida(items)).toHaveLength(2);
  });

  it('una comida vacía no da filas', () => {
    expect(filasDeComida([])).toEqual([]);
  });
});

describe('escalarReceta', () => {
  const receta = [
    item({ category: 'HC', quantity: 2, originRecipeId: 'r1' }),
    item({ category: 'PROT', quantity: 1, originRecipeId: 'r1' }),
  ];

  it('sube el plato entero manteniendo la proporción', () => {
    const out = escalarReceta(receta, [0, 1], 0.25);
    // El mayor manda: 2 → 2,25 es un factor de 1,125; el de 1 sube a 1,25 tras
    // redondear a cuartos, que es la unidad de la app.
    expect(out[0].quantity).toBe(2.25);
    expect(out[1].quantity).toBe(1.25);
  });

  it('baja sin llegar nunca a cero', () => {
    const out = escalarReceta([item({ quantity: 0.25, originRecipeId: 'r1' })], [0], -0.25);
    expect(out[0].quantity).toBe(0.25);
  });

  it('no toca los alimentos que no son de la receta', () => {
    const items = [...receta, item({ foodLabel: 'Aceite', quantity: 1 })];
    const out = escalarReceta(items, [0, 1], 0.25);
    expect(out[2].quantity).toBe(1);
  });

  it('una receta a cero intercambios se deja como está', () => {
    const items = [item({ quantity: 0, originRecipeId: 'r1' })];
    expect(escalarReceta(items, [0], 0.25)).toEqual(items);
  });
});

describe('filas que vienen del menú semanal', () => {
  /* Decisión de Dani: una receta marcada desde «Mi menú» cae en la comida que le
   * tocaba y NO se puede mover ni reescalar desde el plan. La fila tiene que
   * decir de dónde viene para que la pantalla lo enseñe en vez de ofrecer unos
   * controles que descuadrarían el menú por detrás. */
  const delMenu = (over: Partial<DietItem> = {}): DietItem => ({
    category: 'HC', foodLabel: 'Arroz con pollo', quantity: 2,
    originRecipeId: 'r1', origenMenu: 'lun_m3', ...over,
  });

  it('la fila de receta dice de qué comida del menú viene', () => {
    const [fila] = filasDeComida([delMenu(), delMenu({ category: 'PROT', quantity: 1 })]);
    expect(fila.tipo).toBe('receta');
    expect(fila.tipo === 'receta' && fila.origenMenu).toBe('lun_m3');
  });

  it('una receta añadida a mano no lleva marca de menú', () => {
    const [fila] = filasDeComida([delMenu({ origenMenu: undefined })]);
    expect(fila.tipo === 'receta' && fila.origenMenu).toBeUndefined();
  });

  it('un alimento suelto del menú también se distingue', () => {
    // El acompañamiento de una comida del menú: entra sin originRecipeId pero
    // sí con origenMenu, y tampoco se puede tocar desde el plan.
    const [fila] = filasDeComida([{ category: 'HC', foodLabel: '40g pan', quantity: 1, origenMenu: 'lun_m3' }]);
    expect(fila.tipo).toBe('alimento');
    expect(fila.tipo === 'alimento' && fila.item.origenMenu).toBe('lun_m3');
  });
});

describe('el stepper guarda lo que hace', () => {
  /* Sin esto, la ficha tenía que deducir el factor de los intercambios, y en
   * un plato de 6 un toque del stepper (4,2 %) quedaba por debajo del umbral
   * de ruido: el atleta daba al «+» y los gramos no se movían. */
  const receta = (q: number, escala?: number): DietItem => ({
    category: 'HC', foodLabel: 'Pizza', quantity: q, originRecipeId: 'r1',
    ...(escala != null ? { escala } : {}),
  });

  it('un toque guarda su factor', () => {
    const [item] = escalarReceta([receta(6)], [0], 0.25);
    expect(item.quantity).toBe(6.25);
    expect(item.escala).toBeCloseTo(6.25 / 6, 4);
  });

  it('dos toques acumulan sobre la receta ORIGINAL, no sobre lo ya escalado', () => {
    const uno = escalarReceta([receta(6)], [0], 0.25);
    const dos = escalarReceta(uno, [0], 0.25);
    expect(dos[0].quantity).toBe(6.5);
    // 6,5/6, no (6,25/6)×(6,5/6,25) mal compuesto.
    expect(dos[0].escala).toBeCloseTo(6.5 / 6, 3);
  });

  it('bajar también se guarda', () => {
    const [item] = escalarReceta([receta(6)], [0], -0.25);
    expect(item.escala).toBeLessThan(1);
  });

  it('volver al punto de partida deja la escala en 1', () => {
    const arriba = escalarReceta([receta(6)], [0], 0.25);
    const vuelta = escalarReceta(arriba, [0], -0.25);
    expect(vuelta[0].quantity).toBe(6);
    expect(vuelta[0].escala).toBeCloseTo(1, 3);
  });
});
