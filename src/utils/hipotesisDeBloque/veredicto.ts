import type {
  CierreDeHipotesis, DosisDeZona, ExperienceLevel, HipotesisDeZona, LecturaDeHipotesis, PalancaDeHipotesis, VeredictoDeHipotesis,
} from '../../types.js';
import type { NombreCdgDe } from '../cdg/adaptadores.js';
import { parsearEsfuerzo, parsearReps, type MotorCdg } from '../cdg/motor.js';
import { ZONAS_IEM, iemPorZona, type ZonaIem } from '../cdg/zonas.js';
import type { ProgresionEjercicio } from '../progresionDelBloque.js';
import { REPS_MAX_RM, REPS_MIN_RM, RIR_MAX_RM, mediana } from '../rmValido.js';
import {
  ADHERENCIA_BAJA_PCT, BLOQUES_PARA_JUZGAR_A_UN_AVANZADO, CANSANCIO_LIMITE, FRACCION_DE_SOSTENER,
  NO_RESPONDE_PARA_SOLTAR_ESTRELLA, RM_OBJETIVO_PCT, RM_RUIDO_PCT, SEMANAS_DE_FRENO_QUE_EXPLICAN, redondearIem,
} from './cifras.js';
import type { EstadoDeEjercicio, EstadoDelBloque } from './estadoDelBloqueAnterior.js';
import { textoDeVigilar } from './estresArticular.js';
import { seguidosAlFinal, veredictosDeLaZona, type BloqueConCierre } from './historial.js';
import { PALANCAS, otraPalanca } from './palancas.js';
import { estadoParaElProceso } from './referenciaPropia.js';
import { nombreCortoDeZona } from './tiposDeBloque.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El veredicto de cada hipótesis al cerrar el bloque (17-11-2026)

   Dos preguntas, por separado, y de cruzarlas sale la lectura:

     PROCESO   ¿se hizo?  IEM medio semanal realizado frente al objetivo
               (`HipotesisDeZona.iemMedioObjetivo`: donde acabó el bloque
               anterior + medio escalón, o sostenerlo si la zona no sube).
               Cumplido si llega, sin tolerancia: la del 95 % se quitó en la
               auditoría de cifras del 17-11-2026 (ver `cifras.ts`).
     RESULTADO ¿sirvió?   Mediana del % de RM estimado de los ejercicios de la
               zona que cuentan (`progresionDelBloque.ts`: mediana de 2
               semanas contra 2, solo ejercicios con marca en más de la mitad
               de las semanas). En TRES franjas (auditoría de cifras,
               17-11-2026): llega al objetivo (+5 %) → cumplido; entre el
               ruido de medida (3 %) y el objetivo → mejora parcial; por
               debajo del ruido → no cumplido.

                     │ cumplido            │ mejora parcial      │ no cumplido
       ──────────────┼─────────────────────┼─────────────────────┼─────────────
       proceso sí    │ confirmada          │ mejora_parcial      │ no_responde
       proceso no    │ responde_con_menos  │ responde_con_menos  │ sin_probar

   Matices que importan:
    · Por qué tres franjas: con un ruido realista del 3 % por sesión, una
      zona que mejora de verdad un 5 % solo llega al objetivo la mitad de las
      veces. Con dos franjas salían dos «no responde» seguidos por puro azar 1
      de cada 4 veces, y a la segunda la estrella rotaba. «Mejora parcial» no
      cuenta como «no responde»: ni cambia la palanca ni suelta la estrella;
      se sigue la misma línea sin subir el techo.
    · Sin ejercicios con marca suficiente no hay resultado (`null`): la
      hipótesis queda «sin probar» por falta de medida, no «no responde».
    · A un avanzado no se le pide el 5 % en un bloque: si no llega solo, se
      suma el bloque anterior de la misma apuesta y, si aún no hay dos, queda
      «sin probar» a la espera del segundo.
    · Sin objetivo de proceso (bloque sin cifras del anterior), se juzga solo
      por el resultado.

   Los límites (cansancio medio al salir de 8 o más, molestia en la zona) van
   como DATO: no cambian la lectura, pero una confirmada con un límite pasado
   no sube el techo. Dani lo confirmó el 18-11-2026 y añadió que con molestia
   se vigile el estrés articular de la zona: la propuesta para el bloque
   siguiente lo dice (`estresArticular.ts`), sea cual sea la lectura.

   Determinista y sin escribir nada: el coach firma (`cierreParaGuardar`).
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Qué ejercicios son «de la zona» ──────────────────────────────────────────

/**
 * La zona a la que el motor CDG reparte más estímulo de cada ejercicio: la de
 * mayor IEM en una serie de referencia (8-12 repeticiones a RIR 1, la misma
 * de `get_alternativas_ejercicio`). Un ejercicio sin vínculo CDG no sale.
 */
export function zonaPrincipalDeEjercicios(
  motor: Pick<MotorCdg, 'musculos' | 'articulaciones' | 'existe' | 'calcularSerie'>,
  nombreCdgDe: NombreCdgDe, exerciseIds: readonly string[],
): Record<string, ZonaIem> {
  const out: Record<string, ZonaIem> = {};
  const rpe = parsearEsfuerzo(1, '1x1', 'RIR')[0];
  const repetitions = parsearReps('8-12');
  for (const id of exerciseIds) {
    const nombre = nombreCdgDe(id);
    if (!nombre || !motor.existe(nombre)) continue;
    const zonas = iemPorZona(motor, motor.calcularSerie({ exerciseName: nombre, rpe, repetitions }).IEM);
    let mejor: ZonaIem | null = null;
    for (const z of ZONAS_IEM) if (zonas[z.clave] > 0.005 && (mejor == null || zonas[z.clave] > zonas[mejor])) mejor = z.clave;
    if (mejor) out[id] = mejor;
  }
  return out;
}

export type ZonaDeEjercicio = Partial<Record<string, ZonaIem>> | ((exerciseId: string) => ZonaIem | undefined);
const zonaDeId = (zonaDe: ZonaDeEjercicio, id: string) => (typeof zonaDe === 'function' ? zonaDe(id) : zonaDe[id]);

export interface RmDeLaZona {
  /** Mediana del % de RM de los ejercicios que cuentan; `null` si no hay ninguno. */
  rmPct: number | null;
  ejercicios: Array<{ exerciseId: string; nombre: string; deltaPct: number }>;
}

/**
 * El resultado de una zona: la mediana del % de RM estimado de sus ejercicios
 * que cuentan. «Cuentan» los que `buildProgresionDelBloque` pudo comparar por
 * RM (`deltaPct` con `metrica: 'e1rm'`); los que se comparan por repeticiones
 * no miden RM y no entran.
 */
export function rmDeLaZona(o: {
  zona: ZonaIem;
  ejercicios: ReadonlyArray<Pick<ProgresionEjercicio, 'exerciseId' | 'nombre' | 'deltaPct' | 'metrica'>>;
  zonaDe: ZonaDeEjercicio;
}): RmDeLaZona {
  const ejercicios = o.ejercicios
    .filter(e => e.metrica === 'e1rm' && e.deltaPct != null && zonaDeId(o.zonaDe, e.exerciseId) === o.zona)
    .map(e => ({ exerciseId: e.exerciseId, nombre: e.nombre, deltaPct: e.deltaPct! }));
  const m = mediana(ejercicios.map(e => e.deltaPct));
  return { rmPct: m == null ? null : redondearIem(m), ejercicios };
}

// ── Límites ──────────────────────────────────────────────────────────────────

export interface LimitesDelBloque {
  /** Cansancio medio al salir de las sesiones del bloque (0-10). */
  cansancioMedio?: number | null;
  /** Sesiones con molestia apuntada en ejercicios de la zona. */
  molestiasEnLaZona?: number;
  /** La molestia más alta apuntada en la zona (1-10). */
  molestiaMaxima?: number | null;
}

export interface LimitesDelVeredicto {
  cansancio: { valor: number | null; limite: number; pasado: boolean };
  molestia: { veces: number; maxima: number | null; pasado: boolean };
  /** El límite propio que escribió el coach (`HipotesisDeZona.limite`): lo juzga él. */
  propio?: string;
  algunoPasado: boolean;
  /** «cansancio medio 8,4/10», «molestia en 3 sesiones»… Solo los pasados. */
  textos: string[];
}

/** Las molestias apuntadas en los ejercicios de una zona, para `LimitesDelBloque`. */
export function molestiasDeLaZona(
  estado: readonly Pick<EstadoDeEjercicio, 'exerciseId' | 'molestia'>[], zonaDe: ZonaDeEjercicio, zona: ZonaIem,
): { molestiasEnLaZona: number; molestiaMaxima: number | null } {
  const suyas = estado.filter(e => e.molestia && zonaDeId(zonaDe, e.exerciseId) === zona).map(e => e.molestia!);
  const notas = suyas.map(m => m.maxima).filter((v): v is number => v != null);
  return { molestiasEnLaZona: suyas.reduce((a, m) => a + m.veces, 0), molestiaMaxima: notas.length ? Math.max(...notas) : null };
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-ES');
const conSigno = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

function leerLimites(l: LimitesDelBloque | undefined, propio?: string): LimitesDelVeredicto {
  const cansancio = l?.cansancioMedio ?? null;
  const veces = l?.molestiasEnLaZona ?? 0;
  const maxima = l?.molestiaMaxima ?? null;
  const cansancioPasado = cansancio != null && cansancio >= CANSANCIO_LIMITE;
  const molestiaPasada = veces > 0;
  const textos: string[] = [];
  if (cansancioPasado) textos.push(`cansancio medio al salir de ${fmt(cansancio!)}/10`);
  if (molestiaPasada) textos.push(`molestia apuntada en ${veces} ${veces === 1 ? 'sesión' : 'sesiones'}${maxima != null ? ` (hasta ${fmt(maxima)}/10)` : ''}`);
  return {
    cansancio: { valor: cansancio, limite: CANSANCIO_LIMITE, pasado: cansancioPasado },
    molestia: { veces, maxima, pasado: molestiaPasada },
    ...(propio?.trim() ? { propio: propio.trim() } : {}),
    algunoPasado: cansancioPasado || molestiaPasada,
    textos,
  };
}

// ── Veredicto ────────────────────────────────────────────────────────────────

/** Por qué una hipótesis se queda sin probar. */
export type CausaSinProbar = 'adherencia' | 'agujetas' | 'contexto' | 'sin_medida' | 'a_dos_bloques' | 'sin_causa_clara';

export type AccionSiguiente = 'misma_linea' | 'cambiar_palanca' | 'pasar_estrella' | 'no_subir' | 'repetir';

export interface PropuestaSiguiente {
  accion: AccionSiguiente;
  /** La palanca para el bloque siguiente (si la estrella pasa a otra zona, la que tenía). */
  palanca: PalancaDeHipotesis;
  /** ¿Se sube el techo un escalón? */
  subirTecho: boolean;
  texto: string;
}

export interface VeredictoCalculado extends VeredictoDeHipotesis {
  /** Ejercicios de la zona con los que se ha medido el resultado. */
  ejerciciosQueCuentan: number;
  /** La franja del resultado (`null` = sin medida, o avanzado a la espera del segundo bloque). */
  resultado: FranjaDeResultado | null;
  /** El RM de ESTE bloque mejora más que el ruido pero menos que el objetivo. */
  mejoraSinLlegar: boolean;
  /** Avanzado: % de RM sumando el bloque anterior de la misma apuesta. */
  rmPctAcumulado?: number;
  limites: LimitesDelVeredicto;
  /** Solo con `lectura: 'sin_probar'`. */
  causa?: CausaSinProbar;
  /** La lectura, en una o dos frases para el coach. */
  texto: string;
  propuesta: PropuestaSiguiente;
}

export interface EntradaDeVeredicto {
  zona: ZonaIem;
  hipotesis: HipotesisDeZona;
  /** IEM medio semanal realizado de la zona en el bloque que se cierra
   *  (`estadoDelBloqueAnterior` aplicado a ese bloque). `null` = sin dato. */
  iemMedio: number | null;
  /** % de RM de los ejercicios de la zona (`rmDeLaZona`). */
  rm: Pick<RmDeLaZona, 'rmPct'> & Partial<Pick<RmDeLaZona, 'ejercicios'>>;
  limites?: LimitesDelBloque;
  /** Nivel del atleta (`OnboardingData.experienceLevel`). */
  nivel?: ExperienceLevel;
  /** Veredictos firmados de la zona en bloques anteriores, del más antiguo al más reciente. */
  anteriores?: readonly VeredictoDeHipotesis[];
  /** Con qué explicar un proceso sin cumplir. */
  contexto?: {
    /** Sesiones hechas de las programadas, en %. */
    adherenciaPct?: number | null;
    /** Semanas en las que las agujetas frenaron la zona. */
    semanasFrenadasPorAgujetas?: number;
    contexto?: 'favorable' | 'neutro' | 'desfavorable';
  };
}

/** Las tres franjas del resultado (`null` = no se pudo medir). */
export type FranjaDeResultado = 'cumplido' | 'parcial' | 'no_cumplido';

/**
 * En qué franja cae un % de RM frente a su objetivo (auditoría de cifras,
 * 17-11-2026): llega al objetivo → cumplido; entre el ruido de medida y el
 * objetivo → parcial («mejora, menos de lo buscado»); por debajo del ruido →
 * no cumplido. Con objetivo de no perder (0: recuperar o déficit) no hay
 * franja intermedia: vale mientras no caiga más que el ruido.
 */
export function franjaDeResultado(rmPct: number | null | undefined, rmObjetivoPct: number): FranjaDeResultado | null {
  if (rmPct == null) return null;
  if (rmObjetivoPct <= 0) return rmPct > -RM_RUIDO_PCT ? 'cumplido' : 'no_cumplido';
  if (rmPct >= rmObjetivoPct) return 'cumplido';
  return rmPct >= RM_RUIDO_PCT ? 'parcial' : 'no_cumplido';
}

/**
 * La lectura que sale de cruzar proceso y resultado (`null` = no se pudo
 * medir). El resultado admite un booleano por comodidad (sí / no, sin franja
 * intermedia).
 */
export function lecturaDe(procesoCumplido: boolean | null, resultado: FranjaDeResultado | boolean | null): LecturaDeHipotesis {
  if (resultado == null) return 'sin_probar';
  const franja: FranjaDeResultado = resultado === true ? 'cumplido' : resultado === false ? 'no_cumplido' : resultado;
  // Sin objetivo de proceso se juzga solo por el resultado, como si se hubiera hecho.
  if (procesoCumplido !== false) return franja === 'cumplido' ? 'confirmada' : franja === 'parcial' ? 'mejora_parcial' : 'no_responde';
  // No se dio el estímulo previsto: si aun así mejora más que el ruido, responde con menos.
  return franja === 'no_cumplido' ? 'sin_probar' : 'responde_con_menos';
}

const acumular = (a: number, b: number) => ((1 + a / 100) * (1 + b / 100) - 1) * 100;

function causaDe(c: EntradaDeVeredicto['contexto']): CausaSinProbar {
  if (c?.adherenciaPct != null && c.adherenciaPct < ADHERENCIA_BAJA_PCT) return 'adherencia';
  if ((c?.semanasFrenadasPorAgujetas ?? 0) >= SEMANAS_DE_FRENO_QUE_EXPLICAN) return 'agujetas';
  if (c?.contexto === 'desfavorable') return 'contexto';
  return 'sin_causa_clara';
}

const ARREGLO: Record<CausaSinProbar, string> = {
  adherencia: 'la causa fue la adherencia: antes de tocar el plan, que las sesiones se hagan (menos días o sesiones más cortas si hace falta)',
  agujetas: 'el freno fueron las agujetas: reparte la carga de la zona en más días o quita trabajo en estiramiento para poder subir',
  contexto: 'el contexto no acompañó (sueño, estrés o motivación): repite cuando acompañe, sin subir el techo',
  sin_medida: `no hubo marcas para medirlo: que apunte el RIR y haga alguna serie de ${REPS_MIN_RM} a ${REPS_MAX_RM} repeticiones a RIR ${RIR_MAX_RM} o menos en los ejercicios de la zona`,
  a_dos_bloques: 'en un avanzado se juzga a dos bloques: misma apuesta uno más y se suman',
  sin_causa_clara: 'no hay una causa clara: revisa si el techo era realista antes de repetir',
};

export function veredictoDeHipotesis(e: EntradaDeVeredicto): VeredictoCalculado {
  const { zona, hipotesis: h } = e;
  const nombre = nombreCortoDeZona(zona);
  const palanca = h.palanca;
  const rmObjetivoPct = h.rmObjetivoPct ?? RM_OBJETIVO_PCT;
  const limites = leerLimites(e.limites, h.limite);

  // ── Proceso ────────────────────────────────────────────────────────────────
  const iemMedio = e.iemMedio == null ? null : redondearIem(e.iemMedio);
  let procesoCumplido: boolean | null = null;
  let textoProceso: string;
  if (palanca === 'recuperar') {
    // Aquí el proceso es BAJAR: cumplido si la media no pasa del techo (con un margen del 5 %).
    if (iemMedio != null && h.iemTecho != null) procesoCumplido = iemMedio <= h.iemTecho * (2 - FRACCION_DE_SOSTENER);
    textoProceso = procesoCumplido == null ? 'sin cifra de proceso'
      : `IEM medio ${fmt(iemMedio!)} con tope de ${fmt(h.iemTecho!)}: ${procesoCumplido ? 'se bajó lo previsto' : 'no se bajó lo previsto'}`;
  } else {
    if (iemMedio != null && h.iemMedioObjetivo != null && h.iemMedioObjetivo > 0) {
      // Sin tolerancia: el objetivo guardado ya es el umbral (auditoría de cifras, 17-11-2026).
      procesoCumplido = iemMedio >= h.iemMedioObjetivo;
    }
    textoProceso = procesoCumplido == null ? 'sin objetivo de proceso: se juzga solo por el resultado'
      : `IEM medio ${fmt(iemMedio!)} de ${fmt(h.iemMedioObjetivo!)} previstos: ${procesoCumplido ? 'se hizo' : 'no se llegó'}`;
  }

  // ── Resultado ──────────────────────────────────────────────────────────────
  const rmPct = e.rm.rmPct == null ? null : redondearIem(e.rm.rmPct);
  let franja: FranjaDeResultado | null = franjaDeResultado(rmPct, rmObjetivoPct);
  const mejoraSinLlegar = franja === 'parcial';
  let rmPctAcumulado: number | undefined;
  let esperaAlSegundo = false;
  let textoResultado: string;
  if (rmPct == null) {
    textoResultado = 'sin marcas suficientes para medir el RM';
  } else if (rmObjetivoPct <= 0) {
    // Objetivo de no perder (recuperar o déficit): vale mientras no caiga más que el ruido.
    textoResultado = `RM ${conSigno(rmPct)} %: ${franja === 'cumplido' ? 'se mantiene' : 'ha bajado'}`;
  } else if (franja === 'cumplido') {
    textoResultado = `RM ${conSigno(rmPct)} % (objetivo +${fmt(rmObjetivoPct)} %)`;
  } else {
    textoResultado = mejoraSinLlegar ? `RM ${conSigno(rmPct)} %: mejora, pero menos de lo buscado (+${fmt(rmObjetivoPct)} %)`
      : rmPct <= -RM_RUIDO_PCT ? `RM ${conSigno(rmPct)} %: ha bajado`
        : `RM ${conSigno(rmPct)} %: sin cambio medible (por debajo del ${RM_RUIDO_PCT} % es ruido)`;
    if (e.nivel === 'avanzado') {
      // Se juzga a dos bloques: se suma el anterior si fue la misma apuesta,
      // y lo sumado se lee con las mismas tres franjas.
      const previo = e.anteriores?.[e.anteriores.length - 1];
      if (BLOQUES_PARA_JUZGAR_A_UN_AVANZADO >= 2 && previo && previo.palanca === palanca && previo.rmPct != null) {
        rmPctAcumulado = redondearIem(acumular(previo.rmPct, rmPct));
        franja = franjaDeResultado(rmPctAcumulado, rmObjetivoPct);
        textoResultado = `RM ${conSigno(rmPct)} % en este bloque y ${conSigno(rmPctAcumulado)} % sumando el anterior (objetivo +${fmt(rmObjetivoPct)} % a dos bloques)`;
      } else {
        franja = null;
        esperaAlSegundo = true;
        textoResultado = `RM ${conSigno(rmPct)} %: en un avanzado el +${fmt(rmObjetivoPct)} % se juzga a dos bloques`;
      }
    }
  }
  const resultadoCumplido: boolean | null = franja == null ? null : franja === 'cumplido';

  const lectura = lecturaDe(procesoCumplido, franja);
  const causa: CausaSinProbar | undefined = lectura !== 'sin_probar' ? undefined
    : rmPct == null && procesoCumplido !== false ? 'sin_medida'
      : esperaAlSegundo && procesoCumplido !== false ? 'a_dos_bloques'
        : causaDe(e.contexto);

  // ── Texto y propuesta para el bloque siguiente ─────────────────────────────
  const etiqueta = PALANCAS[palanca].etiqueta;
  const cabecera: Record<LecturaDeHipotesis, string> = {
    confirmada: `${nombre}: confirmada. Se hizo y sirvió: responde a ${etiqueta}.`,
    mejora_parcial: `${nombre}: mejora, menos de lo buscado. Se hizo lo previsto y el RM sube más que el ruido de medida sin llegar al objetivo.`,
    no_responde: `${nombre}: no responde. Se hizo lo previsto y el RM no acompaña: ${etiqueta} no es su palanca ahora.`,
    responde_con_menos: `${nombre}: responde con menos. No se llegó al estímulo previsto y aun así mejora.`,
    sin_probar: `${nombre}: sin probar. ${causa === 'a_dos_bloques' ? 'Falta el segundo bloque para juzgarla.' : causa === 'sin_medida' ? 'No hay con qué medir el resultado.' : 'No se dio el estímulo previsto, así que no dice nada de la zona.'}`,
  };
  const aviso = limites.algunoPasado ? ` Límite pasado: ${limites.textos.join(' y ')}.` : '';
  const texto = `${cabecera[lectura]} ${textoProceso[0].toUpperCase()}${textoProceso.slice(1)}; ${textoResultado}.${aviso}`;

  const anteriores = e.anteriores ?? [];
  let propuesta: PropuestaSiguiente;
  if (lectura === 'confirmada') {
    const subirTecho = !limites.algunoPasado && PALANCAS[palanca].sube;
    // Con objetivo de no perder (bloque en déficit) lo confirmado es que sostuvo
    // sin perder fuerza: subir o no depende de si el bloque siguiente sigue en déficit.
    const noPerder = rmObjetivoPct <= 0;
    propuesta = {
      accion: 'misma_linea', palanca, subirTecho,
      texto: subirTecho && noPerder ? `Misma línea: sigue con ${etiqueta}. Sostuvo el estímulo sin perder fuerza; el techo sube un escalón cuando el bloque ya no vaya en déficit.`
        : subirTecho ? `Misma línea: sigue con ${etiqueta} y sube el techo un escalón.`
        : limites.algunoPasado ? `Misma línea (${etiqueta}), pero sin subir el techo: se pasó un límite (${limites.textos.join(' y ')}).`
          : `Misma línea (${etiqueta}), sin subir el techo.`,
    };
  } else if (lectura === 'mejora_parcial') {
    // Misma línea SIN escalón, y no cuenta como «no responde»: ni cambia la
    // palanca ni acerca la estrella a soltarse (auditoría de cifras, 17-11-2026).
    propuesta = {
      accion: 'misma_linea', palanca, subirTecho: false,
      texto: `Misma línea (${etiqueta}), sin subir el techo: mejora, pero menos de lo buscado. No cuenta como «no responde»: ni se cambia de palanca ni se mueve la estrella.`,
    };
  } else if (lectura === 'no_responde') {
    const seguidos = seguidosAlFinal(anteriores, 'no_responde') + 1;
    if (seguidos >= NO_RESPONDE_PARA_SOLTAR_ESTRELLA) {
      propuesta = {
        accion: 'pasar_estrella', palanca, subirTecho: false,
        texto: `${seguidos === 2 ? 'Segunda' : `${seguidos}.ª`} vez seguida sin responder: la estrella pasa a otra zona y esta se queda en mantener.`,
      };
    } else {
      const fallaron = (Object.keys(PALANCAS) as PalancaDeHipotesis[])
        .filter(p => [...anteriores].reverse().find(v => v.palanca === p)?.lectura === 'no_responde');
      const nueva = otraPalanca(palanca, fallaron);
      propuesta = {
        accion: 'cambiar_palanca', palanca: nueva, subirTecho: PALANCAS[nueva].sube,
        texto: `Cambia de palanca: de ${etiqueta} a ${PALANCAS[nueva].etiqueta}. Si tampoco responde, la estrella pasa a otra zona.`,
      };
    }
  } else if (lectura === 'responde_con_menos') {
    propuesta = {
      accion: 'no_subir', palanca, subirTecho: false,
      texto: 'No subas: mejora con menos estímulo del previsto. Repite el mismo techo y guarda la subida para cuando deje de mejorar.',
    };
  } else {
    propuesta = {
      accion: 'repetir', palanca, subirTecho: false,
      texto: `Repite la hipótesis arreglando la causa: ${ARREGLO[causa!]}.`,
    };
  }

  // Con molestia apuntada en la zona, además: vigilar sus articulaciones en el
  // bloque siguiente (Dani, 18-11-2026). Vale para cualquier lectura.
  const vigilar = limites.molestia.pasado ? textoDeVigilar(zona) : null;
  if (vigilar) propuesta = { ...propuesta, texto: `${propuesta.texto} ${vigilar}.` };

  return {
    zona, palanca,
    iemMedio,
    ...(h.iemMedioObjetivo != null ? { iemMedioObjetivo: h.iemMedioObjetivo } : {}),
    procesoCumplido,
    rmPct, rmObjetivoPct, resultadoCumplido,
    lectura,
    ejerciciosQueCuentan: e.rm.ejercicios?.length ?? 0,
    resultado: franja,
    mejoraSinLlegar,
    ...(rmPctAcumulado != null ? { rmPctAcumulado } : {}),
    limites,
    ...(causa ? { causa } : {}),
    texto,
    propuesta,
  };
}

/**
 * Los veredictos de todas las hipótesis de un bloque, en el orden de las
 * zonas. Junta lo que ya calculan los demás motores: el estado del bloque
 * (`estadoDelBloqueAnterior` sobre el bloque que se cierra), la progresión
 * por ejercicio del cierre y la asignación ejercicio → zona.
 */
export function veredictosDelBloque(o: {
  hipotesis: Partial<Record<string, HipotesisDeZona>> | undefined;
  estado: Pick<EstadoDelBloque, 'porZona'>;
  progresion: ReadonlyArray<Pick<ProgresionEjercicio, 'exerciseId' | 'nombre' | 'deltaPct' | 'metrica'>>;
  zonaDe: ZonaDeEjercicio;
  /** Estado por ejercicio (`estadoDeLosEjercicios`), para las molestias de cada zona. */
  ejercicios?: readonly Pick<EstadoDeEjercicio, 'exerciseId' | 'molestia'>[];
  cansancioMedio?: number | null;
  nivel?: ExperienceLevel;
  /** Bloques ANTERIORES del atleta con su cierre firmado. */
  historial?: readonly BloqueConCierre[];
  contexto?: EntradaDeVeredicto['contexto'];
  /** Semanas frenadas por agujetas, zona a zona (manda sobre `contexto`). */
  semanasFrenadasPorZona?: Partial<Record<ZonaIem, number>>;
}): VeredictoCalculado[] {
  return ZONAS_IEM.flatMap(z => {
    const h = o.hipotesis?.[z.clave];
    if (!h) return [];
    const frenadas = o.semanasFrenadasPorZona?.[z.clave];
    return [veredictoDeHipotesis({
      zona: z.clave, hipotesis: h,
      // Con referencia propia, sin las semanas de referencia (`referenciaPropia.ts`).
      iemMedio: estadoParaElProceso(o.estado.porZona[z.clave], h).iemMedio,
      rm: rmDeLaZona({ zona: z.clave, ejercicios: o.progresion, zonaDe: o.zonaDe }),
      limites: { cansancioMedio: o.cansancioMedio, ...(o.ejercicios ? molestiasDeLaZona(o.ejercicios, o.zonaDe, z.clave) : {}) },
      nivel: o.nivel,
      anteriores: veredictosDeLaZona(o.historial ?? [], z.clave).map(v => v.veredicto),
      contexto: frenadas != null ? { ...o.contexto, semanasFrenadasPorAgujetas: frenadas } : o.contexto,
    })];
  });
}

/** Lo que se guarda de un veredicto (`VeredictoDeHipotesis`), sin lo calculado para la pantalla ni campos vacíos. */
export function veredictoParaGuardar(v: VeredictoDeHipotesis, decision?: string): VeredictoDeHipotesis {
  const texto = (decision ?? v.decision)?.trim();
  return {
    zona: v.zona, palanca: v.palanca, iemMedio: v.iemMedio,
    ...(v.iemMedioObjetivo != null ? { iemMedioObjetivo: v.iemMedioObjetivo } : {}),
    procesoCumplido: v.procesoCumplido, rmPct: v.rmPct, rmObjetivoPct: v.rmObjetivoPct,
    resultadoCumplido: v.resultadoCumplido, lectura: v.lectura,
    ...(texto ? { decision: texto } : {}),
  };
}

/**
 * El cierre que firma el coach (`Mesocycle.cierreDeHipotesis`). `decisiones`
 * es lo que decide para cada zona, en sus palabras; `lecturas`, por si
 * corrige la lectura de la app en alguna; `dosis`, la foto de «dosis y
 * respuesta» del bloque (`respuestaADosis.ts`), que se guarda tal cual.
 */
export function cierreParaGuardar(o: {
  veredictos: readonly VeredictoDeHipotesis[];
  firmadoEn: string;
  decisiones?: Partial<Record<string, string>>;
  lecturas?: Partial<Record<string, LecturaDeHipotesis>>;
  ficha?: CierreDeHipotesis['ficha'];
  dosis?: readonly DosisDeZona[] | null;
}): CierreDeHipotesis {
  const ficha = o.ficha ? Object.fromEntries(Object.entries(o.ficha).filter(([, v]) => v != null && v !== '')) as CierreDeHipotesis['ficha'] : undefined;
  return {
    firmadoEn: o.firmadoEn,
    veredictos: o.veredictos.map(v => veredictoParaGuardar({ ...v, lectura: o.lecturas?.[v.zona] ?? v.lectura }, o.decisiones?.[v.zona])),
    ...(ficha && Object.keys(ficha).length ? { ficha } : {}),
    // Copia limpia: solo los campos del tipo (lo que llegue de más no va a Firestore).
    ...(o.dosis?.length ? {
      dosis: o.dosis.map(d => ({
        zona: d.zona, seriesSemana: d.seriesSemana, frecuencia: d.frecuencia, rirMedio: d.rirMedio,
        iemMedio: d.iemMedio, rmPct: d.rmPct, ejercicios: d.ejercicios,
      })),
    } : {}),
  };
}
