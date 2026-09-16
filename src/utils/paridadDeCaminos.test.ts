import { describe, it, expect } from 'vitest';
import type { Recipe, MenuMeal, DietItem, FoodCategory } from '../types';
import { totalConExtras } from './menuEngine';
import { itemsDeComidaDelMenu } from './conversionNutricional';
import { recipeToDietItems } from './exchangeHelpers';

/* La misma comida tiene que dar lo mismo se meta como se meta (auditoría §8.4).
 *
 * El cliente lo reportó como «20 intercambios salen 26»: metiendo las recetas
 * una a una no cuadra, cargando el menú guardado sí. Los dos caminos existen y
 * no coinciden:
 *
 *   · Marcar la comida en «Mi menú»  → suma `meal.exch` (YA escalado) + los
 *     acompañamientos + las raciones extra.
 *   · Botón «Añadir a mi plan»       → pasaba la receta CRUDA, sin la escala y
 *     sin ningún extra.
 *
 * Una comida a ×1,5 con un acompañamiento entraba por el segundo camino como
 * si fuese el plato base. Estos tests obligan a que los dos caminos den lo
 * mismo. */

const receta: Recipe = {
  id: 'r1',
  name: 'Arroz con pollo',
  exchanges: { HC: 2, PROT: 1, GRASA: 0.5 },
} as Recipe;

const comida = (over: Partial<MenuMeal> = {}): MenuMeal => ({
  id: 'm1', slot: 3, name: 'Comida', recipeId: 'r1', recipeName: 'Arroz con pollo',
  scale: 1, exch: { HC: 2, PROT: 1, GRASA: 0.5 }, kcal: 350, complements: [],
  ...over,
} as MenuMeal);

function sumaPorCategoria(items: DietItem[]): Record<string, number> {
  const total: Record<string, number> = { HC: 0, PROT: 0, GRASA: 0 };
  for (const i of items) total[i.category] = (total[i.category] ?? 0) + i.quantity;
  return total;
}

describe('marcar la comida y añadirla al plan dan lo mismo', () => {
  it('con el plato tal cual', () => {
    const m = comida();
    expect(sumaPorCategoria(itemsDeComidaDelMenu(receta, m)))
      .toEqual({ ...totalConExtras(m.exch, m.complements, m.racionesExtra) });
  });

  it('con el plato escalado a ×1,5', () => {
    // Es el caso que fallaba: el menú sirve ración y media y el botón metía
    // una ración.
    const m = comida({ scale: 1.5, exch: { HC: 3, PROT: 1.5, GRASA: 0.75 } });
    expect(sumaPorCategoria(itemsDeComidaDelMenu(receta, m)))
      .toEqual({ ...totalConExtras(m.exch, m.complements, m.racionesExtra) });
  });

  it('con acompañamientos', () => {
    const m = comida({
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 1 }],
    });
    expect(sumaPorCategoria(itemsDeComidaDelMenu(receta, m)))
      .toEqual({ ...totalConExtras(m.exch, m.complements, m.racionesExtra) });
  });

  it('con más ración de un ingrediente del propio plato', () => {
    const m = comida({
      racionesExtra: [{ ingrediente: 'Arroz', nombre: 'arroz', category: 'HC', quantity: 1, gramos: 30 }],
    });
    expect(sumaPorCategoria(itemsDeComidaDelMenu(receta, m)))
      .toEqual({ ...totalConExtras(m.exch, m.complements, m.racionesExtra) });
  });

  it('con escala y los dos tipos de extra a la vez', () => {
    const m = comida({
      scale: 1.5,
      exch: { HC: 3, PROT: 1.5, GRASA: 0.75 },
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 1 }],
      racionesExtra: [{ ingrediente: 'Pollo', nombre: 'pollo', category: 'PROT', quantity: 0.5, gramos: 25 }],
    });
    expect(sumaPorCategoria(itemsDeComidaDelMenu(receta, m)))
      .toEqual({ ...totalConExtras(m.exch, m.complements, m.racionesExtra) });
  });
});

describe('lo que hacía el botón antes, para que no vuelva', () => {
  it('la receta cruda se queda corta en una comida escalada con extras', () => {
    const m = comida({
      scale: 1.5,
      exch: { HC: 3, PROT: 1.5, GRASA: 0.75 },
      complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 1 }],
    });
    const crudo = sumaPorCategoria(recipeToDietItems(receta, ['OMNIVORO']));
    const correcto = sumaPorCategoria(itemsDeComidaDelMenu(receta, m));

    expect(crudo.HC).toBe(2);        // lo que metía el botón
    expect(correcto.HC).toBe(4);     // lo que el atleta se come de verdad
  });
});

describe('los ítems que salen del menú', () => {
  it('se reconocen como receta, para agrupar en una sola fila', () => {
    const items = itemsDeComidaDelMenu(receta, comida());
    expect(items.every(i => i.originRecipeId === 'r1')).toBe(true);
  });

  it('el acompañamiento es un alimento aparte, con su gramaje', () => {
    const m = comida({ complements: [{ foodLabel: '40g pan (de molde)', category: 'HC', quantity: 1 }] });
    const pan = itemsDeComidaDelMenu(receta, m).find(i => i.foodLabel.includes('pan'));
    expect(pan?.baseGrams).toBe(40);
    expect(pan?.originRecipeId).toBeUndefined();
  });

  it('la ración extra lleva los gramos que ya calculó el menú', () => {
    const m = comida({
      racionesExtra: [{ ingrediente: 'Arroz', nombre: 'arroz', category: 'HC', quantity: 2, gramos: 60 }],
    });
    const extra = itemsDeComidaDelMenu(receta, m).find(i => i.foodLabel.includes('arroz'));
    expect(extra?.baseGrams).toBe(30);   // 60 g entre 2 intercambios
  });

  it('una comida sin nada que sumar no mete filas vacías', () => {
    const vacia = comida({ exch: { HC: 0, PROT: 0, GRASA: 0 } });
    expect(itemsDeComidaDelMenu({ ...receta, exchanges: undefined } as Recipe, vacia)).toEqual([]);
  });
});
