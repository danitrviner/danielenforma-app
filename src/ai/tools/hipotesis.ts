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
import type { HipotesisDeZona, MuscleGroup, MuscleGroupConfig, TipoDeBloque } from '../../types.js';
import { MUSCLE_LABELS, MUSCLE_ORDER } from '../../types.js';
import { esZonaIem } from '../../utils/cdg/zonas.js';
import { RM_OBJETIVO_PCT, SEMANAS_POR_DEFECTO } from '../../utils/hipotesisDeBloque/cifras.js';
import { ordenarBloques, type BloqueConCierre } from '../../utils/hipotesisDeBloque/historial.js';
import { mapaDeRespuesta } from '../../utils/hipotesisDeBloque/mapaDeRespuesta.js';
import { PALANCAS } from '../../utils/hipotesisDeBloque/palancas.js';
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
    /** RESULTADO que se busca: % de RM estimado medio de los ejercicios de la zona. */
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
}

/**
 * Tipo de bloque, hipótesis, cierre firmado y mapa de respuesta de `meso`.
 * `bloques` son todos los del atleta: el mapa sale de los que tienen el
 * cierre firmado y empezaron antes o a la vez que este (el asistente que lee
 * un bloque pasado no debe ver lo que se supo después).
 */
export function hipotesisParaElAsistente(meso: BloqueParaElAsistente, bloques: readonly BloqueParaElAsistente[] = [meso]): HipotesisParaElAsistente {
  const hipotesis = estrellasDe(meso).map(zona => {
    const h = meso.hipotesis![zona]!;
    return {
      zona, nombre: nombreCortoDeZona(zona), palanca: h.palanca, apuesta: PALANCAS[h.palanca]?.apuesta ?? '',
      rmObjetivoPct: h.rmObjetivoPct != null && h.rmObjetivoPct > 0 ? h.rmObjetivoPct : RM_OBJETIVO_PCT,
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
  return {
    tipoBloque: meso.tipoBloque ?? null,
    ...(meso.tipoBloque ? { tipoBloqueEtiqueta: TIPOS_DE_BLOQUE[meso.tipoBloque].etiqueta } : {}),
    ...(meso.semana1Reducida != null ? { semana1Reducida: meso.semana1Reducida } : {}),
    hipotesis,
    ...(ignorados.length ? { gruposIgnorados: ignorados } : {}),
    ...(cierre ? { cierreDeHipotesis: cierre } : {}),
    ...(mapa ? { mapaDeRespuesta: mapa } : {}),
  };
}

/** Cómo leer lo anterior, en una frase para la `note` de la tool. */
export const NOTA_DE_HIPOTESIS = 'tipoBloque e hipotesis: a qué se apostó en cada zona prioritaria y con qué % de RM se da por buena. cierreDeHipotesis (si Dani lo ha firmado): qué pasó con cada apuesta. mapaDeRespuesta: qué le funciona a cada zona en todos sus bloques; el bloque siguiente parte de ahí.';
