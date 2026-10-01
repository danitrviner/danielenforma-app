import { describe, it, expect } from 'vitest';
import { DietItem, DietMeal } from '../types';
import {
  aDiaFlexible, aPorComidas, filasEnOrdenCronologico, horaActualHHMM,
  itemTieneHora, ID_COMIDA_FLEXIBLE, NOMBRE_COMIDA_FLEXIBLE,
} from './diaFlexible';

function item(p: Partial<DietItem> & { foodLabel: string }): DietItem {
  return { category: 'HC', quantity: 1, ...p };
}

describe('aDiaFlexible / aPorComidas', () => {
  it('junta todo lo colocado en una sola comida, en el orden de las comidas originales', () => {
    const meals: DietMeal[] = [
      { id: 'm1', name: 'Desayuno', items: [item({ foodLabel: 'Pan' }), item({ foodLabel: 'Café' })] },
      { id: 'm2', name: 'Comida', items: [item({ foodLabel: 'Arroz' })] },
    ];
    const estados = {
      m1_0: { foodLabel: 'Pan', done: true },
      m1_1: { foodLabel: 'Café', done: false },
      m2_0: { foodLabel: 'Arroz', done: true },
    };
    const { meals: flex, estados: nuevos } = aDiaFlexible(meals, estados);
    expect(flex).toHaveLength(1);
    expect(flex[0].id).toBe(ID_COMIDA_FLEXIBLE);
    expect(flex[0].name).toBe(NOMBRE_COMIDA_FLEXIBLE);
    expect(flex[0].items.map(i => i.foodLabel)).toEqual(['Pan', 'Café', 'Arroz']);
    expect(nuevos[`${ID_COMIDA_FLEXIBLE}_0`]).toEqual({ foodLabel: 'Pan', done: true });
    expect(nuevos[`${ID_COMIDA_FLEXIBLE}_1`]).toEqual({ foodLabel: 'Café', done: false });
    expect(nuevos[`${ID_COMIDA_FLEXIBLE}_2`]).toEqual({ foodLabel: 'Arroz', done: true });
  });

  it('conserva la contigüidad de una receta (originRecipeId) al concatenar comidas', () => {
    const meals: DietMeal[] = [
      { id: 'm1', name: 'Desayuno', items: [item({ foodLabel: 'Suelto' })] },
      {
        id: 'm2', name: 'Comida', items: [
          item({ foodLabel: 'Pollo al curry', category: 'PROT', originRecipeId: 'r1' }),
          item({ foodLabel: 'Pollo al curry', category: 'HC', originRecipeId: 'r1' }),
        ],
      },
    ];
    const estados = { m1_0: { foodLabel: 'Suelto', done: true }, m2_0: { foodLabel: 'Pollo al curry', done: true }, m2_1: { foodLabel: 'Pollo al curry', done: true } };
    const { meals: flex } = aDiaFlexible(meals, estados);
    expect(flex[0].items[1].originRecipeId).toBe('r1');
    expect(flex[0].items[2].originRecipeId).toBe('r1');
  });

  it('no pierde nada: round-trip ida y vuelta conserva todos los ítems y sus estados', () => {
    const meals: DietMeal[] = [
      { id: 'm1', name: 'Desayuno', items: [item({ foodLabel: 'Pan' })] },
      { id: 'm2', name: 'Comida', items: [item({ foodLabel: 'Arroz' }), item({ foodLabel: 'Pollo' })] },
    ];
    const estados = {
      m1_0: { foodLabel: 'Pan', done: true },
      m2_0: { foodLabel: 'Arroz', done: false },
      m2_1: { foodLabel: 'Pollo', done: true },
    };
    const { meals: flex, estados: estadosFlex } = aDiaFlexible(meals, estados);

    const estructura: DietMeal[] = [
      { id: 'nuevo1', name: 'Desayuno', items: [], target: { HC: 2, PROT: 1, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 } },
      { id: 'nuevo2', name: 'Comida', items: [], target: { HC: 1, PROT: 1, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 } },
    ];
    const { meals: vuelta, estados: estadosVuelta } = aPorComidas(flex, estadosFlex, estructura);

    expect(vuelta).toHaveLength(2);
    // Todo cae en la PRIMERA comida de la estructura (decisión de Dani).
    expect(vuelta[0].id).toBe('nuevo1');
    expect(vuelta[0].items.map(i => i.foodLabel)).toEqual(['Pan', 'Arroz', 'Pollo']);
    expect(vuelta[0].target).toEqual({ HC: 2, PROT: 1, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 });
    // La segunda comida de la estructura se mantiene, vacía, con su reparto.
    expect(vuelta[1].id).toBe('nuevo2');
    expect(vuelta[1].items).toEqual([]);
    expect(vuelta[1].target).toEqual({ HC: 1, PROT: 1, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 });

    expect(estadosVuelta['nuevo1_0']).toEqual({ foodLabel: 'Pan', done: true });
    expect(estadosVuelta['nuevo1_1']).toEqual({ foodLabel: 'Arroz', done: false });
    expect(estadosVuelta['nuevo1_2']).toEqual({ foodLabel: 'Pollo', done: true });
  });

  it('al volver a por comidas, las demás comidas del plan llegan vacías: lo que traía el coach ya va en lo apuntado', () => {
    const flex: DietMeal[] = [{ id: ID_COMIDA_FLEXIBLE, name: NOMBRE_COMIDA_FLEXIBLE, items: [item({ foodLabel: 'Pan' }), item({ foodLabel: 'Arroz' })] }];
    const estructura: DietMeal[] = [
      { id: 'e1', name: 'Desayuno', items: [item({ foodLabel: 'Pan' })], target: { HC: 1, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 } },
      { id: 'e2', name: 'Comida', items: [item({ foodLabel: 'Arroz' })], target: { HC: 1, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 } },
    ];
    const { meals } = aPorComidas(flex, {}, estructura);
    expect(meals[0].items.map(i => i.foodLabel)).toEqual(['Pan', 'Arroz']);
    expect(meals[1].items).toEqual([]);
    expect(meals[1].target?.HC).toBe(1);
  });

  it('si la estructura de destino viene vacía, crea un hueco de emergencia en vez de perder lo apuntado', () => {
    const flex: DietMeal[] = [{ id: ID_COMIDA_FLEXIBLE, name: NOMBRE_COMIDA_FLEXIBLE, items: [item({ foodLabel: 'Pan' })] }];
    const estados = { [`${ID_COMIDA_FLEXIBLE}_0`]: { foodLabel: 'Pan', done: true } };
    const { meals } = aPorComidas(flex, estados, []);
    expect(meals).toHaveLength(1);
    expect(meals[0].items.map(i => i.foodLabel)).toEqual(['Pan']);
  });
});

describe('filasEnOrdenCronologico', () => {
  it('ordena por hora, y deja sin hora al final en su orden relativo', () => {
    const items: DietItem[] = [
      item({ foodLabel: 'Cena', hora: '21:00' }),
      item({ foodLabel: 'Sin hora 1' }),
      item({ foodLabel: 'Desayuno', hora: '08:00' }),
      item({ foodLabel: 'Sin hora 2' }),
      item({ foodLabel: 'Comida', hora: '13:30' }),
    ];
    const filas = filasEnOrdenCronologico(items);
    const nombres = filas.map(f => (f.tipo === 'alimento' ? f.item.foodLabel : f.nombre));
    expect(nombres).toEqual(['Desayuno', 'Comida', 'Cena', 'Sin hora 1', 'Sin hora 2']);
  });

  it('agrupa una receta y la ordena por la hora de su primer ítem', () => {
    const items: DietItem[] = [
      item({ foodLabel: 'Suelto', hora: '09:00' }),
      item({ foodLabel: 'Receta', category: 'PROT', originRecipeId: 'r1', hora: '07:00' }),
      item({ foodLabel: 'Receta', category: 'HC', originRecipeId: 'r1' }),
    ];
    const filas = filasEnOrdenCronologico(items);
    expect(filas[0].tipo).toBe('receta');
    expect(filas[1].tipo).toBe('alimento');
  });
});

describe('itemTieneHora', () => {
  it('distingue un item con hora puesta de uno sin ella', () => {
    expect(itemTieneHora(item({ foodLabel: 'x', hora: '10:00' }))).toBe(true);
    expect(itemTieneHora(item({ foodLabel: 'x' }))).toBe(false);
    expect(itemTieneHora(item({ foodLabel: 'x', hora: '' }))).toBe(false);
  });
});

describe('horaActualHHMM', () => {
  it('da el formato HH:mm de la fecha pasada', () => {
    expect(horaActualHHMM(new Date(2026, 0, 1, 7, 5))).toBe('07:05');
    expect(horaActualHHMM(new Date(2026, 0, 1, 23, 59))).toBe('23:59');
  });
});
