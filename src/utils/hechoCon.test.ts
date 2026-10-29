import { describe, it, expect } from 'vitest';
import { etiquetasHechoCon, MAX_ETIQUETAS } from './hechoCon';

describe('etiquetasHechoCon', () => {
  it('nada que decir sin datos', () => {
    expect(etiquetasHechoCon({})).toEqual([]);
  });
  it('restricciones primero, luego dieta, como mucho tres', () => {
    const t = etiquetasHechoCon({
      onboarding: { dietType: 'vegetariano', healthConditions: [66], allergies: [], batchCookingPreferred: true },
      config: { preferredDishTypes: ['ensalada'], batchCookingPreferred: true },
      favoritos: { recipeIds: ['a', 'b'], dislikedIds: ['c'] },
    });
    expect(t.length).toBe(MAX_ETIQUETAS);
    expect(t[0]).toMatch(/^sin /);
    expect(t[1]).toBe('vegetariano');
  });
  it('favoritas y lo que no gusta cuando no hay más', () => {
    expect(etiquetasHechoCon({ favoritos: { recipeIds: ['a'], dislikedIds: ['b', 'c'] } })).toEqual(['tus 1 favorita', 'sin lo que no te gusta (2)']);
  });
});
