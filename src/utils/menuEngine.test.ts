import { describe, expect, it } from 'vitest';
import { Recipe, Diet, MenuDay, BudgetVec } from '../types';
import {
  bestScaleFit, rankCandidates, generateDay, generateWeek,
  isDayWithinTolerance, findSwapAlternatives, GeneratorPrefs,
} from './menuEngine';

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'r1', ownerId: 'indya', name: 'Receta', categories: [], ingredients: [], extras: [], steps: [],
    ...overrides,
  };
}

function diet(overrides: Partial<Diet>): Diet {
  return {
    id: 'd1', athleteId: 'a@x.com', name: 'Día Alto',
    budget: { HC: 4, PROT: 4, GRASA: 2, MIX_HC: 0, MIX_GRASA: 0 },
    meals: [],
    ...overrides,
  };
}

const basePrefs: GeneratorPrefs = { allergies: [], disliked: [], liked: [], variety: 3 };

describe('bestScaleFit', () => {
  it('discards a recipe whose ideal scale falls outside 0.5x-2x', () => {
    const r = recipe({ exchanges: { HC: 1, PROT: 1, GRASA: 0 } }); // total 2
    const target: BudgetVec = { HC: 10, PROT: 10, GRASA: 0 };      // total 20 → idealScale 10
    expect(bestScaleFit(r, target)).toBeNull();
  });

  it('picks the scale that exactly matches the target when one exists', () => {
    const r = recipe({ exchanges: { HC: 2, PROT: 2, GRASA: 1 } });
    const target: BudgetVec = { HC: 2, PROT: 2, GRASA: 1 };
    const fit = bestScaleFit(r, target);
    expect(fit).toMatchObject({ scale: 1, score: 0 });
  });
});

describe('rankCandidates', () => {
  it('never returns a recipe matching an allergy, even when it fits well', () => {
    const safe = recipe({ id: 'safe', exchanges: { HC: 2, PROT: 2, GRASA: 1 }, ingredientsText: [{ name: 'Pollo', quantity: 100 }] });
    const allergen = recipe({ id: 'allergen', exchanges: { HC: 2, PROT: 2, GRASA: 1 }, ingredientsText: [{ name: 'Cacahuete', quantity: 20 }] });
    const target: BudgetVec = { HC: 2, PROT: 2, GRASA: 1 };
    const prefs: GeneratorPrefs = { ...basePrefs, allergies: ['cacahuete'] };

    const ranked = rankCandidates([safe, allergen], target, prefs, new Set());

    expect(ranked.map(c => c.recipe.id)).toEqual(['safe']);
  });

  it('excludes recipes with meat/fish/animal ingredients for a vegan athlete', () => {
    const veganOk = recipe({ id: 'v1', exchanges: { HC: 2, PROT: 2, GRASA: 1 }, ingredientsText: [{ name: 'Lentejas', quantity: 100 }] });
    const notVegan = recipe({ id: 'v2', exchanges: { HC: 2, PROT: 2, GRASA: 1 }, ingredientsText: [{ name: 'Pechuga de pollo', quantity: 150 }] });
    const target: BudgetVec = { HC: 2, PROT: 2, GRASA: 1 };
    const prefs: GeneratorPrefs = { ...basePrefs, dietType: 'vegano' };

    const ranked = rankCandidates([veganOk, notVegan], target, prefs, new Set());

    expect(ranked.map(c => c.recipe.id)).toEqual(['v1']);
  });
});

describe('generateDay', () => {
  it('produces a day within ±1 global exchange tolerance', () => {
    // Recipes crafted to exactly equal each slot's rounded target, so the
    // fit is deterministic (scale=1, score=0) regardless of ranking noise.
    const pools = {
      1: [recipe({ id: 'b1', name: 'Desayuno', exchanges: { HC: 2, PROT: 1.75, GRASA: 0.75 } })],
      3: [recipe({ id: 'l1', name: 'Comida', exchanges: { HC: 3.5, PROT: 3.25, GRASA: 1.25 } })],
      5: [recipe({ id: 'd1', name: 'Cena', exchanges: { HC: 2.5, PROT: 2, GRASA: 1 } })],
    };
    const d = diet({ budget: { HC: 8, PROT: 7, GRASA: 3, MIX_HC: 0, MIX_GRASA: 0 } });
    const slots = [
      { slot: 1, name: 'Desayuno', pct: 25 },
      { slot: 3, name: 'Comida', pct: 45 },
      { slot: 5, name: 'Cena', pct: 30 },
    ];

    const day = generateDay({ day: 'mon', diet: d, slots, pools, foods: [], prefs: basePrefs, usedIds: new Set() });

    expect(day.meals).toHaveLength(3);
    expect(isDayWithinTolerance(day)).toBe(true);
  });

  it('returns an empty, tolerance-passing day when no diet is scheduled', () => {
    const day = generateDay({ day: 'sun', diet: null, slots: [], pools: {}, foods: [], prefs: basePrefs, usedIds: new Set() });
    expect(day.meals).toHaveLength(0);
    expect(day.dietId).toBeNull();
    expect(isDayWithinTolerance(day)).toBe(true);
  });
});

describe('generateWeek variety', () => {
  const pools = {
    1: [
      recipe({ id: 'r1', exchanges: { HC: 4, PROT: 4, GRASA: 2 } }),
      recipe({ id: 'r2', exchanges: { HC: 4, PROT: 4, GRASA: 2 } }),
    ],
  };
  const slots = [{ slot: 1, name: 'Única', pct: 100 }];
  const dietA = diet({ id: 'dA' });
  const schedule = { mon: 'dA', tue: 'dA' } as const;

  it('clones the same recipe across days of the same diet type when variety<=2', () => {
    const days = generateWeek({ schedule, diets: [dietA], slots, pools, foods: [], prefs: { ...basePrefs, variety: 1 } });
    const mon = days.find(d => d.day === 'mon')!;
    const tue = days.find(d => d.day === 'tue')!;
    expect(mon.meals[0].recipeId).toBe(tue.meals[0].recipeId);
  });

  it('avoids repeating a recipe across the week when variety>=4 and an alternative exists', () => {
    const days = generateWeek({ schedule, diets: [dietA], slots, pools, foods: [], prefs: { ...basePrefs, variety: 5 } });
    const mon = days.find(d => d.day === 'mon')!;
    const tue = days.find(d => d.day === 'tue')!;
    expect(mon.meals[0].recipeId).not.toBe(tue.meals[0].recipeId);
  });
});

describe('findSwapAlternatives', () => {
  it('offers a close alternative and rejects one whose required scale is out of range', () => {
    const target: BudgetVec = { HC: 2, PROT: 1.75, GRASA: 0.75 };
    const day: MenuDay = {
      day: 'mon', dietId: 'd1', target,
      meals: [{ id: 'mon_m1', slot: 1, name: 'Desayuno', recipeId: 'b1', recipeName: 'Desayuno', scale: 1, exch: target, kcal: 100, complements: [] }],
    };
    const goodAlt = recipe({ id: 'alt-good', exchanges: { HC: 2, PROT: 1.75, GRASA: 0.75 } });
    const wildAlt = recipe({ id: 'alt-wild', exchanges: { HC: 10, PROT: 10, GRASA: 5 } });

    const alts = findSwapAlternatives(day, 'mon_m1', [goodAlt, wildAlt], basePrefs);

    expect(alts.map(a => a.recipe.id)).toEqual(['alt-good']);
  });

  it('returns nothing for an unknown mealId', () => {
    const day: MenuDay = { day: 'mon', dietId: 'd1', target: { HC: 1, PROT: 1, GRASA: 1 }, meals: [] };
    expect(findSwapAlternatives(day, 'missing', [recipe({})], basePrefs)).toEqual([]);
  });
});
