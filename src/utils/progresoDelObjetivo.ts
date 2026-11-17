import type { Exercise, ExperienceLevel, Mesocycle, MuscleGroup, Workout, WorkoutAssignment, WorkoutLog } from '../types.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';
import { incrementoDe, rangoDeReps, repsAlRirPautado, repsExtraAntesDeSubir, saltoReal, serieDeReferencia, veredictoDeSerie } from './cargaSugerida.js';
import type { ZonaIem } from './cdg/zonas.js';
import { semanasDeCalendarioEnDescarga } from './cierreMesociclo.js';
import { finDeBloque } from './finDeBloque.js';
import { RM_OBJETIVO_PCT } from './hipotesisDeBloque/cifras.js';
import { ZONA_PARA_EL_ATLETA, objetivoDelMesoParaElAtleta } from './hipotesisDeBloque/objetivoParaElAtleta.js';
import { enLista, estrellasDe, gruposDeLasZonas } from './hipotesisDeBloque/tiposDeBloque.js';
import { buildProgresionDelBloque, type ProgresionDelBloque } from './progresionDelBloque.js';
import { resolverEjercicioDelMeso } from './progression.js';
import { mediana } from './rmValido.js';
import { RUIDO_RM_PCT } from './ruidoDeMedida.js';
import { semanaDelBloque, totalDeSemanasDelBloque } from './semanaDelBloque.js';
import { entradasDeLaUltimaVez } from './setPrefill.js';
import { expandSetGroups } from './setGroups.js';
import { seriesPrincipales } from './tecnicaDeSerie.js';
import { tipoDeSemana } from './tipoDeSemana.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El objetivo del bloque, con cuánto le falta (A1, 17-11-2026)

   Dani: que el sistema «obligue al atleta a mejorar». El atleta ve su objetivo
   del bloque en UNA frase (`objetivoDelMesoParaElAtleta`), por qué semana va y
   cuánto lleva de la mejora que se busca. Y un empujón concreto: el ejercicio
   de sus zonas prioritarias que está más cerca de subir y lo que le falta.

   Lo que se mide es lo mismo que mirará el coach al cerrar el bloque (el
   RESULTADO de la hipótesis): la mediana del % de RM estimado de los
   ejercicios de cada zona que se pueden comparar, con la misma cuenta
   (`buildProgresionDelBloque`: mediana de 2 semanas contra 2 y solo
   ejercicios con marca en más de la mitad de las semanas).

   Dos diferencias a propósito con el lado del coach:
    · Aquí NO hay motor CDG (no se baja al móvil del atleta): los «ejercicios
      de la zona» son los del catálogo cuyo grupo principal cae en ella
      (`gruposDeLasZonas`). El veredicto firmado puede diferir en algún
      ejercicio; esto es un marcador para el atleta, no el veredicto.
    · Si lo que se pide es no perder (objetivo 0: bloque en déficit,
      auditoría de cifras del 17-11-2026), no hay «% de %»: el marcador dice
      si mantiene su fuerza. Por dentro del ruido de medida ya lo cumple.
    · Nunca se promete más de lo que dice el dato: sin dos semanas con marca,
      «todavía es pronto»; por debajo del ruido de medida (3 %) no se dice que
      ha mejorado ni que ha bajado, y la barra no se mueve.

   Sin tecnicismos: ni zona, ni índice, ni RM, ni hipótesis. Puro y sin
   escribir nada. Sin hipótesis en el bloque devuelve `null` (no se pinta).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cómo va una zona (o el objetivo entero) frente a lo que se busca. */
export type EstadoDelObjetivo =
  | 'pronto'       // aún no hay dos semanas con marca
  | 'igual'        // el cambio no supera el ruido de medida
  | 'mejora'       // mejora más que el ruido, sin llegar al objetivo
  | 'conseguido'   // llega al objetivo (el bloque sigue: hay que sostenerlo)
  | 'baja';        // mueve menos que al empezar, más que el ruido

export interface ProgresoDeZona {
  zona: ZonaIem;
  /** «pecho», «hombro»… como lo dice el atleta. */
  nombre: string;
  objetivoPct: number;
  /** Lo que se pide es no perder (objetivo 0): se dice «mantienes», sin porcentajes. */
  mantener: boolean;
  /** % que mueve de más en sus ejercicios; `null` si todavía no se puede medir. */
  mejoraPct: number | null;
  /** Ejercicios con los que se ha medido. */
  ejercicios: number;
  estado: EstadoDelObjetivo;
  /**
   * Lleva tres sesiones o más de sus ejercicios y ninguna da marca (series
   * largas o lejos del límite): no es que sea pronto, es que así no se puede
   * medir. Se le dice distinto para no tenerlo semanas con «todavía es pronto».
   */
  sinMarcas: boolean;
  /** 0-1 del camino al objetivo. 0 mientras el cambio no supere el ruido. */
  fraccion: number;
  /** «Pecho: +4 % de 5 %». */
  texto: string;
}

/** Sesiones de un ejercicio sin ninguna marca a partir de las cuales ya no es «pronto». */
export const SESIONES_PARA_DECIR_SIN_MARCAS = 3;

export type TipoDeEmpujon = 'sube' | 'faltan_reps' | 'con_margen';

export interface Empujon {
  exerciseId: string;
  nombre: string;
  tipo: TipoDeEmpujon;
  /** Repeticiones que le faltan para subir de peso (0 si ya le toca). */
  faltan: number;
  /** El peso con el que trabaja ahora. */
  peso: number;
  /** El peso al que sube (solo con `tipo: 'sube'`). */
  pesoNuevo?: number;
  texto: string;
}

export interface ProgresoDelObjetivo {
  mesocycleId: string;
  /** La frase del objetivo (`objetivoDelMesoParaElAtleta`). */
  frase: string;
  semana: number;
  /** `null` si el bloque no dice cuánto dura. */
  semanas: number | null;
  /** «Semana 3 de 12». */
  semanaTexto: string;
  /** Una por zona prioritaria que sube. Vacío si el bloque no busca subir nada medible. */
  zonas: ProgresoDeZona[];
  estado: EstadoDelObjetivo;
  /** Media de las zonas, 0-1: lo que rellena la barra o el anillo. */
  fraccion: number;
  /** Con una sola zona, su mejora y su objetivo; con varias, `null` (se enseñan por zona). */
  mejoraPct: number | null;
  objetivoPct: number | null;
  /** Una línea corta: «Llevas un 4 % de 5 %». */
  titular: string;
  /** Una frase para acompañar, en tono de entrenador. */
  detalle: string;
  empujon: Empujon | null;
}

const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;
const conSigno = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** El nombre de un ejercicio en mitad de una frase: «press inclinado», no «Press inclinado». */
const enFrase = (nombre: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(nombre) ? nombre.charAt(0).toLowerCase() + nombre.slice(1) : nombre);
const r1 = (v: number) => Math.round(v * 10) / 10;

type MesoDelObjetivo = Pick<Mesocycle, 'id' | 'startDate' | 'weeks'> & Partial<Mesocycle>;

/** Las zonas prioritarias que el bloque quiere SUBIR (las que se recuperan no son «de qué va»). */
export function zonasQueSuben(meso: Pick<Mesocycle, 'hipotesis' | 'tipoBloque'>): ZonaIem[] {
  if (meso.tipoBloque === 'primer' || meso.tipoBloque === 'mantenimiento') return [];
  return estrellasDe(meso).filter(z => meso.hipotesis?.[z]?.palanca !== 'recuperar');
}

/**
 * El bloque del que se enseña el objetivo: el que contiene hoy por fechas (su
 * último día REAL, `finDeBloque`). Con dos solapados, el que empezó más tarde.
 */
export function mesoDelObjetivo<M extends Pick<Mesocycle, 'startDate' | 'weeks'>>(mesociclos: readonly M[], hoy: string): M | null {
  return [...mesociclos]
    .filter(m => !!m.startDate && m.startDate <= hoy && hoy <= finDeBloque(m as unknown as Mesocycle))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

/**
 * La progresión del bloque (en curso o terminado) con la misma cuenta que el
 * cierre del coach: las semanas de descarga, puente, test y vuelta de parón se
 * traducen de vueltas del ciclo a semanas de 7 días y no entran en la
 * comparación.
 */
export function progresionDelBloqueDelAtleta(o: {
  meso: MesoDelObjetivo;
  logs: readonly WorkoutLog[];
  exercises: readonly Exercise[];
  assignments?: readonly WorkoutAssignment[];
  hoy: string;
  pesoCorporalKg?: number | null;
}): ProgresionDelBloque {
  const meso = o.meso as Mesocycle;
  const inicio = meso.startDate;
  const fin = finDeBloque(meso);
  const diasDelBloque = diasEntreFechas(inicio, fin) + 1;
  const ciclo = cicloDiasDeMeso(meso);
  const aSemanas = (vueltas: number[]) => semanasDeCalendarioEnDescarga(vueltas, ciclo, diasDelBloque);
  return buildProgresionDelBloque({
    logs: o.logs.filter(l => (l.mesocycleId ? l.mesocycleId === meso.id : l.date >= inicio && l.date <= fin)),
    exercises: o.exercises as Exercise[],
    inicio, fin,
    semanas: Math.max(1, Math.ceil(diasDelBloque / 7)),
    semanasDescarga: aSemanas([...new Set([...(meso.semanasDescarga ?? []), ...(meso.deloadWeek ? [meso.deloadWeek] : [])])]),
    semanasPuente: aSemanas(meso.semanasPivot ?? []),
    semanasTest: aSemanas(meso.semanasTest ?? []),
    semanasVueltaDeParon: meso.vuelveDeParon ? aSemanas([1]) : [],
    assignments: (o.assignments ?? []).filter(a => a.mesocycleId === meso.id) as WorkoutAssignment[],
    pesoCorporalKg: o.pesoCorporalKg,
    hoy: o.hoy,
  });
}

function estadoDe(mejoraPct: number | null, objetivoPct: number): EstadoDelObjetivo {
  if (mejoraPct == null) return 'pronto';
  // Objetivo de no perder: lo cumple mientras no baje más que el ruido de medida.
  if (objetivoPct <= 0) return mejoraPct <= -RUIDO_RM_PCT ? 'baja' : 'conseguido';
  if (mejoraPct >= objetivoPct) return 'conseguido';
  if (mejoraPct >= RUIDO_RM_PCT) return 'mejora';
  if (mejoraPct <= -RUIDO_RM_PCT) return 'baja';
  return 'igual';
}

function textoDeZona(nombre: string, estado: EstadoDelObjetivo, mejoraPct: number | null, objetivoPct: number, sinMarcas = false): string {
  const n = mayuscula(nombre);
  switch (estado) {
    case 'pronto': return sinMarcas ? `${n}: aún no se puede medir` : `${n}: todavía es pronto`;
    case 'igual': return `${n}: igual que al empezar`;
    case 'baja': return `${n}: algo por debajo de cuando empezaste`;
    case 'conseguido': return objetivoPct <= 0 ? `${n}: mantienes tu fuerza` : `${n}: ${conSigno(mejoraPct!)} %, objetivo cubierto`;
    default: return `${n}: ${conSigno(mejoraPct!)} % de ${fmt(objetivoPct)} %`;
  }
}

/** Cómo va cada zona prioritaria, con los ejercicios del catálogo cuyo grupo principal cae en ella. */
export function progresoDeLasZonas(
  meso: Pick<Mesocycle, 'hipotesis' | 'tipoBloque'>,
  progresion: Pick<ProgresionDelBloque, 'ejercicios'>,
): ProgresoDeZona[] {
  return zonasQueSuben(meso).map(zona => {
    const grupos = new Set<MuscleGroup>(gruposDeLasZonas([zona]));
    const delGrupo = progresion.ejercicios.filter(e => e.grupo != null && grupos.has(e.grupo));
    const suyos = delGrupo.filter(e => e.metrica === 'e1rm' && e.deltaPct != null);
    const sinMarcas = suyos.length === 0 && delGrupo.length > 0
      && delGrupo.every(e => e.sinComparar === 'sin_marca')
      && delGrupo.some(e => e.sesiones >= SESIONES_PARA_DECIR_SIN_MARCAS);
    const m = mediana(suyos.map(e => e.deltaPct!));
    const mejoraPct = m == null ? null : r1(m);
    const pedido = meso.hipotesis?.[zona]?.rmObjetivoPct;
    // Un 0 escrito es «no perder» (bloque en déficit); sin cifra, el objetivo de siempre.
    const mantener = pedido === 0;
    const objetivoPct = mantener ? 0 : pedido != null && pedido > 0 ? pedido : RM_OBJETIVO_PCT;
    const estado = estadoDe(mejoraPct, objetivoPct);
    const nombre = ZONA_PARA_EL_ATLETA[zona];
    return {
      zona, nombre, objetivoPct, mantener, mejoraPct, ejercicios: suyos.length, estado, sinMarcas,
      // Por debajo del ruido la barra no se mueve: sería decir «has mejorado».
      // Con «no perder», mantenerla ya es tenerla llena.
      fraccion: mantener ? (estado === 'conseguido' ? 1 : 0)
        : estado === 'mejora' || estado === 'conseguido' ? Math.min(1, mejoraPct! / objetivoPct) : 0,
      texto: textoDeZona(nombre, estado, mejoraPct, objetivoPct, sinMarcas),
    };
  });
}

function estadoGlobal(zonas: readonly ProgresoDeZona[]): EstadoDelObjetivo {
  if (zonas.length === 0 || zonas.every(z => z.estado === 'pronto')) return 'pronto';
  if (zonas.every(z => z.estado === 'conseguido')) return 'conseguido';
  if (zonas.some(z => z.estado === 'mejora' || z.estado === 'conseguido')) return 'mejora';
  if (zonas.some(z => z.estado === 'baja')) return 'baja';
  return 'igual';
}

function titularDe(zonas: readonly ProgresoDeZona[], estado: EstadoDelObjetivo): string {
  if (zonas.length === 0) return '';
  if (estado === 'pronto') return zonas.every(z => z.sinMarcas) ? 'Aún no se puede medir' : 'Todavía es pronto para medirlo';
  if (zonas.length > 1) {
    // Corto: «Pecho +4 % · Hombro: todavía es pronto».
    return zonas.map(z => (!z.mantener && (z.estado === 'mejora' || z.estado === 'conseguido') ? `${mayuscula(z.nombre)} ${conSigno(z.mejoraPct!)} %` : z.texto)).join(' · ');
  }
  const z = zonas[0];
  switch (estado) {
    case 'conseguido': return z.mantener ? 'Mantienes tu fuerza' : `Vas por encima del objetivo: ${conSigno(z.mejoraPct!)} %`;
    case 'mejora': return `Llevas un ${fmt(z.mejoraPct!)} % de ${fmt(z.objetivoPct)} %`;
    case 'baja': return 'Ahora mismo mueves algo menos que al empezar';
    default: return 'De momento mueves lo mismo que al empezar';
  }
}

function detalleDe(zonas: readonly ProgresoDeZona[], estado: EstadoDelObjetivo): string {
  if (zonas.length === 0) return '';
  switch (estado) {
    case 'pronto': return zonas.every(z => z.sinMarcas)
      ? 'Con las series de ahora no hay marca que comparar. Apunta cuánto te guardas en cada serie y coméntaselo a tu entrenador.'
      : 'En cuanto tengas dos semanas apuntadas te digo cómo vas. Apunta cada serie.';
    case 'conseguido': return zonas.every(z => z.mantener)
      ? 'Mueves lo mismo que al empezar, que es lo que buscamos en esta fase. Sigue así hasta el final del bloque.'
      : 'Ya mueves lo que buscábamos. Ahora toca sostenerlo hasta el final del bloque.';
    case 'mejora': {
      const atras = zonas.filter(z => z.estado !== 'mejora' && z.estado !== 'conseguido').map(z => z.nombre);
      return atras.length > 0 ? `Vas bien. Falta que arranque ${enLista(atras)}.` : 'Vas en camino. Sigue apretando en estos ejercicios.';
    }
    case 'baja': return 'Pasa algunas semanas. Céntrate en repetir tus marcas y vuelve a subir desde ahí.';
    default: return 'Aún no se nota la diferencia. Busca una repetición más en cada serie.';
  }
}

/**
 * El empujón: de los ejercicios de las zonas prioritarias que tiene pautados
 * esta semana, el que está más cerca de subir de peso y lo que le falta. Usa
 * el MISMO criterio que la tarjeta de la sesión (`veredictoDeSerie`): tope del
 * rango a RIR pautado y, si el salto de carga es grande, las repeticiones de
 * margen que pide. `null` en descarga, puente y vuelta de parón (no se sube) y
 * si no hay ninguna serie anterior con la que comparar.
 */
export function empujonDelObjetivo(o: {
  meso: MesoDelObjetivo;
  /** Las rutinas del bloque (las de otros bloques se ignoran). */
  workouts: readonly Workout[];
  logs: readonly WorkoutLog[];
  exercises: readonly Exercise[];
  hoy: string;
}): Empujon | null {
  const zonas = zonasQueSuben(o.meso);
  if (zonas.length === 0) return null;
  const meso = o.meso as Mesocycle;
  const semana = semanaDelBloque(meso, o.hoy);
  if (tipoDeSemana(meso, semana)) return null;

  const grupos = new Set<MuscleGroup>(gruposDeLasZonas(zonas));
  const porId = new Map(o.exercises.map(e => [e.id, e]));
  const ultimaVez = new Map(entradasDeLaUltimaVez(o.logs as WorkoutLog[], addDays(o.hoy, 1)).map(e => [e.exerciseId, e]));

  let mejor: (Empujon & { orden: number }) | null = null;
  let orden = 0;
  for (const w of o.workouts) {
    if (w.mesocycleId !== meso.id) continue;
    for (const base of w.exercises) {
      const ex = porId.get(base.exerciseId);
      if (!ex?.muscleGroup || !grupos.has(ex.muscleGroup)) continue;
      const previa = ultimaVez.get(base.exerciseId);
      if (!previa) continue;
      const we = resolverEjercicioDelMeso(base, meso, semana);
      const filas = expandSetGroups(we);
      const previas = seriesPrincipales(previa.sets);
      const salto = saltoReal(o.logs as WorkoutLog[], base.exerciseId);
      filas.forEach((fila, i) => {
        const prev = serieDeReferencia(previas, i);
        const rango = rangoDeReps(fila.reps);
        if (!prev || !rango || !(prev.weight > 0) || !(prev.repsDone > 0)) return;
        const v = veredictoDeSerie(prev, fila, salto);
        const nombre = enFrase(ex.name);
        let c: Omit<Empujon, 'exerciseId' | 'nombre'>;
        if (v?.que === 'subir') {
          c = { tipo: 'sube', faltan: 0, peso: prev.weight, pesoNuevo: v.peso, texto: `En ${nombre} ya te toca subir: prueba con ${kg(v.peso)}.` };
        } else {
          const sinMargen = prev.rirApuntado !== true && (!!prev.alFallo || prev.rir < fila.rir);
          const reps = repsAlRirPautado(prev, fila.rir);
          const meta = rango.max + repsExtraAntesDeSubir(prev.weight, salto ?? incrementoDe(prev.weight), rango);
          const faltan = meta - reps;
          if (faltan <= 0 && !sinMargen) return; // no debería pasar: habría veredicto de subir
          c = faltan <= 0
            // Llegó al tope, pero apurando más de lo pautado: lo que falta es margen.
            ? { tipo: 'con_margen', faltan: 0, peso: prev.weight, texto: `En ${nombre} ya llegas a ${meta} con ${kg(prev.weight)}. Hazlas sin ir al límite y subes de peso.` }
            : { tipo: 'faltan_reps', faltan, peso: prev.weight, texto: `Te ${faltan === 1 ? 'falta 1 repetición' : `faltan ${faltan} repeticiones`} en ${nombre} para pasar de ${kg(prev.weight)}.` };
        }
        const cand = { ...c, exerciseId: base.exerciseId, nombre: ex.name, orden: orden++ };
        // El más cerca: el que ya sube, luego al que solo le falta margen, luego menos repeticiones.
        const rango_ = (e: Empujon) => (e.tipo === 'sube' ? -1 : e.tipo === 'con_margen' ? 0 : e.faltan);
        if (!mejor || rango_(cand) < rango_(mejor)) mejor = cand;
      });
    }
  }
  if (!mejor) return null;
  const { orden: _orden, ...empujon } = mejor as Empujon & { orden: number };
  return empujon;
}

/**
 * Todo lo que la franja del objetivo necesita. `null` si el bloque no lleva
 * hipótesis (no se pinta nada).
 */
export function progresoDelObjetivo(o: {
  meso: MesoDelObjetivo | null | undefined;
  logs: readonly WorkoutLog[];
  /** El catálogo dice de qué grupo es cada ejercicio. Sin él no se puede medir
   *  nada: sale la frase y la semana, sin barra (`zonas` vacío). */
  exercises?: readonly Exercise[];
  /** Las rutinas del atleta: de las de este bloque sale el empujón. Sin ellas, no hay empujón. */
  workouts?: readonly Workout[];
  assignments?: readonly WorkoutAssignment[];
  hoy: string;
  /** Nivel del atleta (`OnboardingData.experienceLevel`): a un avanzado se le juzga a dos bloques. */
  nivel?: ExperienceLevel;
  pesoCorporalKg?: number | null;
}): ProgresoDelObjetivo | null {
  const meso = o.meso;
  if (!meso || !meso.startDate || estrellasDe(meso).length === 0) return null;

  const semana = semanaDelBloque(meso, o.hoy);
  const semanas = totalDeSemanasDelBloque(meso);
  const exercises = o.exercises;
  const zonas = exercises ? progresoDeLasZonas(meso, progresionDelBloqueDelAtleta({ ...o, meso, exercises })) : [];
  const estado = estadoGlobal(zonas);
  const sola = zonas.length === 1 ? zonas[0] : null;
  return {
    mesocycleId: meso.id,
    frase: objetivoDelMesoParaElAtleta(meso as Mesocycle, o.nivel),
    semana, semanas,
    semanaTexto: semanas != null ? `Semana ${semana} de ${semanas}` : `Semana ${semana}`,
    zonas, estado,
    fraccion: zonas.length ? zonas.reduce((a, z) => a + z.fraccion, 0) / zonas.length : 0,
    // Con «no perder» no hay cifra que enseñar: se dice con palabras (titular).
    mejoraPct: sola && !sola.mantener ? sola.mejoraPct : null,
    objetivoPct: sola && !sola.mantener ? sola.objetivoPct : null,
    titular: titularDe(zonas, estado),
    detalle: detalleDe(zonas, estado),
    empujon: o.workouts && exercises ? empujonDelObjetivo({ meso, workouts: o.workouts, logs: o.logs, exercises, hoy: o.hoy }) : null,
  };
}
