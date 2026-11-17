import type { HipotesisDeZona, PalancaDeHipotesis, TipoDeBloque } from '../../types.js';
import { VELOCIDADES, type Sensibilidad, type Velocidad } from '../cdg/agujetas.js';
import { ZONAS_IEM, type ZonaIem } from '../cdg/zonas.js';
import {
  ESCALONES_DE_TECHO, FRACCION_DE_MANTENER, NO_RESPONDE_PARA_SOLTAR_ESTRELLA, REDUCCION_SEMANA_1_PCT,
  RM_OBJETIVO_PCT, SUBIDA_DE_PROCESO_PCT, redondearIem,
} from './cifras.js';
import type { EstadoDeZona, EstadoDelBloque } from './estadoDelBloqueAnterior.js';
import { seguidosAlFinal, veredictosDeLaZona, type BloqueConCierre } from './historial.js';
import { PALANCAS, PALANCA_POR_DEFECTO, otraPalanca } from './palancas.js';
import { TIPOS_DE_BLOQUE, avisoDeEstrellas, modoPorZonaDe, nombreCortoDeZona } from './tiposDeBloque.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La hipótesis que la app propone para cada zona con estrella (17-11-2026)

   Al abrir un bloque, por cada zona prioritaria: a qué se apuesta (palanca),
   cómo se sabrá si se HIZO (proceso: IEM medio del bloque) y si SIRVIÓ
   (resultado: RM estimado de sus ejercicios). Es una propuesta: el coach la
   edita y lo que firma es lo que se guarda en `Mesocycle.hipotesis`.

   Las cifras salen de cómo acabó el bloque anterior (`estadoDelBloqueAnterior`):

     arranque  = donde acabó el anterior (un 7 % menos con la semana 1 reducida;
                 la semana 2 vuelve a donde acabó);
     techo     = donde acabó + un escalón de la velocidad (16 → 17,6 en suave);
     proceso   = media del anterior + 10 %, sin pasar del techo;
     resultado = +5 % de RM estimado.

   El techo es el mismo número que `cdgObjetivosIem[zona]`: lo lee el
   protocolo semanal (`propuestaZona`) y por encima no propone subir. Esto va
   ENCIMA de ese protocolo, no lo sustituye: aquí se fija hasta dónde, y cada
   semana las agujetas y el contexto deciden si se sube.

   Sin bloque anterior no hay cifras de IEM: solo palanca y objetivo de
   resultado.
   ═══════════════════════════════════════════════════════════════════════════ */

const pctDeVelocidad = (v: Velocidad) => VELOCIDADES.find(x => x.value === v)!.pct;

/** Qué se hace con una zona sin estrella. */
export type TratoDelResto = 'como_estaba' | 'mantener' | 'ignorar';

/**
 * Las cifras de una hipótesis para una palanca. Sirve también para recalcular
 * cuando el coach cambia la palanca a mano.
 *
 *  · volumen / intensidad: suben el estímulo (las dos mueven el IEM: una por
 *    series y otra por RIR). `subir: false` las deja en el techo anterior.
 *  · ejercicios: el mismo estímulo con otros ejercicios: no se sube.
 *  · recuperar: la zona baja a mantener (la mitad) y lo que se pide del RM es
 *    no perderlo (objetivo 0).
 */
export function cifrasDeHipotesis(o: {
  palanca: PalancaDeHipotesis;
  estado?: Pick<EstadoDeZona, 'iemMedio' | 'iemFinal'> | null;
  velocidad?: Velocidad;
  semana1Reducida?: boolean;
  /** `false` = no subir aunque la palanca suba (la zona respondió con menos). */
  subir?: boolean;
  rmObjetivoPct?: number;
  limite?: string;
}): HipotesisDeZona {
  const { palanca, estado } = o;
  const rmObjetivoPct = o.rmObjetivoPct ?? (palanca === 'recuperar' ? 0 : RM_OBJETIVO_PCT);
  const limite = o.limite?.trim() ? { limite: o.limite.trim() } : {};
  if (!estado || !(estado.iemFinal > 0.005)) return { palanca, rmObjetivoPct, ...limite };

  const { iemMedio: media, iemFinal: final } = estado;
  const base = { palanca, iemMedioAnterior: redondearIem(media), iemFinalAnterior: redondearIem(final) };
  if (palanca === 'recuperar') {
    const mitad = redondearIem(final * FRACCION_DE_MANTENER);
    return { ...base, iemArranque: mitad, iemTecho: mitad, rmObjetivoPct, ...limite };
  }
  const sube = PALANCAS[palanca].sube && o.subir !== false;
  const escalon = pctDeVelocidad(o.velocidad ?? 'suave') * ESCALONES_DE_TECHO;
  const techo = sube ? final * (1 + escalon / 100) : final;
  const arranque = o.semana1Reducida ? final * (1 - REDUCCION_SEMANA_1_PCT / 100) : final;
  const objetivo = Math.min(sube ? media * (1 + SUBIDA_DE_PROCESO_PCT / 100) : media, techo);
  return {
    ...base,
    iemMedioObjetivo: redondearIem(objetivo),
    iemArranque: redondearIem(arranque),
    iemTecho: redondearIem(techo),
    rmObjetivoPct,
    ...limite,
  };
}

export interface EntradaDeHipotesis {
  tipo: TipoDeBloque;
  /** Las zonas con estrella del bloque nuevo. */
  estrellas: readonly ZonaIem[];
  /** Por defecto, la del tipo de bloque (suave). */
  velocidad?: Velocidad;
  semana1Reducida?: boolean;
  /** Cómo acabó el bloque anterior. Sin él (primer bloque), no hay cifras de IEM. */
  anterior?: Pick<EstadoDelBloque, 'porZona'> | null;
  /** Los bloques anteriores del atleta con su cierre firmado, en cualquier orden. */
  historial?: readonly BloqueConCierre[];
  /** Palanca que el coach ya ha elegido a mano para alguna zona: manda. */
  palancas?: Partial<Record<ZonaIem, PalancaDeHipotesis>>;
  /** Límite propio de alguna zona, en palabras del coach: se conserva. */
  limites?: Partial<Record<ZonaIem, string>>;
  /** Qué hacer con zonas sin estrella. Sin decir nada, lo que marque el tipo
   *  (mantenimiento y especialización: mantener; el resto: como estaban). */
  resto?: Partial<Record<ZonaIem, TratoDelResto>>;
}

export interface PropuestaDeHipotesis {
  /** Una por zona con estrella: lo que iría a `Mesocycle.hipotesis`. */
  hipotesis: Partial<Record<ZonaIem, HipotesisDeZona>>;
  /** El techo de cada zona con estrella: lo que iría a `Mesocycle.cdgObjetivosIem`. */
  cdgObjetivosIem: Partial<Record<ZonaIem, number>>;
  /** Estrella = dinámico; resto = estático: lo que iría a `Mesocycle.cdgModoPorZona`. */
  cdgModoPorZona: Record<ZonaIem, Sensibilidad>;
  /**
   * IEM semanal al que se quedan las zonas SIN estrella que bajan: la mitad
   * de donde acabaron (mantener) o 0 (ignorar). No va a `cdgObjetivosIem`
   * —ahí una cifra marca la zona como «objetivo» y la pone a subir—: es la
   * referencia para programar las series del resto.
   */
  iemDelResto: Partial<Record<ZonaIem, number>>;
  /** Por qué esa palanca, zona a zona. */
  porQue: Partial<Record<ZonaIem, string>>;
  avisos: string[];
}

export function proponerHipotesis(e: EntradaDeHipotesis): PropuestaDeHipotesis {
  const preset = TIPOS_DE_BLOQUE[e.tipo];
  const velocidad = e.velocidad ?? preset.velocidad;
  const estrellas = ZONAS_IEM.map(z => z.clave).filter(z => e.estrellas.includes(z));
  const historial = e.historial ?? [];
  const hipotesis: PropuestaDeHipotesis['hipotesis'] = {};
  const cdgObjetivosIem: PropuestaDeHipotesis['cdgObjetivosIem'] = {};
  const porQue: PropuestaDeHipotesis['porQue'] = {};
  const avisos: string[] = [];

  const aviso = avisoDeEstrellas(e.tipo, estrellas.length);
  if (aviso) avisos.push(aviso.texto);

  for (const zona of estrellas) {
    const veredictos = veredictosDeLaZona(historial, zona).map(v => v.veredicto);
    const ultimo = veredictos[veredictos.length - 1];
    let palanca: PalancaDeHipotesis = PALANCA_POR_DEFECTO;
    let subir = true;
    let motivo = 'Sin veredictos anteriores en esta zona: se empieza por volumen.';
    if (ultimo) {
      const etiqueta = PALANCAS[ultimo.palanca].etiqueta;
      // Una apuesta de recuperar ya cerrada no se repite: se vuelve a la de por defecto.
      const misma = ultimo.palanca === 'recuperar' ? PALANCA_POR_DEFECTO : ultimo.palanca;
      if (ultimo.lectura === 'no_responde') {
        // Las palancas cuyo ÚLTIMO veredicto en la zona fue «no responde» ya están probadas.
        const fallaron = (Object.keys(PALANCAS) as PalancaDeHipotesis[])
          .filter(p => [...veredictos].reverse().find(v => v.palanca === p)?.lectura === 'no_responde');
        palanca = otraPalanca(ultimo.palanca, fallaron);
        motivo = `No respondió a ${etiqueta}: se prueba ${PALANCAS[palanca].etiqueta}.`;
        if (seguidosAlFinal(veredictos, 'no_responde') >= NO_RESPONDE_PARA_SOLTAR_ESTRELLA) {
          avisos.push(`${nombreCortoDeZona(zona)}: ${NO_RESPONDE_PARA_SOLTAR_ESTRELLA} bloques seguidos sin responder. La estrella debería pasar a otra zona.`);
        }
      } else if (ultimo.lectura === 'responde_con_menos') {
        palanca = misma; subir = false;
        motivo = `Respondió con menos estímulo del previsto (${etiqueta}): no se sube el techo.`;
      } else if (ultimo.lectura === 'confirmada') {
        palanca = misma;
        motivo = `Confirmada el bloque anterior (${etiqueta}): misma línea, un escalón más.`;
      } else {
        palanca = misma;
        motivo = `La hipótesis anterior (${etiqueta}) no se llegó a probar: se repite.`;
      }
    }
    const elegida = e.palancas?.[zona];
    if (elegida && elegida !== palanca) { palanca = elegida; motivo = 'Palanca elegida a mano.'; }

    const h = cifrasDeHipotesis({
      palanca, estado: e.anterior?.porZona[zona], velocidad, semana1Reducida: e.semana1Reducida, subir, limite: e.limites?.[zona],
    });
    hipotesis[zona] = h;
    porQue[zona] = motivo;
    if (h.iemTecho != null) cdgObjetivosIem[zona] = h.iemTecho;
  }

  const iemDelResto: PropuestaDeHipotesis['iemDelResto'] = {};
  for (const z of ZONAS_IEM) {
    if (estrellas.includes(z.clave)) continue;
    const trato = e.resto?.[z.clave] ?? preset.resto;
    const final = e.anterior?.porZona[z.clave]?.iemFinal;
    if (trato === 'ignorar') iemDelResto[z.clave] = 0;
    else if (trato === 'mantener' && final != null && final > 0.005) iemDelResto[z.clave] = redondearIem(final * FRACCION_DE_MANTENER);
  }

  return { hipotesis, cdgObjetivosIem, cdgModoPorZona: modoPorZonaDe(estrellas, e.tipo), iemDelResto, porQue, avisos };
}
