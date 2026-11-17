import type { Exercise, MuscleGroup, WorkoutAssignment, WorkoutLog } from '../types.js';
import { MUSCLE_LABELS } from '../types.js';
import { rmDeSerie } from './oneRepMax.js';
import { cuentaParaRm } from './trainingReport.js';
import { contextoPesoCorporal, pesoDeSerie } from './pesoCorporal.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { addDays, diasEntreFechas } from './trainingWeek.js';
import { patronesDeGrupo, PATTERN_LABELS, type MovementPattern } from './movementPatterns.js';
import { RUIDO_RM_PCT } from './ruidoDeMedida.js';

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
// Aquí la referencia es el propio bloque: la mejor serie de la primera semana
// en que aparece cada ejercicio frente a la mejor de las últimas. Eso responde
// siempre, haya bloque anterior o no, y es lo que el atleta entiende: «empezaste
// con 80 × 8 y acabas con 90 × 8».
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

export interface MejorSerie {
  fecha: string;
  semana: number;
  kg: number;
  reps: number;
  /** RIR registrado; `null` si fue al fallo o si la serie no lo trae apuntado. */
  rir: number | null;
  alFallo: boolean;
  /** 1RM estimado (fórmula CDG, con el RIR). 0 si la serie no da para estimarlo. */
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
  /** Semanas distintas con al menos una serie válida. */
  semanasConDatos: number;
  /** La métrica con la que se compara: 1RM estimado o, sin peso, repeticiones. */
  metrica: 'e1rm' | 'reps';
  inicio: MejorSerie | null;
  final: MejorSerie | null;
  /** La mejor serie de todo el bloque (la marca del bloque). */
  pico: MejorSerie | null;
  /** final vs inicio, en la métrica. `null` sin dos semanas distintas con datos. */
  deltaPct: number | null;
  /** Diferencia absoluta de kg entre la mejor serie final y la inicial. */
  deltaKg: number | null;
  /** Diferencia absoluta de reps entre la mejor serie final y la inicial. */
  deltaReps: number | null;
  via: ViaDeMejora;
  estado: EstadoEjercicio;
  /** Mejor valor de la métrica por semana del bloque (índice 0 = semana 1). `null` = no se hizo. */
  semanal: (number | null)[];
  /** Frase corta: «80 kg × 8 → 90 kg × 8». */
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
  /** Mediana de (e1RM de la semana / e1RM de referencia) × 100 de los ejercicios hechos esa semana. 100 = como empezó. */
  indiceFuerza: number | null;
  /** Duración media de las sesiones con duración registrada, en minutos. */
  duracionMediaMin: number | null;
  esDescarga: boolean;
  /** La semana aún no ha terminado (bloque en curso): no se puede leer como «saltada». */
  enCurso: boolean;
  /** En curso y con sesiones de la semana aún por hacer: sus kg no son los de una semana entera. */
  incompleta: boolean;
}

export interface FilaAgregada<K extends string> {
  clave: K;
  label: string;
  ejercicios: number;
  mejoran: number;
  /** Media de `deltaPct` de los ejercicios con referencia. */
  deltaMedioPct: number | null;
  /** El ejercicio que más sube del grupo/patrón. */
  mejor: { nombre: string; deltaPct: number } | null;
}

export interface ProgresionDelBloque {
  semanas: SemanaDelBloque[];
  ejercicios: ProgresionEjercicio[];
  resumen: {
    /** Ejercicios con al menos dos semanas distintas con datos (los que se pueden comparar). */
    comparables: number;
    mejoran: number;
    estables: number;
    bajan: number;
    /** Mediana de `deltaPct` de los comparables — el «cuánto más fuerte» del bloque. */
    medianaPct: number | null;
    /** Tonelaje semanal: primera semana con datos → media de las dos últimas. Sin la semana en curso a medias. */
    tonelajeSemanal: { inicio: number; final: number; deltaPct: number | null } | null;
    /** RIR medio: primera semana → última. Bajar = entrena más cerca del fallo. */
    rir: { inicio: number; final: number } | null;
    /** Media de kg añadidos a la mejor serie en los ejercicios que subieron carga. */
    kgMedioAnadido: number | null;
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
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return r1(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2);
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
  if (metrica === 'reps') return dReps > 0 ? 'mas_reps' : dRir > 0 ? 'menos_esfuerzo' : 'ninguna';
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
      return dKg < 0 ? `menos peso pero ${dReps > 0 ? `+${dReps}` : dReps} reps: más rendimiento estimado` : 'mejor rendimiento estimado';
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
  /** Semanas (1-indexadas, de 7 días) de descarga: no cuentan como «final» del bloque. */
  semanasDescarga?: number[];
  /** Asignaciones del bloque, para las sesiones programadas por semana. */
  assignments?: WorkoutAssignment[];
  pesoCorporalKg?: number | null;
  /** Hasta qué fecha hay que pintar semanas (para un bloque en curso). */
  hoy?: string;
}): ProgresionDelBloque {
  const { exercises, inicio, fin } = params;
  const ctx = contextoPesoCorporal(exercises, params.pesoCorporalKg);
  const descarga = new Set(params.semanasDescarga ?? []);
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
    // Mejor serie por semana, con las dos métricas a la vez: se decide luego
    // cuál vale para el ejercicio.
    porSemanaRm: Map<number, MejorSerie>;
    porSemanaReps: Map<number, MejorSerie>;
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
        acc = { fechas: new Set(), series: 0, tonelaje: 0, porSemanaRm: new Map(), porSemanaReps: new Map() };
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

        const serie: MejorSerie = {
          fecha: log.date, semana: sem, kg: r1(kg), reps,
          rir: s.alFallo ? null : rir, alFallo: !!s.alFallo,
          e1rm: cuentaParaRm({ weight: kg, repsDone: reps }) ? rmDeSerie({ ...s, weight: kg }) : 0,
        };
        if (serie.e1rm > 0 && mejorQue(serie, acc.porSemanaRm.get(sem) ?? null, 'e1rm')) acc.porSemanaRm.set(sem, serie);
        if (mejorQue(serie, acc.porSemanaReps.get(sem) ?? null, 'reps')) acc.porSemanaReps.set(sem, serie);
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
  // Una semana en curso solo se da por entera si ya se hizo todo lo que tenía
  // programado; sin asignaciones no se puede saber, así que se trata como a medias.
  for (const s of semanas) {
    s.incompleta = s.enCurso && !(s.sesionesProgramadas > 0 && s.sesionesHechas >= s.sesionesProgramadas);
  }

  // ── Comparación inicio / final por ejercicio ──────────────────────────────
  const ejercicios: ProgresionEjercicio[] = [];
  for (const [exerciseId, acc] of accs) {
    const ex = porId.get(exerciseId);
    // Con peso en la mayoría de semanas → 1RM estimado; si no, repeticiones.
    const metrica: 'e1rm' | 'reps' = acc.porSemanaRm.size > 0 && acc.porSemanaRm.size >= acc.porSemanaReps.size / 2 ? 'e1rm' : 'reps';
    const porSemana = metrica === 'e1rm' ? acc.porSemanaRm : acc.porSemanaReps;
    const semanasOrden = [...porSemana.keys()].sort((a, b) => a - b);

    const inicioS = semanasOrden.length ? porSemana.get(semanasOrden[0])! : null;
    // El «final» es la mejor de las dos últimas semanas con datos que no sean
    // de descarga: una última semana de descarga, o un mal día suelto, no
    // debería tapar lo que el atleta ha ganado.
    const candidatasFinal = semanasOrden.slice(1).filter(s => !descarga.has(s));
    const ultimas = candidatasFinal.slice(-2);
    let finalS: MejorSerie | null = null;
    for (const s of ultimas) {
      const serie = porSemana.get(s)!;
      if (mejorQue(serie, finalS, metrica)) finalS = serie;
    }
    let pico: MejorSerie | null = null;
    for (const s of semanasOrden) {
      const serie = porSemana.get(s)!;
      if (mejorQue(serie, pico, metrica)) pico = serie;
    }

    const deltaPct = inicioS && finalS ? pctDe(valorDe(finalS, metrica), valorDe(inicioS, metrica)) : null;
    const estado: EstadoEjercicio = deltaPct == null ? 'sin_referencia'
      : deltaPct >= UMBRAL_ESTABLE_PCT ? 'mejora'
      : deltaPct <= -UMBRAL_ESTABLE_PCT ? 'baja' : 'estable';
    const via = inicioS && finalS && deltaPct != null && estado === 'mejora'
      ? clasificarVia(inicioS, finalS, metrica, deltaPct) : 'ninguna';

    const grupo = ex?.muscleGroup ?? null;
    ejercicios.push({
      exerciseId,
      nombre: ex?.name ?? `Ejercicio (…${exerciseId.slice(-6)})`,
      grupo,
      grupoLabel: grupo ? MUSCLE_LABELS[grupo] : 'Sin grupo',
      patrones: grupo ? patronesDeGrupo(grupo) : [],
      sesiones: acc.fechas.size,
      series: acc.series,
      tonelaje: acc.tonelaje,
      semanasConDatos: semanasOrden.length,
      metrica,
      inicio: inicioS,
      final: finalS,
      pico,
      deltaPct,
      deltaKg: inicioS && finalS ? r1(finalS.kg - inicioS.kg) : null,
      deltaReps: inicioS && finalS ? finalS.reps - inicioS.reps : null,
      via,
      estado,
      semanal: Array.from({ length: nSemanas }, (_, i) => {
        const s = porSemana.get(i + 1);
        return s ? valorDe(s, metrica) : null;
      }),
      lectura: inicioS && finalS ? `${textoSerie(inicioS)} → ${textoSerie(finalS)}` : inicioS ? textoSerie(inicioS) : '',
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
  // «mueve menos kg por semana: −50 %» de un atleta que iba al día.
  const conTonelaje = semanas.filter(s => s.tonelaje > 0 && !s.esDescarga && !s.incompleta);
  const tonelajeSemanal = conTonelaje.length >= 2
    ? (() => {
        const ini = conTonelaje[0].tonelaje;
        const ult = conTonelaje.slice(1).slice(-2); // nunca la propia semana de referencia
        const fin = r1(ult.reduce((a, s) => a + s.tonelaje, 0) / ult.length);
        return { inicio: ini, final: fin, deltaPct: pctDe(fin, ini) };
      })()
    : null;
  const conRir = semanas.filter(s => s.rirMedio != null && !s.esDescarga);
  const rir = conRir.length >= 2 ? { inicio: conRir[0].rirMedio!, final: conRir[conRir.length - 1].rirMedio! } : null;
  const subenCarga = comparables.filter(e => (e.deltaKg ?? 0) > 0 && e.metrica === 'e1rm');

  // ── Agregados por patrón y por grupo ─────────────────────────────────────
  function agregar<K extends string>(claves: (e: ProgresionEjercicio) => K[], label: (k: K) => string): FilaAgregada<K>[] {
    const m = new Map<K, ProgresionEjercicio[]>();
    for (const e of ejercicios) for (const k of claves(e)) {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()].map(([clave, es]) => {
      const comp = es.filter(e => e.deltaPct != null);
      const mejor = [...comp].sort((a, b) => b.deltaPct! - a.deltaPct!)[0];
      return {
        clave,
        label: label(clave),
        ejercicios: es.length,
        mejoran: es.filter(e => e.estado === 'mejora').length,
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
    },
    porPatron: agregar<MovementPattern>(e => e.patrones, k => PATTERN_LABELS[k]),
    porGrupo: agregar<MuscleGroup>(e => (e.grupo ? [e.grupo] : []), k => MUSCLE_LABELS[k]),
  };
}
