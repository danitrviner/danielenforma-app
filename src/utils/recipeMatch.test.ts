import { describe, it, expect } from 'vitest';
import { findRecipeAlternatives, recipeExchanges, groupByDishType } from './recipeMatch';
import type { Recipe, BudgetVec } from '../types';

let seq = 0;
function receta(name: string, exchanges: BudgetVec, extra: Partial<Recipe> = {}): Recipe {
  return {
    id: `r${++seq}`,
    ownerId: 'recetas',
    name,
    categories: [],
    ingredients: [],
    extras: [],
    steps: [],
    exchanges,
    ...extra,
  };
}

const TRES: BudgetVec = { HC: 1, PROT: 1, GRASA: 1 };

describe('recipeExchanges', () => {
  it('usa el campo exchanges cuando existe', () => {
    expect(recipeExchanges(receta('X', { HC: 2, PROT: 1, GRASA: 0 }))).toEqual({ HC: 2, PROT: 1, GRASA: 0 });
  });

  it('deriva de los ingredientes del constructor, repartiendo las categorías mixtas', () => {
    const r = receta('Builder', undefined as unknown as BudgetVec, {
      exchanges: undefined,
      ingredients: [
        { foodLabel: 'Arroz',  category: 'HC',      mode: 'OMNIVORO', quantity: 2 },
        { foodLabel: 'Lentejas', category: 'MIX_HC', mode: 'OMNIVORO', quantity: 2 }, // ½HC + ½PROT
      ],
    });
    // 2 HC + (2 × 0,5) HC = 3 HC ; (2 × 0,5) PROT = 1 PROT
    expect(recipeExchanges(r)).toEqual({ HC: 3, PROT: 1, GRASA: 0 });
  });

  it('deriva de los gramos si no hay ni exchanges ni ingredientes', () => {
    const r = receta('Solo macros', undefined as unknown as BudgetVec, {
      exchanges: undefined,
      macros: { carb: 50, prot: 25, fat: 11 },
    });
    const out = recipeExchanges(r);
    expect(out.HC + out.PROT + out.GRASA).toBeGreaterThan(0);
  });

  it('devuelve ceros si la receta no tiene ningún dato nutricional', () => {
    const r = receta('Vacía', undefined as unknown as BudgetVec, { exchanges: undefined });
    expect(recipeExchanges(r)).toEqual({ HC: 0, PROT: 0, GRASA: 0 });
  });
});

describe('findRecipeAlternatives — seguridad', () => {
  it('NUNCA ofrece una receta con un ingrediente al que el atleta es alérgico', () => {
    const source = receta('Tortilla', TRES);
    const pool = [
      receta('Tarta de nueces', TRES, { ingredientsText: [{ name: 'Nueces', quantity: 30 }] }),
      receta('Arroz con pollo', TRES, { ingredientsText: [{ name: 'Arroz', quantity: 60 }] }),
    ];
    const out = findRecipeAlternatives(source, pool, { prefs: { allergies: ['nueces'] } });
    expect(out.map(a => a.recipe.name)).toEqual(['Arroz con pollo']);
  });

  it('la alergia gana aunque la receta sea favorita del atleta', () => {
    const source = receta('Tortilla', TRES);
    const peligrosa = receta('Tarta de nueces', TRES, { ingredientsText: [{ name: 'Nueces', quantity: 30 }] });
    const out = findRecipeAlternatives(source, [peligrosa], {
      prefs: { allergies: ['nueces'], favoriteRecipeIds: [peligrosa.id] },
    });
    expect(out).toHaveLength(0);
  });

  it('respeta la alergia sin distinguir mayúsculas ni acentos', () => {
    const source = receta('Tortilla', TRES);
    const pool = [receta('Crema', TRES, { ingredientsText: [{ name: 'Melocotón en almíbar', quantity: 30 }] })];
    expect(findRecipeAlternatives(source, pool, { prefs: { allergies: ['MELOCOTON'] } })).toHaveLength(0);
  });

  it('excluye carne y pescado si el atleta es vegetariano', () => {
    const source = receta('Ensalada', TRES);
    const pool = [
      receta('Pasta con atún', TRES, { ingredientsText: [{ name: 'Atun', quantity: 60 }] }),
      receta('Pasta con tomate', TRES, { ingredientsText: [{ name: 'Tomate', quantity: 60 }] }),
    ];
    const out = findRecipeAlternatives(source, pool, { prefs: { dietType: 'vegetariano' } });
    expect(out.map(a => a.recipe.name)).toEqual(['Pasta con tomate']);
  });

  it('excluye las recetas marcadas "no me gusta"', () => {
    const source = receta('Tortilla', TRES);
    const odiada = receta('Brócoli al vapor', TRES);
    const out = findRecipeAlternatives(source, [odiada], { prefs: { dislikedRecipeIds: [odiada.id] } });
    expect(out).toHaveLength(0);
  });

  it('respeta el tiempo máximo de cocina', () => {
    const source = receta('Tortilla', TRES);
    const pool = [
      receta('Estofado 90 min', TRES, { cookingTime: 90 }),
      receta('Rápida 10 min', TRES, { cookingTime: 10 }),
    ];
    const out = findRecipeAlternatives(source, pool, { prefs: { cookingMaxTime: 20 } });
    expect(out.map(a => a.recipe.name)).toEqual(['Rápida 10 min']);
  });
});

describe('findRecipeAlternatives — equivalencia de intercambios', () => {
  it('acepta recetas con el mismo total aunque el reparto sea distinto', () => {
    const source = receta('Origen', { HC: 2, PROT: 1, GRASA: 0 }); // total 3
    const otra   = receta('Reparto distinto', { HC: 1, PROT: 1, GRASA: 1 }); // total 3
    const out = findRecipeAlternatives(source, [otra]);
    expect(out).toHaveLength(1);
    expect(out[0].totalDrift).toBe(0);
  });

  it('descarta las que se pasan del margen de total', () => {
    const source = receta('Origen', TRES);              // 3
    const lejana = receta('Muy grande', { HC: 3, PROT: 2, GRASA: 1 }); // 6
    expect(findRecipeAlternatives(source, [lejana])).toHaveLength(0);
  });

  it('ordena primero las de total exacto', () => {
    const source = receta('Origen', TRES);
    const pool = [
      receta('Desviada', { HC: 1, PROT: 1, GRASA: 1.5 }),
      receta('Exacta',   { HC: 2, PROT: 1, GRASA: 0 }),
    ];
    const out = findRecipeAlternatives(source, pool, { diversify: false });
    expect(out[0].recipe.name).toBe('Exacta');
  });

  it('nunca se ofrece a sí misma', () => {
    const source = receta('Origen', TRES);
    expect(findRecipeAlternatives(source, [source])).toHaveLength(0);
  });

  it('devuelve vacío si la receta origen no tiene intercambios', () => {
    const source = receta('Vacía', { HC: 0, PROT: 0, GRASA: 0 });
    expect(findRecipeAlternatives(source, [receta('Otra', TRES)])).toHaveLength(0);
  });
});

describe('findRecipeAlternatives — variedad (el problema del batido)', () => {
  // 10 batidos y 3 platos distintos, todos igual de válidos nutricionalmente.
  const source = receta('Batido origen', TRES);
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => receta(`Batido ${i}`, TRES)),
    receta('Tostada de aguacate', TRES),
    receta('Ensalada de quinoa', TRES),
    receta('Arroz con verduras', TRES),
  ];

  it('no llena la lista de batidos: agota las otras familias antes de repetir', () => {
    const out = findRecipeAlternatives(source, pool, { limit: 6 });
    // Antes los 6 primeros eran batidos y no aparecía nada más. La garantía
    // ahora es que TODAS las familias disponibles entran antes de que el batido
    // repita: los tres platos no-batido del pool están sí o sí en la lista.
    expect(out.map(a => a.recipe.name)).toEqual(expect.arrayContaining([
      'Tostada de aguacate', 'Ensalada de quinoa', 'Arroz con verduras',
    ]));
    expect(new Set(out.map(a => a.dishType)).size).toBe(4);
  });

  it('las primeras opciones son de familias distintas', () => {
    const out = findRecipeAlternatives(source, pool, { limit: 4 });
    expect(new Set(out.slice(0, 4).map(a => a.dishType)).size).toBe(4);
  });

  it('sin diversificar sí salen todos del mismo tipo (comprobación de control)', () => {
    const out = findRecipeAlternatives(source, pool, { limit: 6, diversify: false });
    expect(out.filter(a => a.dishType === 'batido').length).toBeGreaterThan(2);
  });

  it('excluye las familias que el atleta descartó', () => {
    const out = findRecipeAlternatives(source, pool, { prefs: { excludedDishTypes: ['batido'] } });
    expect(out.every(a => a.dishType !== 'batido')).toBe(true);
    expect(out.length).toBe(3);
  });

  it('no pierde recetas al diversificar: solo cambia el orden', () => {
    const conD = findRecipeAlternatives(source, pool, { limit: 99 });
    const sinD = findRecipeAlternatives(source, pool, { limit: 99, diversify: false });
    expect(new Set(conD.map(a => a.recipe.id))).toEqual(new Set(sinD.map(a => a.recipe.id)));
  });
});

describe('findRecipeAlternatives — filtros del selector', () => {
  const source = receta('Origen', TRES);
  const pool = [
    receta('Tortilla de patata', TRES, { intakeTypes: [1], tupper: true }),
    receta('Merluza al horno', TRES, { intakeTypes: [5], tupper: false }),
  ];

  it('filtra por momento del día', () => {
    const out = findRecipeAlternatives(source, pool, { intakeType: 5 });
    expect(out.map(a => a.recipe.name)).toEqual(['Merluza al horno']);
  });

  it('filtra por apto para tupper', () => {
    const out = findRecipeAlternatives(source, pool, { onlyTupper: true });
    expect(out.map(a => a.recipe.name)).toEqual(['Tortilla de patata']);
  });

  it('busca por nombre ignorando acentos', () => {
    const out = findRecipeAlternatives(source, pool, { search: 'MERLUZA' });
    expect(out.map(a => a.recipe.name)).toEqual(['Merluza al horno']);
  });

  it('respeta el límite', () => {
    const muchas = Array.from({ length: 50 }, (_, i) => receta(`R${i}`, TRES));
    expect(findRecipeAlternatives(source, muchas, { limit: 7 })).toHaveLength(7);
  });
});

describe('groupByDishType', () => {
  it('cuenta las alternativas por familia, de mayor a menor', () => {
    const source = receta('Origen', TRES);
    const pool = [
      receta('Batido A', TRES), receta('Batido B', TRES),
      receta('Ensalada C', TRES),
    ];
    const grupos = groupByDishType(findRecipeAlternatives(source, pool, { limit: 99 }));
    expect(grupos[0]).toEqual({ type: 'batido', count: 2 });
    expect(grupos).toHaveLength(2);
  });
});
