// Single source of truth for the steps→kcal conversion rate. The coach can
// override it per athlete via AthleteNutritionConfig.kcalPerStep; this is only
// the fallback when that field is unset — never hardcode the rate elsewhere.
// 1000 pasos ≈ 46 kcal.
export const DEFAULT_KCAL_PER_STEP = 0.046;
