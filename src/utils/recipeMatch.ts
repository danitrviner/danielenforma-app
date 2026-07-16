import { Recipe } from '../types';

// Generic L1 distance between a target and an actual macro/exchange vector.
// Shared by menuEngine's recipe ranking (HC/PROT/GRASA exchange fit) and the
// "Cambiar comida" recipe swap (carb/prot/fat percentage split fit) — same
// math, two different vector shapes, hence the generic Record<string, number> signature.
export function fitScore(target: Record<string, number>, actual: Record<string, number>): number {
  return Object.keys(target).reduce((sum, key) => sum + Math.abs((target[key] ?? 0) - (actual[key] ?? 0)), 0);
}

export interface SimilarRecipeOptions {
  energyTolerancePct?: number; // default 0.10 → ±10% kcal
}

// Finds recipes in `pool` that are a nutritionally similar alternative to
// `source`: within ±energyTolerancePct of its kcal, ranked by how close their
// macro *distribution* (not absolute grams) is to source's.
export function findSimilarRecipes(source: Recipe, pool: Recipe[], options: SimilarRecipeOptions = {}): Recipe[] {
  const { energyTolerancePct = 0.10 } = options;
  const sourceKcal = source.kcal ?? 0;
  if (sourceKcal <= 0) return [];

  const lo = sourceKcal * (1 - energyTolerancePct);
  const hi = sourceKcal * (1 + energyTolerancePct);
  const sourceSplit = macroSplit(source);

  return pool
    .filter(r => r.id !== source.id && typeof r.kcal === 'number' && r.kcal >= lo && r.kcal <= hi)
    .map(r => ({ recipe: r, dist: sourceSplit ? fitScore(sourceSplit, macroSplit(r) ?? {}) : 0 }))
    .sort((a, b) => a.dist - b.dist)
    .map(x => x.recipe);
}

function macroSplit(r: Recipe): Record<string, number> | null {
  const m = r.macros;
  if (!m) return null;
  const total = m.carb + m.prot + m.fat;
  if (total <= 0) return null;
  return { carb: m.carb / total, prot: m.prot / total, fat: m.fat / total };
}
