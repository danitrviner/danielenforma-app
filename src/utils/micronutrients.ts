import { Diet } from '../types';
import {
  MicroKey, MICRO_KEYS, MICRO_META, VEG_SERVING_PER100, VEG_SERVING_GRAMS, matchCanonical,
} from '../data/micronutrients';

// Deterministic micronutrient ESTIMATE for an exchange-based diet. Because the
// diet only records counted exchanges (vegetables are "libre"/uncounted but are
// the main micro source), the estimate adds a configurable vegetable baseline.
// This is a deficit/excess semáforo, not a lab analysis.

export type MicroStatus = 'low' | 'ok' | 'high' | 'unknown';

const LOW_PCT = 67;    // < this % of the reference intake → possible deficit
const HIGH_PCT = 300;  // > this % → notable excess (non-limit nutrients)
const SODIUM_CEILING = 2300; // mg/day → flag high

export interface MicroResult {
  key: MicroKey;
  label: string;
  unit: string;
  intake: number;   // estimated daily intake
  rda: number;      // reference for the athlete's sex
  rdaPct: number;   // intake / rda * 100
  status: MicroStatus;
  limit: boolean;   // true = nutrient to keep under a ceiling (sodium)
}

export interface MicronutrientEstimate {
  perMicro: MicroResult[];
  unmatched: string[];  // distinct diet labels with no canonical match (estimate is partial)
  matchedItems: number;
  totalItems: number;
  vegServingsPerDay: number;
  note: string;
}

export function buildMicronutrientEstimate(
  diet: Diet | null,
  opts: { sex?: 'male' | 'female'; vegServingsPerDay?: number } = {},
): MicronutrientEstimate {
  const sex = opts.sex ?? 'male';
  const veg = opts.vegServingsPerDay ?? 3;

  const totals: Record<MicroKey, number> = {} as Record<MicroKey, number>;
  for (const k of MICRO_KEYS) totals[k] = 0;

  const unmatched = new Set<string>();
  let matchedItems = 0;
  let totalItems = 0;

  if (diet) {
    for (const meal of diet.meals) {
      for (const item of meal.items) {
        totalItems++;
        const canonical = matchCanonical(item.foodLabel);
        if (!canonical) { unmatched.add(item.foodLabel); continue; }
        matchedItems++;
        const grams = canonical.gramsPerExchange * item.quantity;
        for (const k of MICRO_KEYS) {
          const per100 = canonical.per100g[k];
          if (per100) totals[k] += (per100 * grams) / 100;
        }
      }
    }
  }

  // Vegetable baseline (veg are uncounted in the exchange system)
  for (const k of MICRO_KEYS) {
    const per100 = VEG_SERVING_PER100[k];
    if (per100) totals[k] += (per100 * VEG_SERVING_GRAMS * veg) / 100;
  }

  const perMicro: MicroResult[] = MICRO_KEYS.map(k => {
    const meta = MICRO_META[k];
    const rda = sex === 'female' ? meta.rdaFemale : meta.rdaMale;
    const intake = Math.round(totals[k] * 10) / 10;
    const rdaPct = rda > 0 ? Math.round((intake / rda) * 100) : 0;
    let status: MicroStatus;
    if (meta.limit) {
      status = intake > SODIUM_CEILING ? 'high' : 'ok';
    } else {
      status = rdaPct < LOW_PCT ? 'low' : rdaPct > HIGH_PCT ? 'high' : 'ok';
    }
    return { key: k, label: meta.label, unit: meta.unit, intake, rda, rdaPct, status, limit: !!meta.limit };
  });

  const note = `Estimación por porciones tipo · ${veg} ración${veg !== 1 ? 'es' : ''} de verdura/día asumida${veg !== 1 ? 's' : ''}. No sustituye una analítica.`;

  return {
    perMicro,
    unmatched: [...unmatched],
    matchedItems,
    totalItems,
    vegServingsPerDay: veg,
    note,
  };
}
