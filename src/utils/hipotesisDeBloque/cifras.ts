import type { Velocidad } from '../cdg/agujetas.js';
import { RUIDO_RM_PCT } from '../ruidoDeMedida.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Las cifras de la hipótesis del bloque (17-11-2026)

   Todas las cifras del sistema de hipótesis, en un solo sitio y cada una con
   su origen. Hay tres orígenes y conviene no mezclarlos al leerlas:

     · «curso»   — lo dice la formación del Índice de Hipertrofia;
     · «Dani»    — lo decidió Dani el 17-11-2026 donde el curso no da cifra;
     · «propio»  — criterio técnico de la app para no leer ruido (no es una
                   regla de entrenamiento; se puede mover sin preguntarle).

   Nada de esto se edita desde la app. Este archivo lo alcanza el protocolo
   semanal (`utils/cdg/agujetas.ts`), que corre también en `api/`: solo
   importa con `.js` y no depende de nada con estado.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Velocidad por defecto de un bloque: suave, un 10 % por escalón (Dani).
 *  Los porcentajes de cada velocidad siguen en `VELOCIDADES` (agujetas.ts). */
export const VELOCIDAD_POR_DEFECTO: Velocidad = 'suave';

/** Duración por defecto de un bloque, en semanas (Dani). */
export const SEMANAS_POR_DEFECTO = 12;
/** El primer bloque es más corto: se trata de aprender, no de acumular (Dani). */
export const SEMANAS_PRIMER_BLOQUE = 8;

/**
 * Con `semana1Reducida`, cuánto por debajo de donde acabó el bloque anterior
 * arranca la zona, en %. El curso dice «leve descarga» y su único ejemplo
 * ronda el 5 %; el rango acordado con Dani es 5-10 % y se usa el 7.
 */
export const REDUCCION_SEMANA_1_PCT = 7;
/** El rango acordado, para que la pantalla no deje salirse de él. */
export const RANGO_REDUCCION_SEMANA_1_PCT = { min: 5, max: 10 } as const;

/**
 * Techo del bloque por zona: donde acabó el anterior + este número de
 * escalones de la velocidad (16 → 17,6 en suave; nunca 20). Propuesta propia
 * aceptada por Dani: el curso no da tope.
 */
export const ESCALONES_DE_TECHO = 1;

/** PROCESO: el IEM medio del bloque tiene que ser la media del anterior más
 *  este % (Dani). */
export const SUBIDA_DE_PROCESO_PCT = 10;
/** PROCESO cumplido si se llega a esta fracción del objetivo (Dani: 95 %). */
export const FRACCION_DE_PROCESO_CUMPLIDO = 0.95;

/** Entre subida y subida, semanas sostenidas como mínimo en el nivel nuevo
 *  (Dani). La semana en la que se sube cuenta como la primera. */
export const SEMANAS_ENTRE_SUBIDAS = 2;
/**
 * Desde qué subida del bloque se repiten los PUNTOS de la primera en vez del
 * porcentaje (curso, Caso 6: si el primer +10 % fueron 1,6 puntos, la segunda
 * subida son otros 1,6, no un 10 % de una base ya más alta).
 */
export const SUBIDA_QUE_REPITE_PUNTOS = 2;
/**
 * Lo mínimo que tiene que crecer el IEM programado de una zona de una semana
 * normal a la siguiente para contarlo como «subida»: medio punto y un 3 % de
 * la base. Propio: es la misma tolerancia con la que `proponerProgresionIem`
 * da un objetivo por alcanzado, para que un redondeo no parezca una subida.
 */
export const SUBIDA_MINIMA = { puntos: 0.5, pct: 3 } as const;

/** RESULTADO: mejora del RM estimado medio de los ejercicios de la zona, en %
 *  (Dani). */
export const RM_OBJETIVO_PCT = 5;
/** Por debajo de esto un cambio de RM es ruido de medida (`ruidoDeMedida.ts`). */
export const RM_RUIDO_PCT = RUIDO_RM_PCT;
/**
 * En un avanzado lo normal es +2-3 % de RM en 12 semanas (Dani): no se le
 * pide el objetivo entero en un bloque, se juzga sumando este número de
 * bloques seguidos con la misma apuesta.
 */
export const BLOQUES_PARA_JUZGAR_A_UN_AVANZADO = 2;
/** Lo que se espera de un avanzado en un bloque, para el texto (Dani). */
export const RM_ESPERADO_AVANZADO_PCT = { min: 2, max: 3 } as const;

/** Mantener una zona = esta fracción del IEM (o de las series) que hacía
 *  (Dani). Ignorarla = 0. */
export const FRACCION_DE_MANTENER = 0.5;

/** Estrellas (zonas prioritarias) a partir de las cuales la app avisa (Dani). */
export const ESTRELLAS_CON_AVISO = 3;
/** Máximo de estrellas en un bloque de desarrollo (Dani). */
export const ESTRELLAS_DESARROLLO = 3;
/** En especialización, una sola (Dani). */
export const ESTRELLAS_ESPECIALIZACION = 1;

/** Veces seguidas que una zona puede «no responder» antes de que la estrella
 *  pase a otra (Dani: a la segunda). */
export const NO_RESPONDE_PARA_SOLTAR_ESTRELLA = 2;
/** Bloques seguidos en mantener a partir de los cuales una zona es candidata
 *  a recibir la estrella (Dani). */
export const BLOQUES_EN_MANTENER_PARA_CANDIDATA = 2;

/** LÍMITE: cansancio medio al salir de las sesiones (0-10) a partir del cual
 *  el bloque se ha pasado. Es el mismo 8 del protocolo semanal
 *  (`UMBRALES_PROTOCOLO.fatigaPostAlta`, revisado por Dani el 27-10). */
export const CANSANCIO_LIMITE = 8;

/** Parón, en días, a partir del cual la app sugiere la semana 1 reducida
 *  (Dani: «más de 3 semanas»). */
export const DIAS_DE_PARON_PARA_REDUCIR = 21;

/**
 * Adherencia (sesiones hechas de las programadas, en %) por debajo de la cual
 * un proceso sin cumplir se explica por la adherencia. Propio: con menos de 4
 * de cada 5 sesiones el estímulo previsto no se llegó a dar.
 */
export const ADHERENCIA_BAJA_PCT = 80;
/** Semanas frenadas por agujetas a partir de las cuales el freno explica un
 *  proceso sin cumplir. Propio. */
export const SEMANAS_DE_FRENO_QUE_EXPLICAN = 2;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** IEM con un decimal: lo que se guarda y lo que se enseña. */
export const redondearIem = r1;
