// Franjas de las comidas (1 Desayuno … 5 Cena) y sus nombres. Hasta 10-2026
// aquí vivía también el reparto de intercambios por comida; desde que solo
// cuenta el objetivo del día, no hay nada que repartir.
import { HungerProfile } from '../types.js';
import { normalizeStr } from './foodPrefs.js';
import { FALLBACK_SLOTS, CONTEOS_COMIDAS, ConteoComidas } from './menuEngine.js';

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
    if (CONTEOS_COMIDAS.includes(n as ConteoComidas)) {
      const fallback = FALLBACK_SLOTS[n as ConteoComidas];
      unresolvedIdx.forEach(i => { resolved[i] = fallback[i]?.slot ?? clampSlot(i, n); });
    } else {
      unresolvedIdx.forEach(i => { resolved[i] = clampSlot(i, n); });
    }
  }
  return resolved as number[];
}
