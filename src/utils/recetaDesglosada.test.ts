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

  // Dani, 26-10-2026: «esta receta debería mostrar los alimentos dentro de la
  // misma comida». Entraba como un solo renglón porque la leche y los copos no
  // emparejaban con el catálogo.
  describe('si algo no empareja seguro, se desglosa igual y suma lo de la receta', () => {
    const leche: Recipe = {
      ...base, name: 'Leche entera con copos de maíz, plátano y nueces',
      kcal: 869, macros: { carb: 126, prot: 17, fat: 33 },
      ingredientsText: [
        { name: 'Copos de maíz sin azucares añadidos', quantity: 80 },
        { name: 'Plátano', quantity: 125 },
        { name: 'Nueces', quantity: 30 },
        { name: 'Leche entera', quantity: 350 },
      ],
    };
    const total = (items: ReturnType<typeof recetaDesglosada>['items']) => items.reduce((s, i) => ({
      p: s.p + (i.nutrientes?.p ?? 0), hc: s.hc + (i.nutrientes?.hc ?? 0), g: s.g + (i.nutrientes?.g ?? 0),
    }), { p: 0, hc: 0, g: 0 });

    it('cada alimento en su línea, con sus gramos', () => {
      const d = recetaDesglosada(leche, { nuevoLineaId, catalogo: [] });
      expect(d.desglosada).toBe(true);
      expect(d.items.filter(i => i.nutrientes).map(i => [i.foodLabel, i.gramos])).toEqual([
        ['Copos de maíz sin azucares añadidos', 80], ['Plátano', 125], ['Nueces', 30], ['Leche entera', 350],
      ]);
      expect(d.items.every(i => i.receta?.nombre === leche.name)).toBe(true);
    });

    it('entre todos suman los macros de la receta', () => {
      const t = total(recetaDesglosada(leche, { nuevoLineaId, catalogo: [] }).items);
      expect(t.hc).toBeCloseTo(126, 0);
      expect(t.p).toBeCloseTo(17, 0);
      expect(t.g).toBeCloseTo(33, 0);
    });

    it('lo que empareja seguro lleva su valor y el resto se lleva lo que falta', () => {
      const catalogo = [cat('platano', 'Plátano', { kcal: 90, p: 1, hc: 20, g: 0.3 })];
      const d = recetaDesglosada(leche, { nuevoLineaId, catalogo });
      const platano = d.items.find(i => i.foodLabel === 'Plátano' && i.nutrientes)!;
      expect(platano.nutrientes).toMatchObject({ hc: 25 });
      expect(total(d.items).hc).toBeCloseTo(126, 0);
    });

    it('a escala, todo escala', () => {
      const d = recetaDesglosada(leche, { nuevoLineaId, catalogo: [], factor: 0.5 });
      expect(d.items.find(i => i.foodLabel === 'Leche entera' && i.nutrientes)?.gramos).toBe(175);
      expect(total(d.items).hc).toBeCloseTo(63, 0);
    });
  });

  it('sin macros de la receta y sin emparejar, va como plato entero', () => {
    const r: Recipe = { ...base, exchanges: { HC: 2, PROT: 1, GRASA: 1 }, ingredientsText: [{ name: 'Arroz blanco', quantity: 80 }, { name: 'Salsa secreta del chef', quantity: 30 }] };
    const catalogo = [cat('arroz', 'Arroz blanco', { kcal: 350, p: 7, hc: 78, g: 1 })];
    const d = recetaDesglosada({ ...r, exchanges: undefined }, { nuevoLineaId, catalogo });
    expect(d.desglosada).toBe(false);
  });

  it('sabe cuándo hay que bajar la receta completa', () => {
    expect(faltanCantidades({ ...base, ingredientsText: [{ name: 'Arroz', quantity: NaN }] })).toBe(true);
    expect(faltanCantidades({ ...base, ingredientsText: [{ name: 'Arroz', quantity: 80 }] })).toBe(false);
  });
});
