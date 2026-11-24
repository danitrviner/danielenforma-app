import type { ExperienceLevel, HipotesisDeZona, Mesocycle, MuscleGroup, MuscleGroupConfig, PalancaDeHipotesis, TipoDeBloque } from '../../types';
import { VELOCIDADES, sensibilidadDeZona, type Sensibilidad, type Velocidad } from '../../utils/cdg/agujetas';
import type { ZonaIem } from '../../utils/cdg/zonas';
import { REDUCCION_SEMANA_1_PCT, redondearIem } from '../../utils/hipotesisDeBloque/cifras';
import type { EstadoDeZona } from '../../utils/hipotesisDeBloque/estadoDelBloqueAnterior';
import { cifrasDeHipotesis, rmObjetivoPorDefecto, type NotaDeHipotesis } from '../../utils/hipotesisDeBloque/proponerHipotesis';
import {
  TIPOS_DE_BLOQUE, aplicarTipoDeBloque, tipoDeBloqueNuevo, type CampoDeTipo,
} from '../../utils/hipotesisDeBloque/tiposDeBloque';
import { bajarAMantener, inicioPorDefecto } from '../../utils/hipotesisDelMeso';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que hace el EDITOR con el tipo de bloque y las fichas de hipótesis
   (17-11-2026)

   El motor (`utils/hipotesisDeBloque/`) propone y el puente
   (`utils/hipotesisDelMeso.ts`) dice qué se guarda al confirmar. Aquí va lo
   que es de la pantalla y de nadie más: qué se escribe al pulsar un chip de
   tipo, con qué nace un bloque nuevo, qué pasa con una ficha cuando el coach
   cambia la palanca o una cifra, y los textos cortos de la ficha.

   Puro: devuelve los cambios y quien llama los guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cómo se llama en pantalla cada campo que rellena un tipo (para «se respeta lo que tocaste»). */
export const NOMBRE_DE_CAMPO: Record<CampoDeTipo, string> = {
  weeks: 'las semanas',
  cdgVelocidad: 'la velocidad',
  cdgModoPorZona: 'el modo por zona',
  semana1Reducida: 'la semana 1 reducida',
  vuelveDeParon: 'la vuelta de parón',
  phaseType: 'el color del calendario',
  objective: 'el objetivo',
};

export interface TipoElegido {
  /** Lo que hay que escribir en el mesociclo. */
  cambios: Partial<Mesocycle>;
  /** Campos que el coach había tocado y se dejan como están, ya con su nombre de pantalla. */
  respetados: string[];
  avisos: string[];
}

/** Elegir un tipo en la cabecera: los cambios de `aplicarTipoDeBloque`, sin pisar lo que el coach tocó. */
export function elegirTipoDeBloque(meso: Mesocycle, tipo: TipoDeBloque): TipoElegido {
  const r = aplicarTipoDeBloque(meso, tipo);
  // El «objetivo» de un bloque antiguo no es un campo tocado: es el de siempre
  // y se conserva a propósito. No hace falta decirlo cada vez.
  const respetados = r.respetados.filter(c => !(c === 'objective' && !meso.tipoBloque)).map(c => NOMBRE_DE_CAMPO[c]);
  return { cambios: r.cambios, respetados, avisos: r.avisos };
}

/**
 * Con qué nace un bloque nuevo. El primero de un atleta, como «primer bloque»
 * con lo que marca su preset (8 semanas, semana 1 reducida encendida: todos
 * los ejercicios son nuevos), aunque luego se pueda estirar (Dani,
 * 18-11-2026). Los demás, desarrollo de 12 semanas con la semana 1 reducida
 * apagada (Dani, 17-11). Empieza el lunes siguiente al final del bloque que
 * todavía no ha terminado (hoy si no hay ninguno). Todo es editable después.
 */
export function camposDeBloqueNuevo(mesos: readonly Mesocycle[], hoy: string): Pick<Mesocycle, 'weeks' | 'startDate' | 'objective'> & Partial<Mesocycle> {
  const tipo = tipoDeBloqueNuevo(mesos);
  const { cambios } = aplicarTipoDeBloque({}, tipo, { nuevo: true });
  return {
    weeks: TIPOS_DE_BLOQUE[tipo].semanas,
    objective: TIPOS_DE_BLOQUE[tipo].objective,
    ...cambios,
    startDate: inicioPorDefecto(mesos, hoy),
  };
}

/**
 * Aceptar «Bajarlos a mantener» (Dani, 18-11-2026): los grupos sin estrella
 * que seguían en desarrollar pasan a mantener con la mitad de sus series. Lo
 * que se devuelve es lo que se escribe (`cambios`) y lo que había (`antes`),
 * que es lo que apunta el Deshacer del editor.
 */
export function alBajarAMantener(meso: Pick<Mesocycle, 'groups' | 'tipoBloque'>): { cambios: Pick<Mesocycle, 'groups'>; antes: Pick<Mesocycle, 'groups'> } | null {
  const groups = bajarAMantener<Record<MuscleGroup, MuscleGroupConfig>>(meso);
  return groups === meso.groups ? null : { cambios: { groups }, antes: { groups: meso.groups } };
}

/**
 * Lo que resume el tipo elegido bajo los chips: «las estrellas en dinámico y
 * el resto en estático (con 4 o más avisa, sin bloquear) · …». Solo cuenta lo
 * que el tipo HA RELLENADO: desde el 18-11-2026 no dice «lo que no lleva
 * estrella, a mantener», porque eso ya no lo hace el tipo (se recomienda
 * aparte), y el número de estrellas es el del aviso, no un tope.
 */
export function resumenDelTipo(tipo: TipoDeBloque, meso: Pick<Mesocycle, 'weeks'> & Partial<Pick<Mesocycle, 'cdgVelocidad' | 'semana1Reducida'>>): string {
  const p = TIPOS_DE_BLOQUE[tipo];
  const n = p.estrellasSinAviso;
  const estrellas = n === 0
    ? 'sin estrellas'
    : `${n === 1 ? 'la estrella' : 'las estrellas'} en dinámico y el resto en estático (con ${n + 1} o más avisa, sin bloquear)`;
  const velocidad = VELOCIDADES.find(v => v.value === (meso.cdgVelocidad ?? p.velocidad))?.label ?? '';
  return [
    estrellas, `velocidad ${velocidad.toLowerCase()}`,
    `${meso.weeks} ${meso.weeks === 1 ? 'semana' : 'semanas'}`,
    meso.semana1Reducida ? 'semana 1 reducida' : null,
  ].filter(Boolean).join(' · ');
}

// ── Las fichas ──────────────────────────────────────────────────────────────

/** El chip de cada palanca, como en la maqueta: qué pasa con el estímulo y con qué. */
export const CHIP_DE_PALANCA: Record<PalancaDeHipotesis, string> = {
  volumen: 'Más estímulo · volumen',
  intensidad: 'Más estímulo · intensidad',
  ejercicios: 'Mismo estímulo · otros ejercicios',
  recuperar: 'Menos · recuperar',
};

export const ORDEN_DE_CHIPS: readonly PalancaDeHipotesis[] = ['volumen', 'intensidad', 'ejercicios', 'recuperar'];

/** «dinámico · sube con agujetas 1-3». */
export function textoDeModo(modo: Sensibilidad): string {
  return modo === 'dinamico' ? 'dinámico · sube con agujetas 1-3' : 'estático · sube solo con agujetas 1';
}

/** El modo de una zona con estrella tal y como lo leerá el protocolo semanal. */
export function modoDeLaZona(meso: Pick<Mesocycle, 'cdgModoPorZona' | 'cdgObjetivosIem' | 'tipoBloque'>, zona: ZonaIem, conEstrella = true): Sensibilidad {
  if (meso.cdgModoPorZona?.[zona]) return sensibilidadDeZona(meso, zona);
  const p = TIPOS_DE_BLOQUE[meso.tipoBloque ?? 'desarrollo'];
  return conEstrella ? p.modoConEstrella : p.modoSinEstrella;
}

/** % que sube el techo sobre donde acabó el bloque anterior. `null` sin las dos cifras. */
export function pctDeSubida(h: Pick<HipotesisDeZona, 'iemTecho' | 'iemFinalAnterior'>): number | null {
  if (h.iemTecho == null || !(h.iemFinalAnterior != null && h.iemFinalAnterior > 0.005)) return null;
  return Math.round(((h.iemTecho - h.iemFinalAnterior) / h.iemFinalAnterior) * 100);
}

/** El estado de la zona en el bloque anterior, sacado de la foto guardada en la hipótesis. */
function estadoGuardado(h: HipotesisDeZona): Pick<EstadoDeZona, 'iemMedio' | 'iemFinal'> | null {
  return h.iemMedioAnterior != null && h.iemFinalAnterior != null
    ? { iemMedio: h.iemMedioAnterior, iemFinal: h.iemFinalAnterior }
    : null;
}

/**
 * Qué pide el PROCESO respecto a donde acabó el bloque anterior, en palabras:
 * «un 5 % más» si la zona sube, «sostenerlo (el 95 %)» si no. La referencia
 * es donde ACABÓ, no la media (auditoría de cifras, 17-11-2026): con un bloque
 * anterior en rampa la media queda por debajo del arranque y un objetivo
 * sobre ella nacía cumplido. `null` sin las dos cifras.
 */
export function referenciaDeProceso(h: Pick<HipotesisDeZona, 'iemMedioObjetivo' | 'iemFinalAnterior'>): { sube: boolean; texto: string } | null {
  if (h.iemMedioObjetivo == null || !(h.iemFinalAnterior != null && h.iemFinalAnterior > 0.005)) return null;
  const razon = h.iemMedioObjetivo / h.iemFinalAnterior;
  // A medio punto: las cifras van redondeadas a un decimal y con un IEM bajo
  // (41,2 → 43,3) el 5 % de la regla saldría como «5,1 %».
  const pct = Math.round(Math.abs(razon - 1) * 200) / 2;
  if (razon > 1.0005) return { sube: true, texto: `un ${fmtCifra(pct)} % más` };
  if (razon >= 0.9995) return { sube: false, texto: 'sostenerlo' };
  return { sube: false, texto: `sostenerlo, con un ${fmtCifra(pct)} % de margen` };
}

/**
 * Las líneas que explican por qué una ficha no propone lo de siempre (bloque
 * en déficit, zona ya alta). Son sugerencias: si el coach ha cambiado la
 * ficha a mano y ya no las sigue, la línea lo dice en vez de afirmar algo que
 * la ficha no hace.
 */
export function notasDeLaFicha(h: HipotesisDeZona, notas: readonly NotaDeHipotesis[] | undefined): string[] {
  const sube = h.iemTecho != null && h.iemFinalAnterior != null && h.iemTecho > h.iemFinalAnterior;
  return (notas ?? []).map(n => {
    if (n.clave === 'deficit') {
      const sigue = !sube && !(h.rmObjetivoPct != null && h.rmObjetivoPct > 0);
      return sigue ? n.texto : 'Bloque en déficit: la propuesta es no perder fuerza y no subir el estímulo. Esta ficha pide más porque la has cambiado a mano.';
    }
    return sube ? `${n.texto.split(': ')[0]}: la propuesta es no subir el techo. Lo has subido a mano.` : n.texto;
  });
}

/**
 * Cambiar la palanca de una ficha: las cifras se rehacen para la palanca nueva
 * (recuperar baja a la mitad, otros ejercicios no sube…) desde cómo acabó el
 * bloque anterior. El límite propio se conserva; el objetivo de RM, también,
 * salvo al entrar o salir de «recuperar» (ahí lo que se pide es no perder).
 * `nivel` y `enDeficit` son los de la propuesta: al rehacer las cifras valen
 * los mismos valores por defecto (+8 % en un principiante; en déficit, no
 * perder y techo sin subir).
 */
export function conPalanca(
  h: HipotesisDeZona, palanca: PalancaDeHipotesis,
  o: {
    estado?: Pick<EstadoDeZona, 'iemMedio' | 'iemFinal'> | null; velocidad?: Velocidad; semana1Reducida?: boolean;
    nivel?: ExperienceLevel; enDeficit?: boolean;
  } = {},
): HipotesisDeZona {
  if (h.palanca === palanca) return h;
  const cambiaDeSentido = (h.palanca === 'recuperar') !== (palanca === 'recuperar');
  return cifrasDeHipotesis({
    palanca,
    estado: o.estado ?? estadoGuardado(h),
    // Con referencia propia las cifras salen de lo guardado en la ficha: la referencia va con ellas.
    semanasDeReferencia: o.estado ? undefined : h.semanasDeReferencia,
    velocidad: o.velocidad,
    semana1Reducida: o.semana1Reducida,
    limite: h.limite,
    nivel: o.nivel,
    enDeficit: o.enDeficit,
    rmObjetivoPct: cambiaDeSentido ? undefined : h.rmObjetivoPct,
  });
}

/** ¿Lo que pide la ficha del RM es no perderlo? (objetivo 0: recuperar o bloque en déficit). */
export const pideNoPerder = (h: Pick<HipotesisDeZona, 'palanca' | 'rmObjetivoPct'>): boolean =>
  (h.rmObjetivoPct ?? rmObjetivoPorDefecto({ palanca: h.palanca })) <= 0;

export type CifraEditable = 'iemMedioObjetivo' | 'iemArranque' | 'iemTecho' | 'rmObjetivoPct';

/** Lo que el coach escribe en una cifra de la ficha. Vacío o negativo = sin cifra. */
export function conCifra(h: HipotesisDeZona, campo: CifraEditable, valor: number | null): HipotesisDeZona {
  const out: HipotesisDeZona = { ...h };
  if (valor == null || !Number.isFinite(valor) || valor < 0) delete out[campo];
  else out[campo] = campo === 'rmObjetivoPct' ? Math.round(valor * 10) / 10 : redondearIem(valor);
  return out;
}

/** El límite propio de la zona, en palabras del coach. Vacío = sin límite propio. */
export function conLimite(h: HipotesisDeZona, limite: string): HipotesisDeZona {
  const out: HipotesisDeZona = { ...h };
  if (limite.trim()) out.limite = limite.trim();
  else delete out.limite;
  return out;
}

/** Lo que escribe una cifra tecleada: «58,5» → 58.5; vacío o basura → null. */
export function leerCifra(texto: string): number | null {
  const limpio = texto.replace('%', '').replace('+', '').replace(',', '.').trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Una cifra de IEM o de % como se enseña: coma decimal, un decimal como mucho. */
export function fmtCifra(v: number | null | undefined): string {
  return v == null ? '' : v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

/**
 * Encender o apagar la semana 1 reducida: además del interruptor, el arranque
 * de cada hipótesis guardada se mueve con él (un 7 % por debajo de donde acabó
 * el bloque anterior, o justo ahí) si sigue siendo el que puso la app. Un
 * arranque que el coach escribió a mano no se toca. Al apagar se quita también
 * el recorte por ejercicio.
 */
export function alCambiarSemana1(meso: Pick<Mesocycle, 'hipotesis' | 'semana1Reducida'>, activa: boolean): Partial<Mesocycle> {
  const arranque = (final: number, reducida: boolean) => redondearIem(reducida ? final * (1 - REDUCCION_SEMANA_1_PCT / 100) : final);
  const antes = !!meso.semana1Reducida;
  const cambios: Partial<Mesocycle> = { semana1Reducida: activa };
  if (!activa) cambios.semana1Recorte = undefined;
  const guardadas = meso.hipotesis ?? {};
  let tocada = false;
  const hipotesis = Object.fromEntries(Object.entries(guardadas).map(([zona, h]) => {
    // Con referencia propia el bloque ya ha empezado: su arranque no depende de la semana 1 reducida.
    if (!h || h.palanca === 'recuperar' || h.semanasDeReferencia || h.iemFinalAnterior == null || h.iemArranque !== arranque(h.iemFinalAnterior, antes)) return [zona, h];
    const nuevo = arranque(h.iemFinalAnterior, activa);
    if (nuevo === h.iemArranque) return [zona, h];
    tocada = true;
    return [zona, { ...h, iemArranque: nuevo }];
  }));
  if (tocada) cambios.hipotesis = hipotesis;
  return cambios;
}
