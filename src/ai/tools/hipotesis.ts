// La HIPÓTESIS del bloque, como la lee el asistente (H11, 17-11-2026).
//
// Cada bloque lleva un tipo (`Mesocycle.tipoBloque`) y una hipótesis por zona
// prioritaria (`Mesocycle.hipotesis`): a qué se apuesta, cómo se sabrá si se
// hizo y cómo se sabrá si sirvió. Al cerrarlo, Dani firma qué pasó
// (`cierreDeHipotesis`) y de todos los cierres sale el mapa de respuesta del
// atleta. Hasta hoy nada de eso llegaba al asistente: proponía el bloque
// siguiente sin saber qué se había apostado en el anterior ni qué salió.
//
// Puro: solo ordena lo que ya está guardado. No calcula veredictos (eso es
// `veredicto.ts`, y lo firma Dani).
import type { DosisDeZona, HipotesisDeZona, MuscleGroup, MuscleGroupConfig, TipoDeBloque } from '../../types.js';
import { MUSCLE_LABELS, MUSCLE_ORDER } from '../../types.js';
import { esZonaIem } from '../../utils/cdg/zonas.js';
import { IEM_ZONA_ALTA, RM_RUIDO_PCT, SEMANAS_POR_DEFECTO } from '../../utils/hipotesisDeBloque/cifras.js';
import { ordenarBloques, type BloqueConCierre } from '../../utils/hipotesisDeBloque/historial.js';
import { mapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta.js';
import { PALANCAS } from '../../utils/hipotesisDeBloque/palancas.js';
import { rmObjetivoPorDefecto } from '../../utils/hipotesisDeBloque/proponerHipotesis.js';
import {
  DIFERENCIA_MINIMA_RM, fotosDeLosBloques, indiciosDeRespuesta, indiciosParaElAsistente,
} from '../../utils/hipotesisDeBloque/respuestaADosis.js';
import { TIPOS_DE_BLOQUE, estrellasDe, nombreCortoDeZona } from '../../utils/hipotesisDeBloque/tiposDeBloque.js';

/** Los cuatro valores que acepta `tipo_bloque` en las propuestas. */
export const TIPOS_DE_BLOQUE_VALIDOS: readonly TipoDeBloque[] = ['primer', 'desarrollo', 'especializacion', 'mantenimiento'];

export function esTipoDeBloque(v: unknown): v is TipoDeBloque {
  return typeof v === 'string' && (TIPOS_DE_BLOQUE_VALIDOS as readonly string[]).includes(v);
}

/** Semanas de un bloque cuando el asistente no las dice: las del tipo (8 el
 *  primer bloque) o, sin tipo, las 12 del bloque estándar. */
export function semanasPorDefectoDe(tipo: unknown): number {
  return esTipoDeBloque(tipo) ? TIPOS_DE_BLOQUE[tipo].semanas : SEMANAS_POR_DEFECTO;
}

/** Lo que hace falta del mesociclo para contarle su hipótesis al asistente. */
export type BloqueParaElAsistente = BloqueConCierre & { semana1Reducida?: boolean; groups?: Partial<Record<MuscleGroup, MuscleGroupConfig>> };

export interface HipotesisParaElAsistente {
  /** `null` en los bloques de antes del sistema de hipótesis. */
  tipoBloque: TipoDeBloque | null;
  tipoBloqueEtiqueta?: string;
  semana1Reducida?: boolean;
  /** Una por zona con estrella, en el orden del método. */
  hipotesis: Array<{
    zona: string; nombre: string; palanca: HipotesisDeZona['palanca']; apuesta: string;
    /** RESULTADO que se busca: % de RM estimado medio de los ejercicios de la
     *  zona. 0 = no perder (zona que se recupera o bloque en déficit). */
    rmObjetivoPct: number;
    iemMedioAnterior?: number; iemFinalAnterior?: number; iemMedioObjetivo?: number; iemArranque?: number; iemTecho?: number;
    limite?: string;
  }>;
  /** Grupos que el bloque ignora (0 series, fuera de sugerencias y avisos). */
  gruposIgnorados?: string[];
  /** Solo si Dani ha firmado el cierre de este bloque. */
  cierreDeHipotesis?: NonNullable<BloqueConCierre['cierreDeHipotesis']>;
  /** Qué le funciona a cada zona, con los cierres firmados hasta este bloque. */
  mapaDeRespuesta?: string;
  /** A qué responde (volumen, frecuencia, cercanía al fallo): indicios de las
   *  fotos de dosis y respuesta hasta este bloque, cada uno con sus casos. */
  indiciosDeRespuesta?: ReturnType<typeof indiciosParaElAsistente>;
}

/**
 * Tipo de bloque, hipótesis, cierre firmado y mapa de respuesta de `meso`.
 * `bloques` son todos los del atleta: el mapa sale de los que tienen el
 * cierre firmado y empezaron antes o a la vez que este (el asistente que lee
 * un bloque pasado no debe ver lo que se supo después).
 */
export function hipotesisParaElAsistente(
  meso: BloqueParaElAsistente, bloques: readonly BloqueParaElAsistente[] = [meso],
  /** La foto de este bloque calculada ahora (`CierreCompleto.hipotesis.dosis`), si aún no está firmada. */
  dosisDeEste?: readonly DosisDeZona[] | null,
): HipotesisParaElAsistente {
  const hipotesis = estrellasDe(meso).map(zona => {
    const h = meso.hipotesis![zona]!;
    return {
      zona, nombre: nombreCortoDeZona(zona), palanca: h.palanca, apuesta: PALANCAS[h.palanca]?.apuesta ?? '',
      // Un 0 guardado es «no perder» (recuperar o déficit) y se cuenta tal cual:
      // hasta la auditoría de cifras del 17-11-2026 se le decía un 5 %.
      rmObjetivoPct: h.rmObjetivoPct != null && h.rmObjetivoPct >= 0 ? h.rmObjetivoPct : rmObjetivoPorDefecto({ palanca: h.palanca }),
      ...(h.iemMedioAnterior != null ? { iemMedioAnterior: h.iemMedioAnterior } : {}),
      ...(h.iemFinalAnterior != null ? { iemFinalAnterior: h.iemFinalAnterior } : {}),
      ...(h.iemMedioObjetivo != null ? { iemMedioObjetivo: h.iemMedioObjetivo } : {}),
      ...(h.iemArranque != null ? { iemArranque: h.iemArranque } : {}),
      ...(h.iemTecho != null ? { iemTecho: h.iemTecho } : {}),
      ...(h.limite?.trim() ? { limite: h.limite.trim() } : {}),
    };
  });
  const ignorados = MUSCLE_ORDER.filter(g => meso.groups?.[g]?.priority === 'ignorar').map(g => MUSCLE_LABELS[g]);
  const cierre = meso.cierreDeHipotesis;
  const hastaEste = ordenarBloques([...bloques.filter(b => b.id !== meso.id), meso])
    .filter(b => b.startDate <= meso.startDate && (b.cierreDeHipotesis?.veredictos.some(v => esZonaIem(v.zona)) ?? false));
  const mapa = hastaEste.length ? mapaDeRespuesta(hastaEste).frase : '';
  const indicios = indiciosDeRespuesta(fotosDeLosBloques([...bloques.filter(b => b.id !== meso.id), meso], {
    hasta: meso.startDate, actual: dosisDeEste?.length ? { mesocycleId: meso.id, dosis: dosisDeEste } : null,
  }));
  return {
    tipoBloque: meso.tipoBloque ?? null,
    ...(meso.tipoBloque ? { tipoBloqueEtiqueta: TIPOS_DE_BLOQUE[meso.tipoBloque].etiqueta } : {}),
    ...(meso.semana1Reducida != null ? { semana1Reducida: meso.semana1Reducida } : {}),
    hipotesis,
    ...(ignorados.length ? { gruposIgnorados: ignorados } : {}),
    ...(cierre ? { cierreDeHipotesis: cierre } : {}),
    ...(mapa ? { mapaDeRespuesta: mapa } : {}),
    ...(indicios.length ? { indiciosDeRespuesta: indiciosParaElAsistente(indicios) } : {}),
  };
}

/**
 * Cómo leer lo anterior, para la `note` de la tool. Desde la auditoría de
 * cifras del 17-11-2026 explica también las cifras que cambiaron: el proceso
 * se pide sobre donde acabó el bloque anterior, el resultado se lee en tres
 * franjas y el objetivo depende del caso.
 */
export const NOTA_DE_HIPOTESIS = [
  'tipoBloque e hipotesis: a qué se apostó en cada zona prioritaria y con qué % de RM se da por buena (rmObjetivoPct: 5 por defecto, 8 en un principiante, 0 = no perder, que es lo que se pide a una zona que se recupera o con el bloque en déficit).',
  'iemMedioObjetivo es el PROCESO: el IEM medio del bloque que hay que alcanzar, calculado sobre donde ACABÓ el bloque anterior (iemFinalAnterior) y no sobre su media; si la zona no sube, es sostener ese nivel.',
  `iemTecho igual a iemFinalAnterior significa que la zona NO sube este bloque (déficit, respondió con menos, mejoró menos de lo buscado o zona ya alta: ${IEM_ZONA_ALTA} de IEM o más).`,
  `cierreDeHipotesis (si Dani lo ha firmado): qué pasó con cada apuesta. Lecturas: confirmada (se hizo y sirvió); mejora_parcial (se hizo y el RM mejora más que el ruido de medida, ${RM_RUIDO_PCT} %, sin llegar al objetivo: NO es «no responde», se sigue la misma línea sin subir el techo y no se cambia de palanca ni se mueve la estrella); no_responde (se hizo y el RM no supera el ruido: cambia la palanca y, a la segunda seguida, la estrella pasa a otra zona); responde_con_menos (no se llegó al estímulo y aun así mejora: no subir); sin_probar (no se hizo o no se pudo medir: no dice nada de la zona).`,
  'mapaDeRespuesta: qué le funciona a cada zona en todos sus bloques; el bloque siguiente parte de ahí.',
  `indiciosDeRespuesta: si le va mejor con más volumen (series por semana), más frecuencia (días por semana) o más cerca del fallo (RIR medio). Son PISTAS, no conclusiones: cada una trae con cuántos casos se sostiene (casos) y sus cifras; dilo siempre así («un indicio, 1 caso»). grado se_repite = misma dirección en 2 comparaciones independientes; indicio = una sola. alcance misma_zona (la misma zona en dos bloques, lo más fiable) o entre_zonas (zonas distintas del mismo bloque: siempre orientativo). Solo hay diferencia si es de ${DIFERENCIA_MINIMA_RM} puntos de RM o más; sin_diferencia también es información; sin_atribuir = cambiaron dos variables a la vez y no se puede separar. La frecuencia no es una palanca de la hipótesis: es una recomendación.`,
].join(' ');
