import type { Exercise, MuscleGroup, WorkoutAssignment, WorkoutLog } from '../types.js';
import { MUSCLE_LABELS } from '../types.js';
import { contextoPesoCorporal, pesoDeSerie } from './pesoCorporal.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';
import { patronesDeEjercicio, PATTERN_LABELS, type MovementPattern } from './movementPatterns.js';
import { RUIDO_RM_PCT } from './ruidoDeMedida.js';
import { mediana as medianaDe } from './rmValido.js';
import {
  ETIQUETA_SIN_MARCA, motivoDeSerieSinMarca, motivoPrincipal, rmValidoDeSerie, type MotivoSinMarca,
} from './marcaDeSesion.js';

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESIÓN DENTRO DEL BLOQUE — cómo ha evolucionado el atleta del principio
// al final del mesociclo, ejercicio por ejercicio.
//
// Por qué existe (16-11-2026): el cierre solo comparaba contra el mesociclo
// ANTERIOR. Casi todos los atletas están en su primer bloque, así que no había
// con qué comparar: todos los % salían vacíos y los récords exigían historial
// previo, así que salían cero. Al coach le quedaban la adherencia y el
// tonelaje bruto, y nada que contarle al cliente.
//
// Aquí la referencia es el propio bloque. Eso responde siempre, haya bloque
// anterior o no, y es lo que el atleta entiende: «empezaste con 80 × 8 y
// acabas con 90 × 8».
//
// CÓMO SE COMPARA (D2b-D4, 17-11-2026). Antes era «la mejor serie de la
// primera semana con datos» contra «la mejor de las dos últimas semanas»: un
// dato único contra un máximo de varios. Simulado con fuerza CONSTANTE y ±1
// repetición de ruido daba +1,4 % de mediana y el 54 % de los ejercicios
// «mejoraba»; con una descarga en la semana 1, +27,6 %. Ahora:
//
//  · Marca de una sesión = el RM de su mejor serie VÁLIDA (`marcaDeSesion.ts`).
//    Una sesión sin series válidas no tiene marca, y se cuenta aparte para que
//    el coach sepa con qué dato se ha decidido.
//  · Progresión del ejercicio = MEDIANA de las marcas de sus 2 primeras
//    semanas comparables contra la MEDIANA de las de las 2 últimas. Lo mismo a
//    los dos lados: el ruido se compensa en vez de sumarse. Con menos de 4
//    semanas con marca, primera mitad contra segunda; con menos de 2, el
//    ejercicio queda «sin referencia».
//  · Semanas NO comparables (D3), fuera de las dos ventanas: descarga, puente,
//    test, la semana 1 cuando vuelve de un parón y la semana en curso a medias.
//  · Solo cuentan (mediana del bloque, «mejora en X de Y», grupos y patrones)
//    los ejercicios con marca en MÁS DE LA MITAD de las semanas comparables
//    (D4). Los demás se listan aparte como «pocas semanas para comparar»: ni
//    a favor ni en contra.
//
// Determinista y sin IA, igual que el resto del cierre.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Variación (en %) por debajo de la cual un ejercicio se considera estable.
 * Era un 2 % propio de este motor; desde el 17-11-2026 es el ruido de medida
 * del RM estimado, el mismo en toda la app (ver `ruidoDeMedida.ts`): una
 * repetición más o menos ya mueve el RM un 2,5-3 %.
 */
export const UMBRAL_ESTABLE_PCT = RUIDO_RM_PCT;

/** Semanas a cada lado de la comparación cuando hay al menos cuatro con marca. */
export const SEMANAS_POR_VENTANA = 2;

export interface MejorSerie {
  fecha: string;
  semana: number;
  kg: number;
  reps: number;
  /** RIR registrado; `null` si fue al fallo o si la serie no lo trae apuntado. */
  rir: number | null;
  alFallo: boolean;
  /**
   * 1RM estimado (fórmula CDG, con el RIR). 0 si la serie no vale para estimarlo.
   * En `inicio` y `final` es la MEDIANA de las marcas de la ventana, que es lo
   * que se compara; la serie (kg × reps) es la de la sesión más cercana a ella.
   */
  e1rm: number;
}

/** Cómo se ha conseguido la mejora — lo que se le dice al atleta. */
export type ViaDeMejora =
  | 'mas_carga'        // sube el peso
  | 'mas_reps'         // mismo peso, más repeticiones
  | 'menos_esfuerzo'   // mismo peso y reps, más lejos del fallo
  | 'mixta'            // e1RM sube por una combinación (p. ej. menos peso, muchas más reps)
  | 'ninguna';

export type EstadoEjercicio = 'mejora' | 'estable' | 'baja' | 'sin_referencia';

/**
 * Por qué un ejercicio se queda sin comparar (`estado: 'sin_referencia'`):
 *  · `sin_marca` — tiene peso, pero ninguna sesión con una serie válida;
 *  · `menos_de_dos_semanas` — marca en una sola semana comparable (o ninguna);
 *  · `pocas_semanas` — se podría comparar, pero tiene marca en la mitad o
 *    menos de las semanas comparables del bloque (D4): no cuenta ni a favor ni
 *    en contra.
 */
export type MotivoSinComparar = 'sin_marca' | 'menos_de_dos_semanas' | 'pocas_semanas';

/** Por qué una semana no entra en las ventanas de comparación (D3). */
export type MotivoNoComparable = 'descarga' | 'puente' | 'test' | 'vuelta_de_paron' | 'incompleta';

export interface ProgresionEjercicio {
  exerciseId: string;
  nombre: string;
  grupo: MuscleGroup | null;
  grupoLabel: string;
  patrones: MovementPattern[];
  /** Días distintos en que se hizo. */
  sesiones: number;
  /** Series principales (sin segmentos de drop/myo). */
  series: number;
  tonelaje: number;
  /** Semanas distintas con marca (cualquier semana, comparable o no). */
  semanasConDatos: number;
  /** Semanas COMPARABLES con marca: las que deciden si el ejercicio cuenta (D4). */
  semanasConMarca: number;
  /** La métrica con la que se compara: 1RM estimado o, sin peso, repeticiones. */
  metrica: 'e1rm' | 'reps';
  /** Serie representativa de la ventana inicial (ver `MejorSerie.e1rm`). `null` si no se compara. */
  inicio: MejorSerie | null;
  /** Lo mismo de la ventana final. */
  final: MejorSerie | null;
  /** La mejor serie válida de todo el bloque (la marca del bloque). */
  pico: MejorSerie | null;
  /** Mediana de la ventana final vs la inicial, en la métrica. `null` si el ejercicio no se compara. */
  deltaPct: number | null;
  /** Diferencia de kg entre la serie representativa final y la inicial. */
  deltaKg: number | null;
  /** Diferencia de reps entre la serie representativa final y la inicial. */
  deltaReps: number | null;
  via: ViaDeMejora;
  estado: EstadoEjercicio;
  /** Con `estado: 'sin_referencia'`, por qué; `null` si se compara. */
  sinComparar: MotivoSinComparar | null;
  /** Sesiones del ejercicio con peso y ninguna serie válida (sin marca). */
  sesionesSinMarca: number;
  /** Mediana de las marcas de cada semana del bloque (índice 0 = semana 1). `null` = sin marca. */
  semanal: (number | null)[];
  /** Frase corta: «80 kg × 8 → 90 kg × 8» (series representativas), o por qué no se compara. */
  lectura: string;
  /** Frase de cómo ha mejorado: «+10 kg con las mismas reps». */
  comoMejora: string;
}

export interface SemanaDelBloque {
  semana: number;
  inicio: string;
  sesionesHechas: number;
  sesionesProgramadas: number;
  series: number;
  tonelaje: number;
  /** RIR medio de las series principales con RIR apuntado (las de al fallo cuentan 0; las que no lo traen, no entran). */
  rirMedio: number | null;
  /** Mediana de (marca de la semana / marca de la ventana inicial) × 100 de los ejercicios que cuentan. 100 = como empezó. */
  indiceFuerza: number | null;
  /** Duración media de las sesiones con duración registrada, en minutos. */
  duracionMediaMin: number | null;
  esDescarga: boolean;
  /** Entra en las ventanas de comparación (D3): ni descarga, ni puente, ni test, ni vuelta de parón, ni a medias. */
  comparable: boolean;
  /** Por qué no es comparable; `null` si lo es. */
  motivoNoComparable: MotivoNoComparable | null;
  /** La semana aún no ha terminado (bloque en curso): no se puede leer como «saltada». */
  enCurso: boolean;
  /** En curso y con sesiones de la semana aún por hacer: sus kg no son los de una semana entera. */
  incompleta: boolean;
}

export interface FilaAgregada<K extends string> {
  clave: K;
  label: string;
  /** Ejercicios del grupo o patrón que CUENTAN (D4); los de pocas semanas no entran. */
  ejercicios: number;
  mejoran: number;
  /** Media de `deltaPct` de esos ejercicios. */
  deltaMedioPct: number | null;
  /** El ejercicio que más sube del grupo/patrón. */
  mejor: { nombre: string; deltaPct: number } | null;
}

export interface ProgresionDelBloque {
  semanas: SemanaDelBloque[];
  ejercicios: ProgresionEjercicio[];
  resumen: {
    /** Ejercicios que cuentan: comparables y con marca en más de la mitad de las semanas comparables (D4). */
    comparables: number;
    mejoran: number;
    estables: number;
    bajan: number;
    /** Mediana de `deltaPct` de los comparables — el «cuánto más fuerte» del bloque. */
    medianaPct: number | null;
    /** Tonelaje semanal: primera semana comparable con datos → media de las dos últimas. */
    tonelajeSemanal: { inicio: number; final: number; deltaPct: number | null } | null;
    /** RIR medio: primera semana → última, sin descargas, puentes, tests ni la vuelta de un parón. Bajar = entrena más cerca del fallo. */
    rir: { inicio: number; final: number } | null;
    /** Media de kg añadidos a la serie representativa en los ejercicios que subieron carga. */
    kgMedioAnadido: number | null;
    /** Semanas comparables con alguna sesión registrada: el denominador de D4. */
    semanasComparables: number;
    /** Ejercicios que se podrían comparar pero no cuentan por tener marca en pocas semanas (D4). */
    pocasSemanas: { exerciseId: string; nombre: string; semanasConMarca: number }[];
    /**
     * Con qué dato se ha decidido: de las veces que se hizo un ejercicio con
     * peso (`registros`: un ejercicio en una sesión), cuántas se quedaron sin
     * marca por no tener ninguna serie válida, y por qué.
     */
    sinMarca: {
      registros: number;
      sinMarca: number;
      porMotivo: Partial<Record<MotivoSinMarca, number>>;
      motivoPrincipal: MotivoSinMarca | null;
    };
  };
  porPatron: FilaAgregada<MovementPattern>[];
  porGrupo: FilaAgregada<MuscleGroup>[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10;

function pctDe(actual: number, ref: number): number | null {
  if (!ref) return null;
  return r1(((actual - ref) / ref) * 100);
}

function mediana(xs: number[]): number | null {
  const m = medianaDe(xs);
  return m == null ? null : r1(m);
}

function media(xs: number[]): number | null {
  return xs.length ? r1(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
}

function fmtKg(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

export function textoSerie(s: Pick<MejorSerie, 'kg' | 'reps'>): string {
  return s.kg > 0 ? `${fmtKg(s.kg)} kg × ${s.reps}` : `${s.reps} reps`;
}

/**
 * RIR de una serie, o `null` si no lo trae apuntado. Antes un RIR vacío valía
 * 0, así que un bloque registrado sin RIR «acababa al fallo» y disparaba la
 * acción de empezar con descarga. Mismo criterio que `rirStats.ts`: lo que no
 * se apuntó no entra en la media. Al fallo sí es un 0 de verdad.
 */
function rirDe(s: { rir?: number | string | null; alFallo?: boolean }): number | null {
  if (s.alFallo) return 0;
  if (s.rir == null || (typeof s.rir === 'string' && s.rir.trim() === '')) return null;
  const n = Number(s.rir);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** ¿Es `a` mejor serie que `b` en la métrica dada? */
function mejorQue(a: MejorSerie, b: MejorSerie | null, metrica: 'e1rm' | 'reps'): boolean {
  if (!b) return true;
  if (metrica === 'e1rm') return a.e1rm > b.e1rm || (a.e1rm === b.e1rm && a.kg > b.kg);
  return a.reps > b.reps || (a.reps === b.reps && (a.rir ?? 0) > (b.rir ?? 0));
}

function valorDe(s: MejorSerie, metrica: 'e1rm' | 'reps'): number {
  return metrica === 'e1rm' ? s.e1rm : s.reps;
}

/**
 * Las dos ventanas que se comparan, sobre las semanas comparables en las que
 * el ejercicio tiene marca: las `SEMANAS_POR_VENTANA` primeras contra las
 * últimas; con menos de cuatro, primera mitad contra segunda (con tres, la de
 * en medio no entra en ninguna). `null` con menos de dos.
 */
export function ventanasDeComparacion(semanasConMarca: readonly number[]): { inicio: number[]; final: number[] } | null {
  const n = semanasConMarca.length;
  if (n < 2) return null;
  const lado = n >= SEMANAS_POR_VENTANA * 2 ? SEMANAS_POR_VENTANA : Math.floor(n / 2);
  return { inicio: semanasConMarca.slice(0, lado), final: semanasConMarca.slice(-lado) };
}

/**
 * Lo que vale una ventana: la mediana de sus marcas de sesión, y la serie que
 * la representa en el texto («80 kg × 8»): la de la marca central (con un
 * número par de sesiones, la más baja de las dos centrales, a los dos lados
 * igual).
 */
function resumirVentana(marcas: MejorSerie[], metrica: 'e1rm' | 'reps'): { valor: number; serie: MejorSerie } | null {
  if (marcas.length === 0) return null;
  const orden = [...marcas].sort((a, b) =>
    valorDe(a, metrica) - valorDe(b, metrica) || a.kg - b.kg || a.fecha.localeCompare(b.fecha));
  const valor = medianaDe(orden.map(m => valorDe(m, metrica)))!;
  return { valor, serie: orden[Math.floor((orden.length - 1) / 2)] };
}

function clasificarVia(ini: MejorSerie, fin: MejorSerie, metrica: 'e1rm' | 'reps', deltaPct: number): ViaDeMejora {
  if (deltaPct < UMBRAL_ESTABLE_PCT && metrica === 'e1rm') {
    // Sin subida de e1RM puede haber igualmente una mejora real: mismo peso y
    // reps con más margen. La fórmula ya lo recoge (RIR), pero por debajo del
    // umbral no lo llamamos mejora.
    return 'ninguna';
  }
  const dKg = r1(fin.kg - ini.kg);
  const dReps = fin.reps - ini.reps;
  const dRir = (fin.rir ?? 0) - (ini.rir ?? 0);
  if (metrica === 'reps') return dReps > 0 ? 'mas_reps' : dRir > 0 ? 'menos_esfuerzo' : 'mixta';
  if (dKg > 0 && dReps >= 0) return 'mas_carga';
  if (Math.abs(dKg) < 0.01 && dReps > 0) return 'mas_reps';
  if (Math.abs(dKg) < 0.01 && dReps === 0 && dRir > 0) return 'menos_esfuerzo';
  if (dKg > 0) return 'mas_carga';
  return 'mixta';
}

function fraseComo(ini: MejorSerie, fin: MejorSerie, via: ViaDeMejora): string {
  const dKg = r1(fin.kg - ini.kg);
  const dReps = fin.reps - ini.reps;
  switch (via) {
    case 'mas_carga':
      return dReps === 0
        ? `+${fmtKg(dKg)} kg con las mismas reps`
        : `+${fmtKg(dKg)} kg y ${dReps > 0 ? `+${dReps}` : dReps} reps`;
    case 'mas_reps':
      return `+${dReps} reps con el mismo peso`;
    case 'menos_esfuerzo':
      return `mismo trabajo con más margen (RIR ${ini.rir ?? 0} → ${fin.rir ?? 0})`;
    case 'mixta':
      // La vía sale de las series representativas de cada ventana. Si son la
      // misma serie, la mejora está en el conjunto de las sesiones (más días
      // buenos que al empezar) y no hay un «+X kg» que contar: se dice así.
      return dKg < 0 ? `menos peso pero ${dReps > 0 ? `+${dReps}` : dReps} reps: más rendimiento estimado`
        : dKg === 0 && dReps === 0 ? 'misma serie típica, pero más sesiones buenas que al empezar'
        : 'mejor rendimiento estimado';
    default:
      return '';
  }
}

// ── Motor ────────────────────────────────────────────────────────────────────

export function buildProgresionDelBloque(params: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  inicio: string;
  fin: string;
  semanas: number;
  /** Semanas (1-indexadas, de 7 días) de descarga: no entran en la comparación. */
  semanasDescarga?: number[];
  /** Semanas puente (`Mesocycle.semanasPivot`, ya en semanas de 7 días): tampoco. */
  semanasPuente?: number[];
  /** Semanas de test (`Mesocycle.semanasTest`): se entrena a AMRAP, no es la misma tarea. */
  semanasTest?: number[];
  /** Semanas de la vuelta de un parón (`Mesocycle.vuelveDeParon` → la 1): va a RIR 3 o más. */
  semanasVueltaDeParon?: number[];
  /** Asignaciones del bloque, para las sesiones programadas por semana. */
  assignments?: WorkoutAssignment[];
  pesoCorporalKg?: number | null;
  /** Hasta qué fecha hay que pintar semanas (para un bloque en curso). */
  hoy?: string;
}): ProgresionDelBloque {
  const { exercises, inicio, fin } = params;
  const ctx = contextoPesoCorporal(exercises, params.pesoCorporalKg);
  const descarga = new Set(params.semanasDescarga ?? []);
  const puente = new Set(params.semanasPuente ?? []);
  const test = new Set(params.semanasTest ?? []);
  const vuelta = new Set(params.semanasVueltaDeParon ?? []);
  const porId = new Map(exercises.map(e => [e.id, e]));
  const semanaDe = (fecha: string) => Math.floor(diasEntreFechas(inicio, fecha) / 7) + 1;

  const ultimaFecha = params.hoy && params.hoy < fin ? params.hoy : fin;
  const nSemanas = Math.max(1, Math.min(params.semanas, semanaDe(ultimaFecha)));

  const logs = params.logs
    .filter(l => l.date >= inicio && l.date <= fin)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Recorrido por ejercicio ───────────────────────────────────────────────
  interface Acc {
    fechas: Set<string>;
    series: number;
    tonelaje: number;
    // La marca de cada sesión (por fecha), con las dos métricas a la vez: se
    // decide luego cuál vale para el ejercicio.
    marcaRm: Map<string, MejorSerie>;
    marcaReps: Map<string, MejorSerie>;
    /** Sesiones con alguna serie principal con peso, y por qué no valieron sus series. */
    conPeso: Map<string, Partial<Record<MotivoSinMarca, number>>>;
  }
  const accs = new Map<string, Acc>();

  const semanas: SemanaDelBloque[] = Array.from({ length: nSemanas }, (_, i) => ({
    semana: i + 1,
    inicio: addDays(inicio, i * 7),
    sesionesHechas: 0,
    sesionesProgramadas: 0,
    series: 0,
    tonelaje: 0,
    rirMedio: null,
    indiceFuerza: null,
    duracionMediaMin: null,
    esDescarga: descarga.has(i + 1),
    comparable: true,
    motivoNoComparable: null,
    // La última semana puede acabar antes de sus 7 días si el bloque no dura
    // semanas enteras (ciclos de 5 o 9 días): termina cuando termina el bloque.
    enCurso: !!params.hoy && (addDays(inicio, i * 7 + 6) < fin ? addDays(inicio, i * 7 + 6) : fin) >= params.hoy,
    incompleta: false,
  }));
  const rirPorSemana = semanas.map(() => [] as number[]);
  const durPorSemana = semanas.map(() => [] as number[]);
  const diasPorSemana = semanas.map(() => new Set<string>());

  for (const log of logs) {
    const sem = semanaDe(log.date);
    const fila = semanas[sem - 1];
    if (fila) {
      diasPorSemana[sem - 1].add(log.date);
      if (log.duracionSeg && log.duracionSeg > 0) durPorSemana[sem - 1].push(log.duracionSeg / 60);
    }
    for (const entry of log.entries ?? []) {
      let acc = accs.get(entry.exerciseId);
      if (!acc) {
        acc = { fechas: new Set(), series: 0, tonelaje: 0, marcaRm: new Map(), marcaReps: new Map(), conPeso: new Map() };
        accs.set(entry.exerciseId, acc);
      }
      acc.fechas.add(log.date);
      const principales = seriesPrincipales(entry.sets ?? []).length;
      acc.series += principales;
      if (fila) fila.series += principales;

      for (const s of entry.sets ?? []) {
        const kg = pesoDeSerie(s.weight, entry.exerciseId, ctx);
        const reps = Number(s.repsDone) || 0;
        const t = kg * reps;
        acc.tonelaje = r1(acc.tonelaje + t);
        if (fila) fila.tonelaje = r1(fila.tonelaje + t);
        if (s.segmento || reps <= 0) continue;
        const rir = rirDe(s);
        if (rir != null && fila) rirPorSemana[sem - 1].push(rir);

        // Solo las series válidas dan RM (`rmValido.ts`); el resto vale 0 y no
        // puede ser la marca de la sesión.
        const serie: MejorSerie = {
          fecha: log.date, semana: sem, kg: r1(kg), reps,
          rir: s.alFallo ? null : rir, alFallo: !!s.alFallo,
          e1rm: rmValidoDeSerie(s, kg) ?? 0,
        };
        if (kg > 0) {
          const motivos = acc.conPeso.get(log.date) ?? {};
          const motivo = serie.e1rm > 0 ? null : motivoDeSerieSinMarca(s);
          if (motivo) motivos[motivo] = (motivos[motivo] ?? 0) + 1;
          acc.conPeso.set(log.date, motivos);
        }
        if (serie.e1rm > 0 && mejorQue(serie, acc.marcaRm.get(log.date) ?? null, 'e1rm')) acc.marcaRm.set(log.date, serie);
        if (mejorQue(serie, acc.marcaReps.get(log.date) ?? null, 'reps')) acc.marcaReps.set(log.date, serie);
      }
    }
  }

  semanas.forEach((s, i) => {
    s.sesionesHechas = diasPorSemana[i].size;
    s.rirMedio = media(rirPorSemana[i]);
    s.duracionMediaMin = durPorSemana[i].length ? Math.round(durPorSemana[i].reduce((a, b) => a + b, 0) / durPorSemana[i].length) : null;
  });
  for (const a of params.assignments ?? []) {
    if (!a.date || a.date < inicio || a.date > fin) continue;
    const fila = semanas[semanaDe(a.date) - 1];
    if (fila) fila.sesionesProgramadas++;
  }
  for (const s of semanas) {
    // Una semana en curso solo se da por entera si ya se hizo todo lo que tenía
    // programado; sin asignaciones no se puede saber, así que se trata como a medias.
    s.incompleta = s.enCurso && !(s.sesionesProgramadas > 0 && s.sesionesHechas >= s.sesionesProgramadas);
    // D3: lo que no es la misma tarea que el resto del bloque no se compara.
    s.motivoNoComparable = descarga.has(s.semana) ? 'descarga'
      : puente.has(s.semana) ? 'puente'
      : test.has(s.semana) ? 'test'
      : vuelta.has(s.semana) ? 'vuelta_de_paron'
      : s.incompleta ? 'incompleta' : null;
    s.comparable = s.motivoNoComparable === null;
  }
  const esComparable = (semana: number) => semanas[semana - 1]?.comparable === true;
  // El denominador de D4: semanas comparables en las que se entrenó. Una
  // semana sin ninguna sesión (enfermo, de viaje) no le quita la marca a un
  // ejercicio en concreto, se la quita a todos: no puede dejarlos sin contar.
  const semanasComparables = semanas.filter(s => s.comparable && s.sesionesHechas > 0).length;

  // ── Comparación inicio / final por ejercicio ──────────────────────────────
  const ejercicios: ProgresionEjercicio[] = [];
  const pocasSemanas: ProgresionDelBloque['resumen']['pocasSemanas'] = [];
  const sinMarcaPorMotivo: Partial<Record<MotivoSinMarca, number>> = {};
  let registrosConPeso = 0;
  let registrosSinMarca = 0;

  for (const [exerciseId, acc] of accs) {
    const ex = porId.get(exerciseId);
    const nombre = ex?.name ?? `Ejercicio (…${exerciseId.slice(-6)})`;
    // Con peso en la mayoría de sus sesiones → 1RM estimado; si no,
    // repeticiones. Se decide por el peso y no por si hay marca: un ejercicio
    // con peso hecho siempre a 15 repeticiones no pasa a compararse por
    // repeticiones (sin mirar los kilos), se queda sin marca.
    const metrica: 'e1rm' | 'reps' = acc.conPeso.size > 0 && acc.conPeso.size >= acc.marcaReps.size / 2 ? 'e1rm' : 'reps';
    const marcas = metrica === 'e1rm' ? acc.marcaRm : acc.marcaReps;

    // Con qué dato se decide: sesiones con peso que se quedan sin marca.
    let sesionesSinMarca = 0;
    const motivosDelEjercicio: Partial<Record<MotivoSinMarca, number>> = {};
    if (metrica === 'e1rm') {
      for (const [fecha, motivos] of acc.conPeso) {
        registrosConPeso++;
        if (acc.marcaRm.has(fecha)) continue;
        sesionesSinMarca++;
        registrosSinMarca++;
        const motivo = motivoPrincipal(motivos);
        if (motivo) {
          sinMarcaPorMotivo[motivo] = (sinMarcaPorMotivo[motivo] ?? 0) + 1;
          motivosDelEjercicio[motivo] = (motivosDelEjercicio[motivo] ?? 0) + 1;
        }
      }
    }

    const porSemana = new Map<number, MejorSerie[]>();
    let pico: MejorSerie | null = null;
    for (const m of marcas.values()) {
      porSemana.set(m.semana, [...(porSemana.get(m.semana) ?? []), m]);
      if (mejorQue(m, pico, metrica)) pico = m;
    }
    const semanasOrden = [...porSemana.keys()].sort((a, b) => a - b);
    const conMarca = semanasOrden.filter(esComparable);
    const ventanas = ventanasDeComparacion(conMarca);
    // D4: con marca en la mitad o menos de las semanas comparables, no cuenta.
    const cuenta = !!ventanas && conMarca.length * 2 > semanasComparables;
    const deLaVentana = (ss: number[]) => resumirVentana(ss.flatMap(s => porSemana.get(s)!), metrica);
    const ini = cuenta ? deLaVentana(ventanas!.inicio) : null;
    const fin_ = cuenta ? deLaVentana(ventanas!.final) : null;

    const deltaPct = ini && fin_ ? pctDe(fin_.valor, ini.valor) : null;
    const estado: EstadoEjercicio = deltaPct == null ? 'sin_referencia'
      : deltaPct >= UMBRAL_ESTABLE_PCT ? 'mejora'
      : deltaPct <= -UMBRAL_ESTABLE_PCT ? 'baja' : 'estable';
    const sinComparar: MotivoSinComparar | null = deltaPct != null ? null
      : ventanas ? 'pocas_semanas'
      : metrica === 'e1rm' && marcas.size === 0 ? 'sin_marca' : 'menos_de_dos_semanas';
    if (sinComparar === 'pocas_semanas') pocasSemanas.push({ exerciseId, nombre, semanasConMarca: conMarca.length });

    // Lo que se enseña de cada ventana: la serie representativa, con la
    // mediana de la ventana como su 1RM (es lo que se ha comparado).
    const conMediana = (v: { valor: number; serie: MejorSerie }): MejorSerie =>
      (metrica === 'e1rm' ? { ...v.serie, e1rm: r1(v.valor) } : v.serie);
    const inicioS = deltaPct != null && ini ? conMediana(ini) : null;
    const finalS = deltaPct != null && fin_ ? conMediana(fin_) : null;
    const via = inicioS && finalS && deltaPct != null && estado === 'mejora'
      ? clasificarVia(inicioS, finalS, metrica, deltaPct) : 'ninguna';

    const motivoDelEjercicio = motivoPrincipal(motivosDelEjercicio);
    const lectura = inicioS && finalS ? `${textoSerie(inicioS)} → ${textoSerie(finalS)}`
      : sinComparar === 'pocas_semanas' ? `Pocas semanas para comparar: con marca en ${conMarca.length} de ${semanasComparables}`
      : sinComparar === 'sin_marca' ? `Sin marca: ninguna serie válida${motivoDelEjercicio ? ` (${ETIQUETA_SIN_MARCA[motivoDelEjercicio]})` : ''}`
      : pico ? textoSerie(pico) : '';

    const grupo = ex?.muscleGroup ?? null;
    ejercicios.push({
      exerciseId,
      nombre,
      grupo,
      grupoLabel: grupo ? MUSCLE_LABELS[grupo] : 'Sin grupo',
      patrones: patronesDeEjercicio(ex),
      sesiones: acc.fechas.size,
      series: acc.series,
      tonelaje: acc.tonelaje,
      semanasConDatos: semanasOrden.length,
      semanasConMarca: conMarca.length,
      metrica,
      inicio: inicioS,
      final: finalS,
      pico,
      deltaPct,
      deltaKg: inicioS && finalS ? r1(finalS.kg - inicioS.kg) : null,
      deltaReps: inicioS && finalS ? finalS.reps - inicioS.reps : null,
      via,
      estado,
      sinComparar,
      sesionesSinMarca,
      semanal: Array.from({ length: nSemanas }, (_, i) => {
        const ms = porSemana.get(i + 1);
        return ms ? mediana(ms.map(m => valorDe(m, metrica))) : null;
      }),
      lectura,
      comoMejora: inicioS && finalS ? fraseComo(inicioS, finalS, via) : '',
    });
  }
  // Primero lo que más sube; los que no se pueden comparar, al final.
  ejercicios.sort((a, b) => {
    if (a.deltaPct == null && b.deltaPct == null) return b.series - a.series;
    if (a.deltaPct == null) return 1;
    if (b.deltaPct == null) return -1;
    return b.deltaPct - a.deltaPct;
  });

  // ── Índice de fuerza semanal (100 = como empezó cada ejercicio) ───────────
  // Solo con los ejercicios que cuentan (D4): tienen ventana inicial, y su
  // referencia es la mediana de esa ventana, no un día suelto.
  const conRm = ejercicios.filter(e => e.metrica === 'e1rm' && e.inicio && e.inicio.e1rm > 0);
  semanas.forEach((s, i) => {
    const ratios = conRm
      .map(e => (e.semanal[i] != null ? (e.semanal[i]! / e.inicio!.e1rm) * 100 : null))
      .filter((x): x is number => x != null);
    // Mediana y no media: un solo ejercicio con la primera semana mal apuntada
    // (5 kg en vez de 50) disparaba la línea a 600 con datos reales.
    s.indiceFuerza = mediana(ratios);
  });

  // ── Resumen ──────────────────────────────────────────────────────────────
  const comparables = ejercicios.filter(e => e.deltaPct != null);
  // Sin la semana en curso a medias: con dos sesiones de cuatro hechas salía
  // «mueve menos kg por semana: −50 %» de un atleta que iba al día. Y sin las
  // demás semanas no comparables (D3): un puente o la vuelta de un parón de
  // referencia inflan la subida igual que una descarga.
  const conTonelaje = semanas.filter(s => s.tonelaje > 0 && s.comparable);
  const tonelajeSemanal = conTonelaje.length >= 2
    ? (() => {
        const ini = conTonelaje[0].tonelaje;
        const ult = conTonelaje.slice(1).slice(-2); // nunca la propia semana de referencia
        const fin = r1(ult.reduce((a, s) => a + s.tonelaje, 0) / ult.length);
        return { inicio: ini, final: fin, deltaPct: pctDe(fin, ini) };
      })()
    : null;
  // El RIR de una semana a medias sí vale (es el de las series hechas); el de
  // una descarga, un test (AMRAP) o la vuelta de un parón (RIR 3+) es el que
  // se pautó para esa semana, no cómo entrena.
  const conRir = semanas.filter(s => s.rirMedio != null && (s.comparable || s.motivoNoComparable === 'incompleta'));
  const rir = conRir.length >= 2 ? { inicio: conRir[0].rirMedio!, final: conRir[conRir.length - 1].rirMedio! } : null;
  const subenCarga = comparables.filter(e => (e.deltaKg ?? 0) > 0 && e.metrica === 'e1rm');

  // ── Agregados por patrón y por grupo ─────────────────────────────────────
  // Solo con los ejercicios que cuentan (D4); un grupo sin ninguno no sale.
  function agregar<K extends string>(claves: (e: ProgresionEjercicio) => K[], label: (k: K) => string): FilaAgregada<K>[] {
    const m = new Map<K, ProgresionEjercicio[]>();
    for (const e of comparables) for (const k of claves(e)) {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()].map(([clave, comp]) => {
      const mejor = [...comp].sort((a, b) => b.deltaPct! - a.deltaPct!)[0];
      return {
        clave,
        label: label(clave),
        ejercicios: comp.length,
        mejoran: comp.filter(e => e.estado === 'mejora').length,
        deltaMedioPct: media(comp.map(e => e.deltaPct!)),
        mejor: mejor ? { nombre: mejor.nombre, deltaPct: mejor.deltaPct! } : null,
      };
    }).sort((a, b) => (b.deltaMedioPct ?? -Infinity) - (a.deltaMedioPct ?? -Infinity));
  }

  return {
    semanas,
    ejercicios,
    resumen: {
      comparables: comparables.length,
      mejoran: comparables.filter(e => e.estado === 'mejora').length,
      estables: comparables.filter(e => e.estado === 'estable').length,
      bajan: comparables.filter(e => e.estado === 'baja').length,
      medianaPct: mediana(comparables.map(e => e.deltaPct!)),
      tonelajeSemanal,
      rir,
      kgMedioAnadido: media(subenCarga.map(e => e.deltaKg!)),
      semanasComparables,
      pocasSemanas: pocasSemanas.sort((a, b) => b.semanasConMarca - a.semanasConMarca || a.nombre.localeCompare(b.nombre)),
      sinMarca: {
        registros: registrosConPeso,
        sinMarca: registrosSinMarca,
        porMotivo: sinMarcaPorMotivo,
        motivoPrincipal: motivoPrincipal(sinMarcaPorMotivo),
      },
    },
    porPatron: agregar<MovementPattern>(e => e.patrones, k => PATTERN_LABELS[k]),
    porGrupo: agregar<MuscleGroup>(e => (e.grupo ? [e.grupo] : []), k => MUSCLE_LABELS[k]),
  };
}

/** Cómo se nombra cada motivo en pantalla. */
export const ETIQUETA_NO_COMPARABLE: Record<MotivoNoComparable, string> = {
  descarga: 'descarga',
  puente: 'puente',
  test: 'test',
  vuelta_de_paron: 'vuelta de parón',
  incompleta: 'en curso',
};

/** «S1 (vuelta de parón), S8 (descarga)»: las semanas que no entran en la comparación. `null` si entran todas. */
export function notaDeSemanasFuera(semanas: readonly Pick<SemanaDelBloque, 'semana' | 'comparable' | 'motivoNoComparable'>[]): string | null {
  const fuera = semanas.filter(s => !s.comparable && s.motivoNoComparable);
  if (fuera.length === 0) return null;
  return `No entran en la comparación de fuerza: ${fuera.map(s => `S${s.semana} (${ETIQUETA_NO_COMPARABLE[s.motivoNoComparable!]})`).join(', ')}.`;
}

/** «Pocas semanas para comparar (no cuentan): Curl (2 sem.), Remo (3 sem.)». `null` si no hay ninguno. */
export function notaDePocasSemanas(resumen: Pick<ProgresionDelBloque['resumen'], 'pocasSemanas' | 'semanasComparables'>): string | null {
  const lista = resumen.pocasSemanas ?? [];
  if (lista.length === 0) return null;
  const nombres = lista.slice(0, 6).map(e => `${e.nombre} (${e.semanasConMarca} sem.)`).join(', ');
  return `Pocas semanas para comparar, no cuentan a favor ni en contra (hace falta marca en más de la mitad de las ${resumen.semanasComparables} comparables): `
    + `${nombres}${lista.length > 6 ? ` y ${lista.length - 6} más` : ''}.`;
}

/**
 * La línea discreta del cierre: cuántas veces un ejercicio se quedó sin marca
 * y por qué. `null` si todas las sesiones dieron marca (o no hay ninguna).
 * El coach tiene que saber con qué dato se ha decidido (D4c).
 */
export function notaDeSesionesSinMarca(sinMarca: ProgresionDelBloque['resumen']['sinMarca']): string | null {
  if (!sinMarca || sinMarca.sinMarca <= 0) return null;
  const motivo = sinMarca.motivoPrincipal ? `; lo más frecuente, ${ETIQUETA_SIN_MARCA[sinMarca.motivoPrincipal]}` : '';
  return `Sin marca de fuerza en ${sinMarca.sinMarca} de las ${sinMarca.registros} veces que hizo un ejercicio con peso: `
    + `ninguna serie válida para estimar el RM (de 3 a 12 repeticiones y RIR 2 o menos, apuntado${motivo}).`;
}
