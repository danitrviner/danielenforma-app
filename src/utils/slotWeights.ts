// Cuánto del día le toca a cada franja (1=Desayuno .. 5=Cena) — ÚNICA fuente
// para las dos cosas que reparten comida en la app:
//   · utils/mealDistribution.ts → los intercambios de la dieta del entrenador
//   · utils/menuEngine.ts       → las franjas del menú de recetas del atleta
//
// Vivían por separado y no coincidían: la dieta repartía 20/10/38/10/27 y hacía
// caso al perfil de hambre; el menú de recetas repartía 20/10/40/10/25 y ni
// sabía que esa pregunta existía. El atleta contestaba "ceno fuerte y desayuno
// poco", lo veía aplicado en su dieta, abría su menú y le salía un desayunazo —
// dos verdades distintas dentro de la misma app.
//
// El sentido de la información es SIEMPRE ficha/perfil → reparto. Que el
// entrenador retoque a mano los intercambios de una dieta concreta no reescribe
// el menú del atleta: eso se cambia desde la ficha de iniciación o desde
// Perfil > Preferencias, que es de donde ambos leen (decisión de Dani,
// 2026-09-05).
//
// Módulo hoja, sin imports de menuEngine ni de mealDistribution, para que los
// dos puedan usarlo sin crear un ciclo entre ellos.
import { HungerProfile } from '../types';

/** Reparto de referencia por franja. Son PESOS relativos, no porcentajes: lo
 *  que importa es la proporción entre ellos, y quien los usa los normaliza. */
export const BASE_BY_SLOT: Record<number, number> = { 1: 20, 2: 10, 3: 38, 4: 10, 5: 27 };

export const HUNGER_MULT: Record<HungerProfile, Record<number, number>> = {
  manana:      { 1: 1.45, 2: 1.20, 3: 1.05, 4: 0.85, 5: 0.65 },
  equilibrado: { 1: 1,    2: 1,    3: 1,    4: 1,    5: 1 },
  noche:       { 1: 0.65, 2: 0.85, 3: 1.00, 4: 1.15, 5: 1.45 },
};

/** Peso de cada franja con el perfil de hambre ya aplicado. */
export function slotWeights(slots: number[], hungerProfile?: HungerProfile): number[] {
  const mult = HUNGER_MULT[hungerProfile ?? 'equilibrado'];
  return slots.map(slot => (BASE_BY_SLOT[slot] ?? 20) * (mult[slot] ?? 1));
}

/** Los mismos pesos convertidos a porcentajes ENTEROS que suman exactamente 100
 *  (cuota de Hare / resto mayor). El entero exacto no es cosmética: el editor de
 *  menús del entrenador bloquea el botón de generar si la suma no da 100
 *  clavado, así que un reparto con decimales dejaría la pantalla inutilizable. */
export function slotPercents(slots: number[], hungerProfile?: HungerProfile): number[] {
  const weights = slotWeights(slots, hungerProfile);
  const total = weights.reduce((s, w) => s + w, 0);
  if (slots.length === 0) return [];
  if (total <= 0) {
    const base = Math.floor(100 / slots.length);
    return slots.map((_, i) => base + (i < 100 - base * slots.length ? 1 : 0));
  }
  const exact = weights.map(w => (w * 100) / total);
  const out = exact.map(Math.floor);
  let resto = 100 - out.reduce((s, v) => s + v, 0);
  const orden = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let k = 0; resto > 0; k++, resto--) out[orden[k % slots.length].i] += 1;
  return out;
}
