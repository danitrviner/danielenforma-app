import { describe, expect, it } from 'vitest';
import { Recipe, Diet, MenuDay, BudgetVec, WeeklyMenu } from '../types';
import {
  bestScaleFit, rankCandidates, generateDay, generateWeek,
  isDayWithinTolerance, findSwapAlternatives, GeneratorPrefs,
  buildBatchPlan, isMenuStale,
} from './menuEngine';
import { buildShoppingList } from './menuShoppingList';
import { computeMenuAdherenceRate } from './nutritionAnalysis';

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

describe('generateWeek batch cooking', () => {
  const pools = {
    1: [
      recipe({ id: 'b1', name: 'Desayuno A', exchanges: { HC: 4, PROT: 4, GRASA: 2 } }),
      recipe({ id: 'b2', name: 'Desayuno B', exchanges: { HC: 4, PROT: 4, GRASA: 2 } }),
    ],
  };
  const slots = [{ slot: 1, name: 'Desayuno', pct: 100 }];
  const dietAlto = diet({ id: 'dAlto', name: 'Día Alto', budget: { HC: 4, PROT: 4, GRASA: 2, MIX_HC: 0, MIX_GRASA: 0 } });
  const dietBajo = diet({ id: 'dBajo', name: 'Día Bajo', budget: { HC: 2, PROT: 4, GRASA: 1, MIX_HC: 0, MIX_GRASA: 0 } });
  const schedule = { mon: 'dAlto', tue: 'dBajo', wed: 'dAlto' } as const;

  it('uses a single recipe for the slot across all days, re-scaled per day', () => {
    const days = generateWeek({ schedule, diets: [dietAlto, dietBajo], slots, pools, foods: [], prefs: { ...basePrefs, variety: 5 }, batch: true });
    const withMeals = days.filter(d => d.meals.length > 0);
    const recipeIds = new Set(withMeals.map(d => d.meals[0].recipeId));
    expect(recipeIds.size).toBe(1); // same recipe every day despite different diets
    // Different budgets → different scales (high day scaled up vs low day).
    const mon = days.find(d => d.day === 'mon')!;
    const tue = days.find(d => d.day === 'tue')!;
    expect(mon.meals[0].scale).not.toBe(tue.meals[0].scale);
  });
});

describe('buildBatchPlan', () => {
  it('aggregates repeated recipes across the week into servings to cook', () => {
    const meal = (id: string, recipeId: string, name: string, scale: number) =>
      ({ id, slot: 1, name: 'Comida', recipeId, recipeName: name, scale, exch: { HC: 1, PROT: 1, GRASA: 1 }, kcal: 100, complements: [] });
    const days: MenuDay[] = [
      { day: 'mon', dietId: 'd', target: { HC: 1, PROT: 1, GRASA: 1 }, meals: [meal('mon_m1', 'r1', 'Pollo', 1.25)] },
      { day: 'tue', dietId: 'd', target: { HC: 1, PROT: 1, GRASA: 1 }, meals: [meal('tue_m1', 'r1', 'Pollo', 1)] },
      { day: 'wed', dietId: 'd', target: { HC: 1, PROT: 1, GRASA: 1 }, meals: [meal('wed_m1', 'r2', 'Merluza', 1)] },
    ];
    const plan = buildBatchPlan(days);
    expect(plan[0]).toMatchObject({ recipeId: 'r1', totalScale: 2.25, servings: 2, });
    expect(plan[0].occurrences).toHaveLength(2);
    expect(plan.map(p => p.recipeId)).toEqual(['r1', 'r2']); // sorted by total volume desc
  });
});

describe('isMenuStale', () => {
  const menu: WeeklyMenu = {
    id: 'm1', athleteId: 'a@x.com', status: 'published', name: 'Menú', createdAt: '', varietyLevel: 3, swapHistory: [],
    days: [{ day: 'mon', dietId: 'd1', target: { HC: 4, PROT: 4, GRASA: 2 }, meals: [] }],
  };

  it('is not stale when schedule and budget still match', () => {
    expect(isMenuStale(menu, { mon: 'd1' }, [diet({ id: 'd1' })])).toBe(false);
  });
  it('is stale when the scheduled diet changed', () => {
    expect(isMenuStale(menu, { mon: 'd2' }, [diet({ id: 'd2' })])).toBe(true);
  });
  it('is stale when the linked diet budget changed', () => {
    expect(isMenuStale(menu, { mon: 'd1' }, [diet({ id: 'd1', budget: { HC: 6, PROT: 4, GRASA: 2, MIX_HC: 0, MIX_GRASA: 0 } })])).toBe(true);
  });
});

describe('buildShoppingList', () => {
  it('sums Indya gram ingredients across the week scaled per meal', () => {
    const pollo = recipe({ id: 'r1', name: 'Pollo con arroz', ingredientsText: [{ name: 'Pollo', quantity: 100 }, { name: 'Arroz', quantity: 50 }] });
    const meal = (scale: number) => ({ id: 'm', slot: 3, name: 'Comida', recipeId: 'r1', recipeName: 'Pollo con arroz', scale, exch: { HC: 1, PROT: 1, GRASA: 0 }, kcal: 100, complements: [] });
    const days: MenuDay[] = [
      { day: 'mon', dietId: 'd', target: { HC: 1, PROT: 1, GRASA: 0 }, meals: [meal(1)] },
      { day: 'tue', dietId: 'd', target: { HC: 1, PROT: 1, GRASA: 0 }, meals: [meal(2)] },
    ];
    const list = buildShoppingList(days, new Map([['r1', pollo]]));
    const pollos = list.find(i => i.name === 'Pollo');
    expect(pollos?.grams).toBe(300); // 100*1 + 100*2
    expect(list.find(i => i.name === 'Arroz')?.grams).toBe(150);
  });

  it('recovers grams from a complement portion label', () => {
    const days: MenuDay[] = [
      { day: 'mon', dietId: 'd', target: { HC: 1, PROT: 0, GRASA: 0 }, meals: [
        { id: 'm', slot: 1, name: 'Desayuno', recipeId: '', recipeName: '', scale: 1, exch: { HC: 0, PROT: 0, GRASA: 0 }, kcal: 0,
          complements: [{ foodLabel: '100g plátano (uno pequeño)', category: 'HC', quantity: 2 }] },
      ] },
    ];
    const list = buildShoppingList(days, new Map());
    expect(list[0]).toMatchObject({ grams: 200 }); // 100g × 2
  });
});

describe('computeMenuAdherenceRate', () => {
  const menu: WeeklyMenu = {
    id: 'm1', athleteId: 'a@x.com', status: 'published', name: 'Menú', createdAt: '', varietyLevel: 3, swapHistory: [],
    days: [{ day: 'mon', dietId: 'd', target: { HC: 1, PROT: 1, GRASA: 1 },
      meals: [
        { id: 'mon_m1', slot: 1, name: 'D', recipeId: 'r', recipeName: 'r', scale: 1, exch: { HC: 1, PROT: 0, GRASA: 0 }, kcal: 0, complements: [] },
        { id: 'mon_m2', slot: 3, name: 'C', recipeId: 'r', recipeName: 'r', scale: 1, exch: { HC: 1, PROT: 0, GRASA: 0 }, kcal: 0, complements: [] },
      ] }],
  };
  // A Monday date so the log maps to the menu's Monday (2 meals).
  const monday = '2026-07-13';

  it('averages the % of a day\'s menu meals ticked off', () => {
    const rate = computeMenuAdherenceRate(
      [{ id: 'x', athleteId: 'a@x.com', date: monday, menuId: 'm1', doneMealKeys: ['mon_m1'] }],
      menu, { windowDays: 3650, adherenceOkPct: 80, macroDeviationOkPct: 15 },
    );
    expect(rate.avgPct).toBe(50); // 1 of 2 meals
    expect(rate.daysLogged).toBe(1);
  });

  it('returns zero when there is no published menu', () => {
    expect(computeMenuAdherenceRate([], null).avgPct).toBe(0);
  });
});
