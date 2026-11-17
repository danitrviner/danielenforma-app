/* ═══════════════════════════════════════════════════════════════════════════
   Ruido de medida (17-11-2026)

   Por debajo de estas cifras un cambio no se distingue del error de medir, así
   que la app no lo llama ni mejora ni caída. Un solo sitio para todas las
   pantallas: antes cada motor tenía su umbral (1 %, 2 %, 2,5 %).

   · RM estimado: una repetición más o menos mueve el RM un 2,5-3 %, y el test
     de 1RM medido tiene un CV del 3-4 % en gente entrenada (Grgic 2020,
     Sports Med Open). De ahí el 3 %.
   · Perímetros con cinta: error técnico de 0,3-0,4 cm en brazo y de 0,5-1 cm
     en muslo y pecho, medidos por un experto (Nácher-Fernández 2026, JISSN).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cambio de RM estimado, en %, por debajo del cual es ruido. */
export const RUIDO_RM_PCT = 3;
/** Lo mismo, en tanto por uno, para los motores que trabajan así. */
export const RUIDO_RM = RUIDO_RM_PCT / 100;

/** Cambio de perímetro, en cm, por debajo del cual es ruido. */
export const RUIDO_PERIMETRO_CM = { brazo: 0.5, resto: 1 } as const;

/** ¿El cambio de RM (en %) supera el ruido? */
export function superaElRuido(pct: number): boolean {
  return Math.abs(pct) >= RUIDO_RM_PCT;
}
