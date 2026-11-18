import type { Mesocycle } from '../types.js';
import { vueltasDelCiclo } from './progression.js';

// ═══════════════════════════════════════════════════════════════════════════
// LA DESCARGA DEL BLOQUE — un solo sitio para sus dos campos.
//
// `Mesocycle.semanasDescarga` (semanas DE CICLO, las S1, S2… de la barra de
// semanas) es lo que recorta el entreno: `resolverEjercicioDelMeso` solo mira
// ese campo. `Mesocycle.deloadWeek` (semana de CALENDARIO) solo pinta el
// calendario. Hasta el 17-11-2026 el interruptor «Incluye semana de descarga»
// de la cabecera y el asistente escribían solo `deloadWeek`: el coach veía la
// descarga en el calendario y el atleta entrenaba la semana entera.
//
// Decisión: la fuente de verdad es `semanasDescarga`, y `deloadWeek` es un
// DERIVADO (la semana de calendario de la primera descarga) que se escribe a
// la vez para que el calendario siga funcionando. Todo el que ESCRIBE una
// descarga pasa por aquí.
//
// Lo que NO cambia es la lectura: un bloque ya guardado que solo tenga
// `deloadWeek` sigue sin recortar nada. Convertirlos al leer haría que
// atletas en producción empezaran a descargar solos, sin que nadie lo haya
// decidido; el coach lo aplica desde la barra de semanas («Aplicar descarga»)
// o moviendo el número de la cabecera.
// ═══════════════════════════════════════════════════════════════════════════

export type CamposDeDescarga = Pick<Mesocycle, 'semanasDescarga' | 'deloadWeek'>;

/** Semana de calendario (1-indexada) en la que EMPIEZA una semana de ciclo. */
export function semanaDeCalendarioDeVuelta(vuelta: number, cicloDias: number): number {
  return Math.floor(((vuelta - 1) * Math.max(1, cicloDias)) / 7) + 1;
}

/** Semana de ciclo (1-indexada) a la que pertenece el primer día de una semana de calendario. */
export function vueltaDeSemanaDeCalendario(semana: number, cicloDias: number): number {
  return Math.floor(((semana - 1) * 7) / Math.max(1, cicloDias)) + 1;
}

/**
 * Los dos campos a escribir para una lista de semanas de ciclo en descarga.
 *
 * Devuelve SIEMPRE las dos claves, con `undefined` explícito cuando no queda
 * ninguna: así `updateMesocycle` las borra de Firestore con `deleteField()` en
 * vez de dejar la descarga vieja puesta.
 */
export function camposDeDescarga(vueltas: readonly number[], cicloDias: number): {
  semanasDescarga: number[] | undefined;
  deloadWeek: number | undefined;
} {
  const lista = [...new Set(vueltas)].filter(v => Number.isInteger(v) && v >= 1).sort((a, b) => a - b);
  if (lista.length === 0) return { semanasDescarga: undefined, deloadWeek: undefined };
  return { semanasDescarga: lista, deloadWeek: semanaDeCalendarioDeVuelta(lista[0], cicloDias) };
}

/**
 * La semana de ciclo que enseña el número de la cabecera: la primera descarga
 * de verdad o, en un bloque antiguo que solo tiene la marca del calendario, la
 * que le corresponde a esa marca. `undefined` = interruptor apagado.
 */
export function descargaDeCabecera(meso: CamposDeDescarga, cicloDias: number): number | undefined {
  if (meso.semanasDescarga && meso.semanasDescarga.length > 0) return Math.min(...meso.semanasDescarga);
  return meso.deloadWeek !== undefined ? vueltaDeSemanaDeCalendario(meso.deloadWeek, cicloDias) : undefined;
}

/**
 * Interruptor y número de la cabecera del mesociclo.
 *
 * `vuelta` undefined = apagar: se quitan TODAS las descargas, también las
 * marcadas desde la barra de semanas (apagar «Incluye semana de descarga» y
 * que el atleta siga descargando sería el mismo fallo al revés). Con número,
 * la descarga que enseñaba la cabecera se mueve a esa semana y el resto de
 * descargas de la barra se respetan.
 */
export function ponerDescargaDeCabecera(
  meso: CamposDeDescarga, vuelta: number | undefined, cicloDias: number,
): ReturnType<typeof camposDeDescarga> {
  if (vuelta === undefined) return camposDeDescarga([], cicloDias);
  const mostrada = descargaDeCabecera(meso, cicloDias);
  const resto = (meso.semanasDescarga ?? []).filter(s => s !== mostrada);
  return camposDeDescarga([...resto, vuelta], cicloDias);
}

/**
 * Lo que guarda el asistente cuando propone «descarga en la semana N» (de
 * calendario) en un bloque o una etapa NUEVOS. Sin claves a `undefined`: va a
 * un documento que se crea, y Firestore no las admite ahí.
 */
export function descargaEnSemanaDeCalendario(deloadWeek: number, cicloDias: number): {
  semanasDescarga: number[];
  deloadWeek: number;
} {
  const vuelta = vueltaDeSemanaDeCalendario(deloadWeek, cicloDias);
  return { semanasDescarga: [vuelta], deloadWeek: semanaDeCalendarioDeVuelta(vuelta, cicloDias) };
}

/**
 * Cómo se dice la descarga de un bloque en una línea («descarga en la semana
 * 4», «sin descarga»). Un bloque antiguo con solo la marca del calendario se
 * dice tal cual: prometer una descarga que no recorta nada es justo lo que
 * este archivo existe para evitar.
 */
export function textoDeDescarga(meso: CamposDeDescarga, cicloDias: number): string {
  const lista = [...(meso.semanasDescarga ?? [])].sort((a, b) => a - b);
  if (lista.length === 0) {
    return meso.deloadWeek !== undefined
      ? `descarga solo en el calendario (semana ${meso.deloadWeek})`
      : 'sin descarga';
  }
  const [una, varias] = cicloDias === 7 ? ['la semana', 'las semanas'] : ['la vuelta', 'las vueltas'];
  if (lista.length === 1) return `descarga en ${una} ${lista[0]}`;
  return `descarga en ${varias} ${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
}

type CamposPorSemana = Pick<Mesocycle,
  'semanasDescarga' | 'semanasTest' | 'semanasPivot' | 'notasSemana' | 'eventosSemana' | 'deloadWeek'>;

/**
 * Lo que hay que quitar de un bloque al dejarlo en `weeks` semanas.
 *
 * Acortar un bloque de 12 semanas a 8 dejaba la descarga de la S12, el test de
 * la S11 y sus notas colgando fuera del bloque: no se veían en la barra de
 * semanas, pero seguían guardadas (y la marca de descarga, en el calendario,
 * caía ya dentro del bloque siguiente). Devuelve SOLO las claves que cambian,
 * con `undefined` explícito en las que se quedan vacías; alargar el bloque, o
 * acortarlo sin nada fuera, devuelve `{}` y no toca el documento.
 *
 * Las listas y las claves de notas/eventos van en semanas de CICLO (el tope
 * son las vueltas que caben en `weeks`); `deloadWeek`, en semanas de calendario.
 * La nota «0» (la general del bloque) no es de ninguna semana y se conserva.
 */
export function podarSemanasFueraDelBloque(
  meso: CamposPorSemana, weeks: number, cicloDias: number,
): Partial<CamposPorSemana> {
  const vueltas = vueltasDelCiclo(weeks, cicloDias);
  const patch: Partial<CamposPorSemana> = {};

  for (const campo of ['semanasDescarga', 'semanasTest', 'semanasPivot'] as const) {
    const lista = meso[campo];
    if (!lista) continue;
    const dentro = lista.filter(s => s <= vueltas);
    if (dentro.length !== lista.length) patch[campo] = dentro.length > 0 ? dentro : undefined;
  }

  const podarClaves = <T,>(mapa: Record<string, T> | undefined): { cambia: boolean; resto: Record<string, T> | undefined } => {
    if (!mapa) return { cambia: false, resto: undefined };
    const dentro = Object.entries(mapa).filter(([k]) => !(Number(k) > vueltas));
    if (dentro.length === Object.keys(mapa).length) return { cambia: false, resto: mapa };
    return { cambia: true, resto: dentro.length > 0 ? Object.fromEntries(dentro) : undefined };
  };
  const notas = podarClaves(meso.notasSemana);
  if (notas.cambia) patch.notasSemana = notas.resto;
  const eventos = podarClaves(meso.eventosSemana);
  if (eventos.cambia) patch.eventosSemana = eventos.resto;

  // `deloadWeek` sigue a la descarga de verdad cuando la hay; en un bloque
  // antiguo con solo la marca del calendario, se quita si cae fuera.
  if ('semanasDescarga' in patch) {
    patch.deloadWeek = camposDeDescarga(patch.semanasDescarga ?? [], cicloDias).deloadWeek;
  } else if (!meso.semanasDescarga?.length && meso.deloadWeek !== undefined && meso.deloadWeek > weeks) {
    patch.deloadWeek = undefined;
  }

  return patch;
}
