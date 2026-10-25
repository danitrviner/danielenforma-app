import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import type { AlimentoCatalogo } from './catalogoAlimentos';
import { recetaDesglosada, faltanCantidades } from './recetaDesglosada';

let n = 0;
const nuevoLineaId = () => `l${++n}`;
const base: Recipe = { id: 'r1', ownerId: 'x', name: 'Tostada con aceite', categories: [], ingredients: [], extras: [], steps: [] };
const cat = (id: string, nombre: string, porCien: AlimentoCatalogo['porCien']) =>
  ({ id, nombre, porCien, estado: 'listo', fuente: 'test' }) as unknown as AlimentoCatalogo;

describe('recetaDesglosada', () => {
  it('una receta vinculada sale ingrediente a ingrediente con kcal exactas', () => {
    const r: Recipe = {
      ...base,
      ingredientsText: [{ name: 'Pan integral', quantity: 40 }, { name: 'Sal', quantity: 1 }, { name: 'Aceite de oliva', quantity: 10 }],
      vinculo: {
        calculadoEn: '2026-10-01',
        ingredientes: [
          { n: 0, alimentoId: 'pan', gramos: 40, min: 20, max: 80, porCien: { kcal: 250, p: 9, hc: 45, g: 3 } },
          { n: 1, alimentoId: null, gramos: 1, min: 1, max: 1 },
          { n: 2, alimentoId: 'aceite', gramos: 10, min: 5, max: 20, porCien: { kcal: 900, p: 0, hc: 0, g: 100 } },
        ],
      },
    };
    const d = recetaDesglosada(r, { nuevoLineaId });
    expect(d.desglosada).toBe(true);
    const primeras = d.items.filter(i => i.nutrientes);
    expect(primeras.map(i => [i.foodLabel, i.gramos, i.nutrientes?.kcal])).toEqual([['Pan integral', 40, 100], ['Aceite de oliva', 10, 90]]);
    expect(d.items.every(i => i.receta?.nombre === 'Tostada con aceite')).toBe(true);
  });

  it('con gramos y todo emparejado con el catálogo, también se desglosa', () => {
    const r: Recipe = { ...base, ingredientsText: [{ name: 'Arroz blanco', quantity: 80 }, { name: 'Sal', quantity: 2 }] };
    const catalogo = [cat('arroz', 'Arroz blanco', { kcal: 350, p: 7, hc: 78, g: 1 })];
    const d = recetaDesglosada(r, { nuevoLineaId, catalogo });
    expect(d.desglosada).toBe(true);
    expect(d.items[0]).toMatchObject({ foodLabel: 'Arroz blanco', gramos: 80, nutrientes: { kcal: 280 } });
  });

  it('si algo no empareja seguro, va como plato entero', () => {
    const r: Recipe = { ...base, exchanges: { HC: 2, PROT: 1, GRASA: 1 }, ingredientsText: [{ name: 'Arroz blanco', quantity: 80 }, { name: 'Salsa secreta del chef', quantity: 30 }] };
    const catalogo = [cat('arroz', 'Arroz blanco', { kcal: 350, p: 7, hc: 78, g: 1 })];
    const d = recetaDesglosada(r, { nuevoLineaId, catalogo });
    expect(d.desglosada).toBe(false);
    expect(d.items.every(i => i.originRecipeId === 'r1')).toBe(true);
  });

  it('sabe cuándo hay que bajar la receta completa', () => {
    expect(faltanCantidades({ ...base, ingredientsText: [{ name: 'Arroz', quantity: NaN }] })).toBe(true);
    expect(faltanCantidades({ ...base, ingredientsText: [{ name: 'Arroz', quantity: 80 }] })).toBe(false);
  });
});
