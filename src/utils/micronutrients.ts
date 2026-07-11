import { Diet } from '../types';
import {
  MicroKey, MICRO_KEYS, MICRO_META, VEG_SERVING_PER100, VEG_SERVING_GRAMS, VEGETABLES, matchCanonical,
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

// Perfil de verdura efectivo: media de las verduras habituales del atleta, o el
// perfil mixto genérico si no ha marcado ninguna (ids desconocidos se ignoran).
function vegProfile(vegTypes: string[] | undefined): Partial<Record<MicroKey, number>> {
  const selected = (vegTypes ?? [])
    .map(id => VEGETABLES.find(v => v.id === id))
    .filter((v): v is NonNullable<typeof v> => v != null);
  if (selected.length === 0) return VEG_SERVING_PER100;
  const avg: Partial<Record<MicroKey, number>> = {};
  for (const k of MICRO_KEYS) {
    const sum = selected.reduce((s, v) => s + (v.per100g[k] ?? 0), 0);
    if (sum > 0) avg[k] = Math.round((sum / selected.length) * 100) / 100;
  }
  return avg;
}

export function buildMicronutrientEstimate(
  diet: Diet | null,
  opts: { sex?: 'male' | 'female'; vegServingsPerDay?: number; vegTypes?: string[] } = {},
): MicronutrientEstimate {
  const sex = opts.sex ?? 'male';
  const veg = opts.vegServingsPerDay ?? 3;
  const vegPer100 = vegProfile(opts.vegTypes);

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
    const per100 = vegPer100[k];
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

  const vegCount = opts.vegTypes?.filter(id => VEGETABLES.some(v => v.id === id)).length ?? 0;
  const vegDesc = vegCount > 0
    ? `perfil de sus ${vegCount} verdura${vegCount !== 1 ? 's' : ''} habitual${vegCount !== 1 ? 'es' : ''}`
    : 'verdura mixta genérica';
  const note = `Estimación por porciones tipo · ${veg} ${veg === 1 ? 'ración' : 'raciones'} de verdura/día (${vegDesc}). No sustituye una analítica.`;

  return {
    perMicro,
    unmatched: [...unmatched],
    matchedItems,
    totalItems,
    vegServingsPerDay: veg,
    note,
  };
}
