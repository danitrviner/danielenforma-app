import { describe, it, expect } from 'vitest';
import type { Recipe } from '../types';
import { bestScaleFit } from './menuEngine';
import { macrosDeIntercambios } from './macrosLegado';
import type { Macros } from '../types';
/** Casos escritos en intercambios, pasados a kcal y gramos. */
const mx = (v: { HC?: number; PROT?: number; GRASA?: number }): Macros => macrosDeIntercambios(v);


const receta = (): Recipe => ({
  id: 'base', name: 'Arroz con pollo', ownerId: 'recetas', categories: [], ingredients: [], extras: [], steps: [],
  ingredientsText: [{ name: 'Arroz', quantity: 90 }, { name: 'Pollo', quantity: 150 }],
  exchanges: { HC: 3, PROT: 2, GRASA: 0 },
  vinculo: {
    calculadoEn: 't',
    ingredientes: [
      { n: 0, alimentoId: 'arroz', gramos: 90, min: 45, max: 180, palanca: 'hc', porCien: { kcal: 354, p: 7, hc: 78, g: 0.9 } },
      { n: 1, alimentoId: 'pollo', gramos: 150, min: 75, max: 300, palanca: 'proteina', porCien: { kcal: 110, p: 23, hc: 0, g: 1.5 } },
    ],
  },
});

describe('generador de menús con recetas base ajustables (N-06)', () => {
  it('ajusta ingredientes en vez de escalar la receta entera', () => {
    const fit = bestScaleFit(receta(), mx({ HC: 4, PROT: 2, GRASA: 0 }));
    expect(fit?.scale).toBe(1);
    expect(fit?.ajuste?.gramos.find(g => g.n === 0)!.gramos).toBeGreaterThan(90);
    expect(fit?.ajuste?.cambios[0].motivo).toBe('faltaban hidratos');
    // 4 intercambios de HC = 100 g: el ajuste llega a ±5 g.
    expect(Math.abs(fit!.macros.hc - 100)).toBeLessThanOrEqual(5);
  });

  it('si no encaja dentro de sus rangos, se descarta', () => {
    expect(bestScaleFit(receta(), mx({ HC: 12, PROT: 2, GRASA: 0 }))).toBeNull();
  });

  it('sin vínculo sigue escalando como siempre', () => {
    const fit = bestScaleFit({ ...receta(), vinculo: undefined }, mx({ HC: 6, PROT: 4, GRASA: 0 }));
    expect(fit?.scale).toBe(2);
    expect(fit?.ajuste).toBeUndefined();
  });
});
