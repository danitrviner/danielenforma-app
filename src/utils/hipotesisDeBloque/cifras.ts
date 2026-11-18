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

/**
 * PROCESO: el IEM medio del bloque tiene que llegar a donde ACABÓ el anterior
 * más esta fracción del escalón de la velocidad (medio escalón: un 5 % en
 * suave). Dani, auditoría de cifras del 17-11-2026.
 *
 * Hasta entonces era «la MEDIA del anterior + 10 %, cumplido al 95 %», y no
 * distinguía nada: con un bloque anterior en rampa (media 52, final 58) el
 * objetivo era 57,2 y se cumplía con 54,3, es decir, ya estaba cumplido al
 * arrancar en 58 sin subir nada. Ahora, con arranque 58 y techo 63,8, la
 * media solo llega a 60,9 (+5 %) si el escalón se da antes de la semana 7 de
 * 12: el proceso se cumple si de verdad se subió, y a tiempo.
 */
export const FRACCION_DE_ESCALON_DE_PROCESO = 0.5;
/**
 * Lo mismo en % para la velocidad por defecto (suave: 10 % × 0,5). Solo para
 * textos (lo cita la doctrina del asistente): las cuentas usan la fracción de
 * arriba con la velocidad de cada bloque.
 */
export const SUBIDA_DE_PROCESO_PCT = 5;
/**
 * PROCESO de una zona que NO sube (palanca «ejercicios», techo sin subir por
 * zona alta, por déficit o porque respondió con menos): sostener. La media
 * tiene que llegar a esta fracción de donde acabó el anterior (Dani, 17-11).
 * Es también el margen con el que «recuperar» da por bueno que se bajó (un
 * 5 % por encima de su tope). Ya NO es una tolerancia sobre el objetivo de
 * subir: ese se cumple entero o no se cumple.
 */
export const FRACCION_DE_SOSTENER = 0.95;

/**
 * IEM semanal de una zona a partir del cual está «alta» y el techo deja de
 * subir por defecto (Dani, auditoría de cifras del 17-11-2026). Origen: el
 * curso pide ser conservador con el IEM de una zona por encima de 80-110; se
 * toma el extremo bajo. Sin tope, cuatro bloques seguidos en suave llevaban
 * una zona de 58 a 85 (de 14 a unas 20 series). Es una propuesta: el coach
 * puede subir el techo a mano.
 */
export const IEM_ZONA_ALTA = 80;

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
/**
 * RESULTADO en un principiante, en % (propio, aceptado por Dani en la
 * auditoría de cifras del 17-11-2026): un principiante supera el 5 % casi
 * siempre, y con ese listón el veredicto diría «confirmada» de cualquier
 * apuesta sin distinguir nada.
 */
export const RM_OBJETIVO_PRINCIPIANTE_PCT = 8;
/**
 * RESULTADO con el bloque en déficit: no perder (Dani, 17-11-2026). Un
 * objetivo de 0 lo trata el veredicto como cumplido mientras el RM no caiga
 * más que el ruido de medida. Es una sugerencia editable, no un bloqueo: la
 * periodización nutricional no toca el entreno.
 */
export const RM_OBJETIVO_EN_DEFICIT_PCT = 0;
/**
 * Por debajo de esto un cambio de RM es ruido de medida (`ruidoDeMedida.ts`).
 * Es también el suelo de la franja «mejora, menos de lo buscado» (auditoría
 * de cifras, 17-11-2026). Lo medido con un ruido realista del 3 % por sesión:
 * una zona que mejora de verdad un 5 % llega al objetivo el 50 % de las veces
 * (con un 4 % real, el 28-33 %), así que «o llega o no responde» daba dos «no
 * responde» seguidos por puro azar 1 de cada 4 veces y rotaba la estrella. En
 * cambio, con un 0 % real solo se pasa del 3 % el 3-8 % de las veces: lo que
 * supera el ruido es mejora de verdad aunque no llegue al objetivo.
 */
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

/**
 * Estrellas (zonas prioritarias) a partir de las cuales la app AVISA en un
 * bloque de desarrollo (Dani, 18-11-2026: «con 4 que avise, pero que me
 * permita hacer lo que quiera»). Con 3 o menos no dice nada. Es un aviso
 * informativo, nunca un tope: ni el editor, ni la sugerencia de volumen, ni
 * el asistente rechazan un bloque por sus estrellas. Hasta el 17-11 avisaba
 * con 3 y con 4 lo daba por excedido.
 */
export const ESTRELLAS_CON_AVISO = 4;
/** Las que lleva un bloque de desarrollo sin que la app diga nada (Dani). */
export const ESTRELLAS_DESARROLLO = ESTRELLAS_CON_AVISO - 1;
/** En especialización el aviso sale antes: con 2 o más (Dani, 18-11-2026). */
export const ESTRELLAS_CON_AVISO_ESPECIALIZACION = 2;
/** En especialización lo normal es una sola (Dani). */
export const ESTRELLAS_ESPECIALIZACION = ESTRELLAS_CON_AVISO_ESPECIALIZACION - 1;

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
