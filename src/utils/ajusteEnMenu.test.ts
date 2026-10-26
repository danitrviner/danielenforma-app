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
  // Dani, 26-10-2026: primero la ración entera a la escala que toca y, dentro
  // de ella, solo los alimentos que hacen falta (aquí el arroz sube y el pollo
  // baja un poco) para clavar los macros.
  it('escala la receta y ajusta sus alimentos para clavar los macros', () => {
    const fit = bestScaleFit(receta(), mx({ HC: 4, PROT: 2, GRASA: 0 }));
    expect(fit?.scale).toBe(1.25);
    expect(fit?.ajuste?.gramos.find(g => g.n === 0)!.gramos).toBe(130);
    expect(fit?.ajuste?.cambios[0]).toMatchObject({ nombre: 'Arroz', antes: 113, despues: 130, motivo: 'faltaban hidratos' });
    expect(Math.abs(fit!.macros.hc - 100)).toBeLessThanOrEqual(5);
  });

  it('si ni moviendo sus alimentos encaja, se escala entera como cualquier receta', () => {
    const fit = bestScaleFit(receta(), mx({ HC: 12, PROT: 2, GRASA: 0 }));
    expect(fit).not.toBeNull();
    expect(fit?.ajuste).toBeUndefined();
  });

  it('sin vínculo sigue escalando como siempre', () => {
    const fit = bestScaleFit({ ...receta(), vinculo: undefined }, mx({ HC: 6, PROT: 4, GRASA: 0 }));
    expect(fit?.scale).toBe(2);
    expect(fit?.ajuste).toBeUndefined();
  });
});
