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

   Mejora sostenida (auditoría de cifras, 17-11-2026). El 3 % es el ruido de
   UNA medida: vale para comparar una sesión con otra, y por eso deja fuera
   una repetición ganada (un 2,2-2,7 % de RM estimado, medido sobre la fórmula
   real). Con ese listón, quien ganaba una repetición en doce semanas salía
   con doce sesiones «sin mejorar». La MEDIANA de tres sesiones seguidas baja
   ese ruido (una sesión rara no la mueve; hacen falta dos de tres), así que
   sobre el nivel —esa mediana— el listón puede ser el 2 %: lo que mueve una
   repetición, o un punto de RIR (2,2-2,5 %). Lo usa `estancamiento.ts`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cambio de RM estimado, en %, por debajo del cual es ruido. */
export const RUIDO_RM_PCT = 3;
/** Lo mismo, en tanto por uno, para los motores que trabajan así. */
export const RUIDO_RM = RUIDO_RM_PCT / 100;

/** Sesiones con marca cuya mediana es «el nivel» de un ejercicio. */
export const SESIONES_DEL_NIVEL = 3;
/** Subida del nivel (mediana de `SESIONES_DEL_NIVEL` marcas), en %, que ya es
 *  mejora: una repetición ganada y mantenida. No vale para una sesión suelta. */
export const MEJORA_SOSTENIDA_RM_PCT = 2;
/** Lo mismo, en tanto por uno. */
export const MEJORA_SOSTENIDA_RM = MEJORA_SOSTENIDA_RM_PCT / 100;

/** Cambio de perímetro, en cm, por debajo del cual es ruido. */
export const RUIDO_PERIMETRO_CM = { brazo: 0.5, resto: 1 } as const;

/** ¿El cambio de RM (en %) supera el ruido? */
export function superaElRuido(pct: number): boolean {
  return Math.abs(pct) >= RUIDO_RM_PCT;
}
