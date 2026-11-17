import type { Mesocycle, MuscleGroup, PhaseType, TipoDeBloque } from '../../types.js';
import { sensibilidadDeZona, type Sensibilidad, type Velocidad } from '../cdg/agujetas.js';
import { ZONAS_IEM, ZONA_POR_CLAVE, esZonaIem, type ZonaIem } from '../cdg/zonas.js';
import {
  DIAS_DE_PARON_PARA_REDUCIR, ESTRELLAS_CON_AVISO, ESTRELLAS_DESARROLLO, ESTRELLAS_ESPECIALIZACION,
  SEMANAS_POR_DEFECTO, SEMANAS_PRIMER_BLOQUE, VELOCIDAD_POR_DEFECTO,
} from './cifras.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Los cuatro tipos de bloque (17-11-2026)

   Un tipo es un PRESET EDITABLE, no un catálogo cerrado: al elegirlo se
   rellenan la duración, la velocidad, el modo de cada zona y cuántas zonas
   pueden llevar estrella, y el coach cambia después lo que quiera. Sustituye
   en pantalla a `objective` y a `phaseType`, que se siguen escribiendo
   derivados porque el calendario y las plantillas los leen.

   Ojo con los nombres: `utils/cdg/agujetas.ts` ya exporta un `TipoDeBloque`
   (sensibilidad + velocidad, los dos ejes del freno/acelerador). El de aquí
   es el de `types.ts`: primer bloque, desarrollo, especialización o
   mantenimiento. Las semanas puente no son un tipo: son una transición
   (`Mesocycle.semanasPivot`).

   Puro: no escribe nada. `aplicarTipoDeBloque` devuelve los cambios y quien
   llama decide si los guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PresetDeBloque {
  tipo: TipoDeBloque;
  etiqueta: string;
  /** Para qué sirve, en una frase (para el coach). */
  paraQue: string;
  semanas: number;
  velocidad: Velocidad;
  /** Zonas que pueden llevar estrella. 0 = el bloque no prioriza ninguna. */
  maxEstrellas: number;
  /** Modo del freno/acelerador: la zona con estrella sube con agujetas de 1 a
   *  3; el resto, solo con un 1. */
  modoConEstrella: Sensibilidad;
  modoSinEstrella: Sensibilidad;
  /** Sugerencia de arranque. Solo el primer bloque la trae encendida (todos
   *  los ejercicios son nuevos); ver `sugerirSemana1Reducida` para el resto. */
  semana1Reducida: boolean;
  vuelveDeParon: boolean;
  /** Lo que se escribe en `Mesocycle.phaseType` (color e icono del calendario). */
  phaseType: PhaseType;
  /** Base del texto de `Mesocycle.objective` (ver `objetivoDerivado`). */
  objective: string;
  /** Qué pasa con las zonas sin estrella si el coach no dice nada: siguen como
   *  estaban o bajan a mantener (la mitad). */
  resto: 'como_estaba' | 'mantener';
}

export const TIPOS_DE_BLOQUE: Record<TipoDeBloque, PresetDeBloque> = {
  primer: {
    tipo: 'primer', etiqueta: 'Primer bloque',
    paraQue: 'Aprender los ejercicios y encontrar el punto de partida; todavía no se prioriza ninguna zona.',
    semanas: SEMANAS_PRIMER_BLOQUE, velocidad: VELOCIDAD_POR_DEFECTO, maxEstrellas: 0,
    modoConEstrella: 'dinamico', modoSinEstrella: 'estatico',
    semana1Reducida: true, vuelveDeParon: false,
    phaseType: 'hipertrofia', objective: 'Primer bloque', resto: 'como_estaba',
  },
  desarrollo: {
    tipo: 'desarrollo', etiqueta: 'Desarrollo',
    paraQue: 'Subir el estímulo de las zonas con estrella y sostener el resto.',
    semanas: SEMANAS_POR_DEFECTO, velocidad: VELOCIDAD_POR_DEFECTO, maxEstrellas: ESTRELLAS_DESARROLLO,
    modoConEstrella: 'dinamico', modoSinEstrella: 'estatico',
    semana1Reducida: false, vuelveDeParon: false,
    phaseType: 'hipertrofia', objective: 'Desarrollo', resto: 'como_estaba',
  },
  especializacion: {
    tipo: 'especializacion', etiqueta: 'Especialización',
    paraQue: 'Volcar el bloque en una sola zona; las demás se quedan en mantener para dejarle sitio.',
    semanas: SEMANAS_POR_DEFECTO, velocidad: VELOCIDAD_POR_DEFECTO, maxEstrellas: ESTRELLAS_ESPECIALIZACION,
    modoConEstrella: 'dinamico', modoSinEstrella: 'estatico',
    semana1Reducida: false, vuelveDeParon: false,
    phaseType: 'hipertrofia', objective: 'Especialización', resto: 'mantener',
  },
  mantenimiento: {
    tipo: 'mantenimiento', etiqueta: 'Mantenimiento',
    paraQue: 'Conservar lo ganado con la mitad de trabajo: no se busca subir nada.',
    semanas: SEMANAS_POR_DEFECTO, velocidad: VELOCIDAD_POR_DEFECTO, maxEstrellas: 0,
    modoConEstrella: 'dinamico', modoSinEstrella: 'estatico',
    semana1Reducida: false, vuelveDeParon: false,
    phaseType: 'mantenimiento', objective: 'Mantenimiento', resto: 'mantener',
  },
};

/** El orden en que se ofrecen. */
export const ORDEN_DE_TIPOS: readonly TipoDeBloque[] = ['primer', 'desarrollo', 'especializacion', 'mantenimiento'];

/** Nombre corto de una zona para el coach: «Trapecio», no «Trapecio (escápula)». */
export const nombreCortoDeZona = (zona: ZonaIem): string => ZONA_POR_CLAVE[zona].nombre.split(' (')[0];

/** «a, b y c» (con «e» delante de i-/hi-). */
export function enLista(palabras: readonly string[]): string {
  if (palabras.length <= 1) return palabras[0] ?? '';
  const ultima = palabras[palabras.length - 1];
  const y = /^h?i(?![aeo])/i.test(ultima) ? 'e' : 'y';
  return `${palabras.slice(0, -1).join(', ')} ${y} ${ultima}`;
}

/** Las zonas con estrella de un bloque: las que tienen hipótesis, en el orden de `ZONAS_IEM`. */
export function estrellasDe(meso: Pick<Mesocycle, 'hipotesis'> | null | undefined): ZonaIem[] {
  const claves = new Set(Object.keys(meso?.hipotesis ?? {}).filter(esZonaIem));
  return ZONAS_IEM.map(z => z.clave).filter(z => claves.has(z));
}

/** Los grupos musculares de la app que caen en unas zonas (para marcarlos de
 *  prioridad alta, que es lo que respeta la semana puente). */
export function gruposDeLasZonas(zonas: readonly ZonaIem[]): MuscleGroup[] {
  return zonas.flatMap(z => [...ZONA_POR_CLAVE[z].grupos] as MuscleGroup[]);
}

/** Modo de TODAS las zonas: con estrella, dinámico; el resto, estático. */
export function modoPorZonaDe(estrellas: readonly ZonaIem[], tipo: TipoDeBloque = 'desarrollo'): Record<ZonaIem, Sensibilidad> {
  const p = TIPOS_DE_BLOQUE[tipo];
  const con = new Set(estrellas);
  return Object.fromEntries(ZONAS_IEM.map(z => [z.clave, con.has(z.clave) ? p.modoConEstrella : p.modoSinEstrella])) as Record<ZonaIem, Sensibilidad>;
}

/** El texto de `Mesocycle.objective` que sale del tipo: «Desarrollo: pectoral y deltoides». */
export function objetivoDerivado(tipo: TipoDeBloque, estrellas: readonly ZonaIem[] = []): string {
  const p = TIPOS_DE_BLOQUE[tipo];
  const validas = estrellas.slice(0, Math.max(0, p.maxEstrellas));
  if (validas.length === 0) return p.objective;
  return `${p.objective}: ${enLista(validas.map(z => nombreCortoDeZona(z).toLowerCase()))}`;
}

export interface AvisoDeEstrellas {
  /** `excede`: más de las que admite el tipo. `aviso`: caben, pero son muchas. */
  nivel: 'aviso' | 'excede';
  texto: string;
}

/** Qué decirle al coach según cuántas estrellas lleva el bloque. `null` = nada. */
export function avisoDeEstrellas(tipo: TipoDeBloque, estrellas: number): AvisoDeEstrellas | null {
  const p = TIPOS_DE_BLOQUE[tipo];
  if (estrellas > p.maxEstrellas) {
    const texto = p.maxEstrellas === 0
      ? `${p.etiqueta} no lleva estrellas: no prioriza ninguna zona. Quítalas o cambia el tipo de bloque.`
      : p.maxEstrellas === 1
        ? `${p.etiqueta} es de una sola estrella y hay ${estrellas}: elige cuál se queda.`
        : `${p.etiqueta} admite hasta ${p.maxEstrellas} estrellas y hay ${estrellas}: elige cuáles se quedan.`;
    return { nivel: 'excede', texto };
  }
  if (estrellas >= ESTRELLAS_CON_AVISO) {
    return { nivel: 'aviso', texto: `Con ${estrellas} estrellas la prioridad se reparte mucho: lo que se prioriza todo a la vez no se prioriza.` };
  }
  return null;
}

/**
 * ¿Conviene empezar con la semana 1 reducida? La app solo la sugiere con
 * ejercicios nuevos o tras un parón de más de 3 semanas (Dani, 17-11); el
 * coach decide. Tras un parón sugiere además `vuelveDeParon` (semana 1 a RIR
 * 3 o más).
 */
export function sugerirSemana1Reducida(o: { ejerciciosNuevos?: number; diasDeParon?: number | null }): {
  semana1Reducida: boolean; vuelveDeParon: boolean; motivo: string | null;
} {
  const paron = o.diasDeParon != null && o.diasDeParon > DIAS_DE_PARON_PARA_REDUCIR;
  const nuevos = (o.ejerciciosNuevos ?? 0) > 0;
  if (paron) {
    const semanas = Math.floor(o.diasDeParon! / 7);
    return { semana1Reducida: true, vuelveDeParon: true, motivo: `Vuelve de un parón de ${semanas} semanas: empieza con la semana 1 reducida y lejos del fallo.` };
  }
  if (nuevos) {
    const n = o.ejerciciosNuevos!;
    return { semana1Reducida: true, vuelveDeParon: false, motivo: `Hay ${n} ejercicio${n === 1 ? ' nuevo' : 's nuevos'}: una semana 1 reducida da margen para aprenderlo${n === 1 ? '' : 's'}.` };
  }
  return { semana1Reducida: false, vuelveDeParon: false, motivo: null };
}

/** Los campos del mesociclo que rellena un tipo de bloque. */
export type CampoDeTipo = 'weeks' | 'cdgVelocidad' | 'cdgModoPorZona' | 'semana1Reducida' | 'vuelveDeParon' | 'phaseType' | 'objective';

export type MesoParaTipo = Partial<Pick<Mesocycle,
  'tipoBloque' | 'weeks' | 'cdgVelocidad' | 'cdgModoPorZona' | 'cdgObjetivosIem' | 'semana1Reducida' | 'vuelveDeParon' | 'phaseType' | 'objective' | 'hipotesis'>>;

export interface CambiosDeTipoDeBloque {
  /** Lo que hay que escribir en el mesociclo. Solo trae lo que cambia. */
  cambios: Partial<Pick<Mesocycle, 'tipoBloque' | CampoDeTipo>>;
  /** Campos que el coach había tocado a mano y se dejan como están. */
  respetados: CampoDeTipo[];
  /** Lo que el coach tiene que decidir (estrellas de más para el tipo nuevo). */
  avisos: string[];
}

/**
 * Los cambios de aplicar un tipo de bloque a un mesociclo, SIN pisar lo que
 * el coach tocó a mano cuando se puede saber:
 *
 *  · un campo vacío se rellena;
 *  · si el bloque ya tenía tipo, un campo que sigue valiendo lo que ponía el
 *    preset anterior no lo ha tocado nadie: se cambia al del tipo nuevo;
 *  · un campo con otro valor lo puso el coach: se respeta (y se devuelve en
 *    `respetados`, para decírselo);
 *  · `nuevo: true` (bloque que se está creando, con los valores por defecto
 *    del formulario): se rellena todo salvo lo que venga en `tocados`.
 *
 * Las hipótesis no se borran nunca desde aquí: si el tipo nuevo admite menos
 * estrellas de las que hay, se avisa y decide el coach.
 */
export function aplicarTipoDeBloque(
  meso: MesoParaTipo, tipo: TipoDeBloque, o: { nuevo?: boolean; tocados?: readonly CampoDeTipo[] } = {},
): CambiosDeTipoDeBloque {
  const nuevoPreset = TIPOS_DE_BLOQUE[tipo];
  const anterior = meso.tipoBloque ? TIPOS_DE_BLOQUE[meso.tipoBloque] : null;
  const estrellas = estrellasDe(meso);
  const tocados = new Set(o.tocados ?? []);
  const cambios: CambiosDeTipoDeBloque['cambios'] = {};
  const respetados: CampoDeTipo[] = [];
  if (meso.tipoBloque !== tipo) cambios.tipoBloque = tipo;

  const vacio = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
  /** Decide un campo simple: `delAnterior` es lo que habría puesto el preset anterior. */
  const decidir = <C extends Exclude<CampoDeTipo, 'cdgModoPorZona'>>(campo: C, valor: NonNullable<Mesocycle[C]>, delAnterior: Mesocycle[C] | undefined) => {
    const actual = meso[campo];
    if (actual === valor) return;
    const escribir = !tocados.has(campo) && (o.nuevo || vacio(actual) || (anterior != null && actual === delAnterior));
    if (escribir) (cambios as Record<string, unknown>)[campo] = valor;
    else respetados.push(campo);
  };

  decidir('weeks', nuevoPreset.semanas, anterior?.semanas);
  decidir('cdgVelocidad', nuevoPreset.velocidad, anterior?.velocidad);
  decidir('semana1Reducida', nuevoPreset.semana1Reducida, anterior?.semana1Reducida);
  decidir('vuelveDeParon', nuevoPreset.vuelveDeParon, anterior?.vuelveDeParon);
  decidir('phaseType', nuevoPreset.phaseType, anterior?.phaseType);
  decidir('objective', objetivoDerivado(tipo, estrellas), anterior ? objetivoDerivado(anterior.tipo, estrellas) : undefined);

  // El modo por zona no depende del tipo sino de las estrellas: si lo que hay
  // (escrito o por defecto) ya es «estrella dinámico, resto estático», nadie
  // lo ha tocado.
  const modo = modoPorZonaDe(estrellas, tipo);
  const escritoIgual = meso.cdgModoPorZona != null && ZONAS_IEM.every(z => meso.cdgModoPorZona![z.clave] === modo[z.clave]);
  if (!escritoIgual) {
    const efectivoIgual = ZONAS_IEM.every(z => sensibilidadDeZona(meso, z.clave) === modo[z.clave]);
    if (!tocados.has('cdgModoPorZona') && (o.nuevo || meso.cdgModoPorZona == null)) cambios.cdgModoPorZona = modo;
    else if (!efectivoIgual) respetados.push('cdgModoPorZona');
  }

  const aviso = avisoDeEstrellas(tipo, estrellas.length);
  return { cambios, respetados, avisos: aviso?.nivel === 'excede' ? [aviso.texto] : [] };
}
