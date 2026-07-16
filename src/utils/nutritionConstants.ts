// Single source of truth for the steps→kcal conversion rate. The coach can
// override it per athlete via AthleteNutritionConfig.kcalPerStep; this is only
// the fallback when that field is unset — never hardcode the rate elsewhere.
// 1000 pasos ≈ 46 kcal.
export const DEFAULT_KCAL_PER_STEP = 0.046;

// Grams per exchange (intercambio) and kcal/gram per macro — the single source
// of truth shared by the weekly-menu generator (menuEngine.ts), the nutrition
// analysis report and the periodization engine. With these values every exchange (HC,
// PROT or GRASA) lands at ~100 kcal, which is why the app treats "1 intercambio
// ≈ 100 kcal" as a safe mental model for coaches.
export const GRAMS_PER_EXCHANGE: Record<'HC' | 'PROT' | 'GRASA', number> = { HC: 25, PROT: 25, GRASA: 11 };
const KCAL_PER_GRAM: Record<'HC' | 'PROT' | 'GRASA', number> = { HC: 4, PROT: 4, GRASA: 9 };

export function exchangeToKcal(budget: { HC: number; PROT: number; GRASA: number }): number {
  return Math.round(
    budget.HC * GRAMS_PER_EXCHANGE.HC * KCAL_PER_GRAM.HC +
    budget.PROT * GRAMS_PER_EXCHANGE.PROT * KCAL_PER_GRAM.PROT +
    budget.GRASA * GRAMS_PER_EXCHANGE.GRASA * KCAL_PER_GRAM.GRASA
  );
}
