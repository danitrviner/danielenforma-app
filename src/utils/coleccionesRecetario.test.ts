import { describe, it, expect } from 'vitest';
import type { DietCompletionLog, Recipe } from '../types';
import {
  coleccionPorId, resumirColecciones, recetasDeColeccion, recetasConLoQueTienes, recetasMasHechas, encajaEnCupo,
  FILAS_DESCUBRIR, cupoDeLaProximaComida,
} from './coleccionesRecetario';

const receta = (id: string, name: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, name, ownerId: 'recetas', categories: [], ingredients: [], extras: [], steps: [],
  exchanges: { HC: 1, PROT: 1, GRASA: 1 },
  ...extra,
} as Recipe);

const ing = (...nombres: string[]) => nombres.map(name => ({ name })) as unknown as Recipe['ingredientsText'];

describe('colecciones', () => {
  it('cada id de colección es único en su fila', () => {
    for (const fila of FILAS_DESCUBRIR) {
      const ids = fila.colecciones.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('«Ideas con pollo» mira también los ingredientes, no solo el nombre', () => {
    const pool = [
      receta('a', 'Ensalada César', { ingredientsText: ing('Lechuga', 'Pechuga de pollo') }),
      receta('b', 'Pollo al curry'),
      receta('c', 'Ensalada de tomate', { ingredientsText: ing('Tomate') }),
    ];
    expect(recetasDeColeccion(coleccionPorId('con_pollo')!, pool).map(r => r.id)).toEqual(['a', 'b']);
  });

  it('las cocinas del mundo se reconocen por el nombre, no por un ingrediente suelto', () => {
    const pool = [
      receta('a', 'Lentejas estofadas', { ingredientsText: ing('Lentejas', 'Salsa de soja', 'Curry') }),
      receta('b', 'Curry de garbanzos'),
    ];
    expect(recetasDeColeccion(coleccionPorId('mundo_asia')!, pool).map(r => r.id)).toEqual(['b']);
  });

  it('las calorías salen de los intercambios cuando la receta no trae kcal', () => {
    // 2 HC (200) + 1 PROT (100) + 1 GRASA (99) = 399
    const r = receta('a', 'Arroz con pollo', { exchanges: { HC: 2, PROT: 1, GRASA: 1 } });
    expect(recetasDeColeccion(coleccionPorId('kcal_300')!, [r])).toHaveLength(1);
    expect(recetasDeColeccion(coleccionPorId('kcal_400')!, [r])).toHaveLength(0);
  });

  it('«En 10 minutos» usa los minutos calibrados del índice (4 = 10 min)', () => {
    const pool = [receta('a', 'Bocadillo', { cookingTime: 4 }), receta('b', 'Guiso', { cookingTime: 1 }), receta('c', 'Sin dato')];
    expect(recetasDeColeccion(coleccionPorId('rapidas')!, pool).map(r => r.id)).toEqual(['a']);
  });

  it('resumir en una pasada da lo mismo que filtrar colección a colección', () => {
    const pool = [
      receta('a', 'Tortitas de avena', { intakeTypes: [1], cookingTime: 4, ingredientsText: ing('Avena', 'Huevo') }),
      receta('b', 'Salmón al horno', { intakeTypes: [3, 5], tupper: true, exchanges: { HC: 0, PROT: 2, GRASA: 1 } }),
      receta('c', 'Brownie de cacao', { intakeTypes: [4] }),
    ];
    const resumen = resumirColecciones(pool, r => r.id !== 'c');
    for (const id of ['desayuno', 'cena', 'tupper', 'con_avena', 'con_huevo', 'al_horno', 'caprichos', 'proteina', 'baja_hc']) {
      expect(resumen.get(id)!.total).toBe(recetasDeColeccion(coleccionPorId(id)!, pool).length);
    }
    // El brownie cuenta en «Caprichos» pero no puede ser portada: no tiene foto.
    expect(resumen.get('caprichos')).toEqual({ total: 1, portadas: [] });
    expect(resumen.get('cena')!.portadas.map(r => r.id)).toEqual(['b']);
  });
});

describe('recetasConLoQueTienes', () => {
  it('pide TODO lo marcado y pone antes las que menos ingredientes añaden', () => {
    const pool = [
      receta('paella', 'Paella', { ingredientsText: ing('Arroz', 'Pollo', 'Gambas', 'Pimiento', 'Guisantes', 'Azafrán') }),
      receta('simple', 'Arroz con pollo', { ingredientsText: ing('Arroz', 'Pollo', 'Aceite') }),
      receta('solo', 'Arroz blanco', { ingredientsText: ing('Arroz') }),
    ];
    expect(recetasConLoQueTienes(pool, ['arroz', 'pollo']).map(r => r.id)).toEqual(['simple', 'paella']);
  });

  it('«pan» no pilla empanadas ni panceta', () => {
    const pool = [
      receta('a', 'Empanada gallega', { ingredientsText: ing('Masa', 'Atún') }),
      receta('b', 'Huevos con panceta', { ingredientsText: ing('Huevo', 'Panceta') }),
      receta('c', 'Tostada', { ingredientsText: ing('Pan integral', 'Tomate') }),
    ];
    expect(recetasConLoQueTienes(pool, ['pan']).map(r => r.id)).toEqual(['c']);
  });

  it('sin nada marcado no devuelve nada', () => {
    expect(recetasConLoQueTienes([receta('a', 'X')], [])).toEqual([]);
  });
});

describe('recetasMasHechas', () => {
  const dia = (date: string, items: { receta?: string; hecho: boolean }[]): DietCompletionLog => ({
    id: `x_${date}`, athleteId: 'x', date, dietId: 'd',
    meals: [{ id: 'm1', name: 'Comida', items: items.map(i => ({ foodLabel: 'a', category: 'HC', quantity: 1, originRecipeId: i.receta })) }],
    doneItemIds: items.map((i, idx) => i.hecho ? `m1_${idx}` : null).filter((x): x is string => !!x),
  } as DietCompletionLog);

  it('cuenta días, no alimentos, y solo lo comido', () => {
    const logs = [
      dia('2026-10-01', [{ receta: 'avena', hecho: true }, { receta: 'avena', hecho: true }]),
      dia('2026-10-02', [{ receta: 'avena', hecho: true }, { receta: 'pollo', hecho: false }]),
      dia('2026-10-03', [{ receta: 'pollo', hecho: true }]),
      dia('2026-10-04', [{ receta: 'pollo', hecho: true }, { hecho: true }]),
      dia('2026-10-05', [{ receta: 'pollo', hecho: true }]),
    ];
    expect(recetasMasHechas(logs)).toEqual([{ recipeId: 'pollo', dias: 3 }, { recipeId: 'avena', dias: 2 }]);
  });

  it('una sola vez no es «lo que más haces»', () => {
    expect(recetasMasHechas([dia('2026-10-01', [{ receta: 'avena', hecho: true }])])).toEqual([]);
  });

  it('salta los días viejos sin `meals`', () => {
    const viejo = { id: 'v', athleteId: 'x', date: '2026-08-01', dietId: 'd', doneItemIds: ['m1_0'] } as DietCompletionLog;
    expect(recetasMasHechas([viejo, viejo])).toEqual([]);
  });
});

describe('encajaEnCupo', () => {
  // 2 HC · 1,5 P · 1 G de antes = 50 g HC · 37,5 g P · 11 g G
  const r = receta('a', 'X', { macros: { carb: 50, prot: 37.5, fat: 11 } });
  it('medio intercambio de cada macro arriba o abajo (12,5 g / 5,5 g)', () => {
    expect(encajaEnCupo(r, { kcal: 449, p: 37.5, hc: 50, g: 11 })).toBe(true);
    expect(encajaEnCupo(r, { kcal: 449, p: 25, hc: 62.5, g: 5.5 })).toBe(true);
    expect(encajaEnCupo(r, { kcal: 549, p: 37.5, hc: 75, g: 11 })).toBe(false);
  });
  it('un hueco vacío no lo llena nada', () => {
    expect(encajaEnCupo(r, { kcal: 0, p: 0, hc: 0, g: 0 })).toBe(false);
  });
});

describe('cupoDeLaProximaComida', () => {
  const porSlot = (ms: { slot?: number }[]) => ms.map(m => m.slot ?? 3);
  const meals = [
    { name: 'Desayuno', slot: 1 },
    { name: 'Comida', slot: 3 },
    { name: 'Cena', slot: 5 },
  ];
  const dia = { kcal: 2400, p: 150, hc: 270, g: 78 };
  it('a media mañana toca la comida, con el día a partes iguales', () => {
    expect(cupoDeLaProximaComida(meals, dia, porSlot, 11)).toEqual({ titulo: 'Encajan en tu comida', cupo: { kcal: 800, p: 50, hc: 90, g: 26 } });
  });
  it('se salta las comidas libres', () => {
    const otras = [{ name: 'Comida', slot: 3, libre: true }, meals[2]];
    expect(cupoDeLaProximaComida(otras, dia, porSlot, 13)?.titulo).toBe('Encajan en tu cena');
  });
  it('sin dieta o sin objetivo no hay fila', () => {
    expect(cupoDeLaProximaComida(undefined, dia, porSlot, 9)).toBeNull();
    expect(cupoDeLaProximaComida(meals, null, porSlot, 9)).toBeNull();
  });
});
