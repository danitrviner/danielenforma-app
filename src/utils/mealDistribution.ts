// Reparto automático de intercambios por comida — sustituye el reparto
// perfectamente igual de NutritionPlansScreen.tsx (antes `distributeEvenly`)
// por uno que responde a cuándo el atleta tiene más hambre y a qué comida
// cae cerca del entreno. Sin preferencia registrada, el resultado es
// bit a bit idéntico al reparto uniforme de siempre (ver test de
// equivalencia con distributeEvenly).
import { FoodCategory, HungerProfile } from '../types';
import { normalizeStr } from './foodPrefs';
import { FALLBACK_SLOTS } from './menuEngine';
import { quotaSplit } from './quotaSplit';

export { quotaSplit };

export const SLOT_LABEL: Record<number, string> = { 1: 'Desayuno', 2: 'Media mañana', 3: 'Comida', 4: 'Merienda', 5: 'Cena' };
export const HUNGER_PROFILE_LABEL: Record<HungerProfile, string> = {
  manana: 'por la mañana', equilibrado: 'igual todo el día', noche: 'por la noche',
};

// ── Resolución de franja horaria (1=Desayuno..5=Cena) ───────────────────────

const SLOT_KEYWORDS: [RegExp, number][] = [
  [/desayuno|breakfast|al levantar|primera hora/, 1],
  [/media\s*manana|tentempie|snack\s*manana/, 2],
  [/merienda|snack\s*tarde/, 4],
  [/cena|dinner|recena|antes de dormir/, 5],
  [/comida|lunch|mediodia/, 3],
];

const AROUND_TRAINING_RE = /pre.?entreno|post.?entreno|peri.?entreno|antes de entrenar|despues de entrenar/;

/** Deduce la franja a partir del nombre libre de la comida. "almuerzo" es
 *  ambiguo (comida en gran parte de España, media mañana en otra) — se
 *  resuelve aparte, en resolveSlots(), según lo que ya haya en la dieta. */
export function inferSlot(rawName: string): number | undefined {
  const name = normalizeStr(rawName || '');
  if (!name || /almuerzo/.test(name)) return undefined;
  // Placeholder genérico ("Comida 1", "Comida 2"...) — nombre por defecto de
  // addMeal()/blankDiet() en dietas sin nombres reales; no dice nada de la
  // franja real, así que se deja sin resolver para caer en el preset por
  // conteo (resolveSlots) en vez de que TODAS las comidas casen con "comida".
  if (/^comida\s*\d+$/.test(name)) return undefined;
  for (const [re, slot] of SLOT_KEYWORDS) {
    if (re.test(name)) return slot;
  }
  return undefined;
}

export function detectAroundTraining(rawName: string): boolean {
  return AROUND_TRAINING_RE.test(normalizeStr(rawName || ''));
}

function clampSlot(i: number, n: number): number {
  if (n <= 1) return 3;
  return Math.min(5, Math.max(1, Math.round(1 + (i * 4) / (n - 1))));
}

/** Resuelve la franja de cada comida de una dieta, en orden de confianza:
 *  1) slot explícito (coach o inferencia previa) · 2) nombre de la comida ·
 *  3) preset por número de comidas (mismo que usa el generador de menús) ·
 *  4) reparto uniforme por posición. Nunca falla — una dieta vieja sin
 *  ningún slot cae en el paso 3/4 y sale algo razonable. */
export function resolveSlots(meals: { slot?: number; name: string }[]): number[] {
  const n = meals.length;
  const resolved: (number | undefined)[] = meals.map(m =>
    m.slot ?? inferSlot(m.name)
  );

  // "almuerzo": comida (3), salvo que otra ya haya resuelto a 3 → media mañana (2)
  const has3 = resolved.includes(3);
  meals.forEach((m, i) => {
    if (resolved[i] != null) return;
    if (/almuerzo/.test(normalizeStr(m.name || ''))) {
      resolved[i] = has3 ? 2 : 3;
    }
  });

  const unresolvedIdx = resolved.reduce<number[]>((acc, v, i) => (v == null ? [...acc, i] : acc), []);
  if (unresolvedIdx.length > 0) {
    if (n === 3 || n === 4 || n === 5) {
      const fallback = FALLBACK_SLOTS[n as 3 | 4 | 5];
      unresolvedIdx.forEach(i => { resolved[i] = fallback[i]?.slot ?? clampSlot(i, n); });
    } else {
      unresolvedIdx.forEach(i => { resolved[i] = clampSlot(i, n); });
    }
  }
  return resolved as number[];
}

// ── Pesos por franja + perfil de hambre ─────────────────────────────────────

const BASE_BY_SLOT: Record<number, number> = { 1: 20, 2: 10, 3: 38, 4: 10, 5: 27 };

const HUNGER_MULT: Record<HungerProfile, Record<number, number>> = {
  manana:      { 1: 1.45, 2: 1.20, 3: 1.05, 4: 0.85, 5: 0.65 },
  equilibrado: { 1: 1,    2: 1,    3: 1,    4: 1,    5: 1 },
  noche:       { 1: 0.65, 2: 0.85, 3: 1.00, 4: 1.15, 5: 1.45 },
};

const TRAINING_HC_BOOST = 1.6;   // hidratos hacia la ingesta peri-entreno
const TRAINING_GRASA_DAMP = 0.5; // grasa se aparta de la ingesta de entreno
const PROT_FLATTEN = 0.65;       // proteína casi plana entre comidas (0=uniforme, 1=perfectamente plana)

export interface DistributeMealInput {
  id: string;
  name: string;
  slot?: number;
  aroundTraining?: boolean;
}

export interface DistributeInput {
  budget: Record<FoodCategory, number>;
  meals: DistributeMealInput[];
  hungerProfile?: HungerProfile;
  trainingSlot?: number;
}

export interface DistributeResult {
  /** targets[i] ↔ meals[i] */
  targets: Record<FoodCategory, number>[];
  slots: number[];
  reasons: string[];
  /** false = reparto uniforme (sin preferencia registrada, o "equilibrado" sin comida de entreno) */
  personalized: boolean;
}

function blankBudget(): Record<FoodCategory, number> {
  return { HC: 0, PROT: 0, GRASA: 0, MIX_HC: 0, MIX_GRASA: 0 };
}

export function distributeMealTargets(input: DistributeInput): DistributeResult {
  const { budget, meals, hungerProfile, trainingSlot } = input;
  const n = meals.length;
  if (n === 0) return { targets: [], slots: [], reasons: [], personalized: false };

  const slots = resolveSlots(meals);
  const aroundTrainingFlags = meals.some(m => m.aroundTraining)
    ? meals.map(m => !!m.aroundTraining)
    : slots.map(slot => trainingSlot != null && slot === trainingSlot);
  const hasTrainingMeal = aroundTrainingFlags.some(Boolean);
  const effectiveProfile: HungerProfile = hungerProfile ?? 'equilibrado';
  const personalized = effectiveProfile !== 'equilibrado' || hasTrainingMeal;

  const targets: Record<FoodCategory, number>[] = meals.map(() => blankBudget());
  const cats: FoodCategory[] = ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'];

  const baseWeights = slots.map(slot => (BASE_BY_SLOT[slot] ?? 20) * (HUNGER_MULT[effectiveProfile][slot] ?? 1));

  for (const cat of cats) {
    const total = budget[cat] ?? 0;
    if (total <= 0) continue;

    if (!personalized) {
      // Sin preferencia: reparto uniforme, idéntico al `distributeEvenly` de siempre.
      quotaSplit(total, meals.map(() => 1)).forEach((v, i) => { targets[i][cat] = v; });
      continue;
    }

    const mean = baseWeights.reduce((s, w) => s + w, 0) / n;
    const weights = baseWeights.map((w, i) => {
      let out = w;
      if (cat === 'PROT') out = w + (mean - w) * PROT_FLATTEN;
      if ((cat === 'HC' || cat === 'MIX_HC') && aroundTrainingFlags[i]) out *= TRAINING_HC_BOOST;
      if ((cat === 'GRASA' || cat === 'MIX_GRASA') && aroundTrainingFlags[i]) out *= TRAINING_GRASA_DAMP;
      return out;
    });
    quotaSplit(total, weights).forEach((v, i) => { targets[i][cat] = v; });
  }

  const reasons: string[] = [];
  if (effectiveProfile === 'manana') reasons.push('más hambre por la mañana');
  if (effectiveProfile === 'noche') reasons.push('más hambre por la noche');
  if (hasTrainingMeal) {
    const idx = aroundTrainingFlags.findIndex(Boolean);
    const mealName = meals[idx]?.name?.trim() || 'la comida de entreno';
    reasons.push(`hidratos hacia ${mealName} (entreno)`);
  }

  return { targets, slots, reasons, personalized };
}
