import {
  MuscleGroup, MuscleGroupConfig, DayPlan, WorkoutExercise, Exercise, MUSCLE_ORDER,
} from '../types';
import { frecuenciaPorSemana } from './progression';
import { rankMuscleGroups } from './muscleGroupRanking';
import { DAY_TYPE_MUSCLES } from './trainingSplits';

// ═══════════════════════════════════════════════════════════════════════════
// Ayudas de PROGRAMACIÓN — lo que el coach necesita ver mientras monta un
// mesociclo, no cuando lo analiza después.
//
// El problema real que resuelve: el volumen se decide en «Volumen» (series
// semanales por grupo), se reparte en «Distribución» (qué grupo cae qué día) y
// se rellena con ejercicios en «Generar rutinas» — tres pantallas encadenadas
// donde nada avisaba de que el último paso ya no cuadraba con el primero. Si
// se quita un ejercicio de pecho, el meso sigue diciendo 12 series de pecho y
// la rutina real pasa a tener 9, en silencio. Estas funciones son la cuenta
// que faltaba: pautadas vs planificadas, por grupo.
// ═══════════════════════════════════════════════════════════════════════════

export interface FilaBalance {
  group: MuscleGroup;
  /** Series que el plan (día de la distribución, o el mesociclo) pide para este grupo. */
  planificadas: number;
  /** Series que los ejercicios elegidos aportan de verdad a ese grupo. */
  pautadas: number;
  /** pautadas − planificadas. Negativo = faltan; positivo = sobran. */
  diff: number;
}

export interface BalanceDeSeries {
  /** Descuadres primero (mayor desvío absoluto), luego por volumen planificado. */
  filas: FilaBalance[];
  totalPlanificadas: number;
  totalPautadas: number;
  /** Suma de lo que falta por asignar (solo los grupos por debajo del plan). */
  pendientes: number;
  /** Suma de lo que sobra sobre el plan (incluye grupos que el plan no pedía). */
  sobrantes: number;
  cuadra: boolean;
}

/**
 * Grupo muscular al que se le apuntan las series de un ejercicio prescrito.
 *
 * `we.muscleGroup` manda sobre el catálogo a propósito: es lo que el generador
 * y el picker escriben al elegir el ejercicio, así que refleja para qué grupo
 * lo puso el coach. El catálogo es solo el respaldo para prescripciones viejas
 * o copiadas de una rutina de biblioteca, que pueden no traer el campo.
 */
export function grupoDelEjercicio(
  we: Pick<WorkoutExercise, 'exerciseId' | 'muscleGroup'>,
  catalogo: Exercise[],
): MuscleGroup | null {
  if (we.muscleGroup) return we.muscleGroup;
  return catalogo.find(e => e.id === we.exerciseId)?.muscleGroup ?? null;
}

/** Series efectivas por grupo de una lista de ejercicios prescritos. */
export function seriesPorGrupo(
  exercises: Pick<WorkoutExercise, 'exerciseId' | 'muscleGroup' | 'sets'>[],
  catalogo: Exercise[],
): Map<MuscleGroup, number> {
  const acc = new Map<MuscleGroup, number>();
  for (const we of exercises) {
    const g = grupoDelEjercicio(we, catalogo);
    if (!g) continue;
    acc.set(g, (acc.get(g) ?? 0) + Math.max(0, we.sets));
  }
  return acc;
}

/** Lo que la distribución pide para UN día concreto. */
export function seriesPlanificadasDelDia(day: DayPlan | undefined): Map<MuscleGroup, number> {
  const acc = new Map<MuscleGroup, number>();
  for (const a of day?.assignments ?? []) {
    acc.set(a.group, (acc.get(a.group) ?? 0) + a.series);
  }
  return acc;
}

/**
 * Lo que el mesociclo pide para una vuelta entera del ciclo (pestaña «Volumen»).
 *
 * `MuscleGroupConfig.series` son SIEMPRE series por semana —es la unidad de
 * los landmarks MEV/MAV/MRV, del sugeridor y de los informes—, así que un ciclo
 * de dos semanas pide el doble. Sin escalar, un ciclo quincenal parecería
 * siempre tener el doble de series de las que tocan.
 */
export function seriesPlanificadasDelMeso(
  groups: Record<MuscleGroup, MuscleGroupConfig> | undefined,
  semanasDelCiclo = 1,
): Map<MuscleGroup, number> {
  const acc = new Map<MuscleGroup, number>();
  if (!groups) return acc;
  for (const g of MUSCLE_ORDER) {
    const s = groups[g]?.series ?? 0;
    if (s > 0) acc.set(g, Math.round(s * semanasDelCiclo));
  }
  return acc;
}

const ORDEN = new Map(MUSCLE_ORDER.map((g, i) => [g, i]));

export function balanceDeSeries(
  pautadas: Map<MuscleGroup, number>,
  planificadas: Map<MuscleGroup, number>,
): BalanceDeSeries {
  const grupos = new Set<MuscleGroup>([...planificadas.keys(), ...pautadas.keys()]);
  const filas: FilaBalance[] = [...grupos].map(group => {
    const p = planificadas.get(group) ?? 0;
    const a = pautadas.get(group) ?? 0;
    return { group, planificadas: p, pautadas: a, diff: a - p };
  });

  filas.sort((x, y) => {
    const dx = Math.abs(x.diff), dy = Math.abs(y.diff);
    if (dx !== dy) return dy - dx;
    if (x.planificadas !== y.planificadas) return y.planificadas - x.planificadas;
    return (ORDEN.get(x.group) ?? 99) - (ORDEN.get(y.group) ?? 99);
  });

  const totalPlanificadas = filas.reduce((s, f) => s + f.planificadas, 0);
  const totalPautadas     = filas.reduce((s, f) => s + f.pautadas, 0);
  const pendientes        = filas.reduce((s, f) => s + (f.diff < 0 ? -f.diff : 0), 0);
  const sobrantes         = filas.reduce((s, f) => s + (f.diff > 0 ?  f.diff : 0), 0);

  return {
    filas, totalPlanificadas, totalPautadas, pendientes, sobrantes,
    cuadra: pendientes === 0 && sobrantes === 0,
  };
}

// ── Duración estimada de la sesión ───────────────────────────────────────────
// La pregunta que hace TODO cliente al recibir una rutina ("¿cuánto me va a
// llevar esto?") y que hoy el coach contestaba a ojo. No pretende ser exacta:
// son las series por su descanso más un tiempo de trabajo fijo por serie.
// Deliberadamente NO cuenta el calentamiento (series ligeras y rápidas, y en
// modo automático ni siquiera se sabe cuántas serán).

/** Segundos de trabajo de una serie efectiva típica de hipertrofia (8-12 reps). */
const SEGUNDOS_POR_SERIE = 45;

export function duracionEstimadaMin(
  exercises: Pick<WorkoutExercise, 'sets' | 'restSeconds'>[],
): number {
  const seg = exercises.reduce(
    (s, e) => s + Math.max(0, e.sets) * (SEGUNDOS_POR_SERIE + Math.max(0, e.restSeconds ?? 0)),
    0,
  );
  if (seg === 0) return 0;
  return Math.max(5, Math.round(seg / 60 / 5) * 5);
}

// ── Frecuencia semanal y días seguidos ───────────────────────────────────────
// Las otras dos variables que un entrenador mira en un reparto, y que la
// pantalla de distribución no decía en ninguna parte: cuántas veces por semana
// toca cada grupo, y si alguno ha acabado en dos días seguidos. El repartidor
// automático ya evita lo segundo, pero en cuanto el coach mueve un grupo a mano
// —que es justo para lo que están los controles— deja de estar garantizado.

export interface FrecuenciaGrupo {
  group: MuscleGroup;
  /** Índices (0-based) de las SESIONES en las que aparece. */
  dias: number[];
  veces: number;
  /** Veces por semana de verdad: `veces × 7 / días del ciclo`. */
  porSemana: number;
}

export function frecuenciaSemanal(days: DayPlan[], cicloDias = 7): FrecuenciaGrupo[] {
  const acc = new Map<MuscleGroup, number[]>();
  days.forEach((d, i) => {
    for (const a of d.assignments) {
      if (a.series <= 0) continue;
      const dias = acc.get(a.group) ?? [];
      if (!dias.includes(i)) dias.push(i);
      acc.set(a.group, dias);
    }
  });
  return [...acc.entries()]
    .map(([group, dias]) => ({ group, dias, veces: dias.length, porSemana: frecuenciaPorSemana(dias.length, cicloDias) }))
    .sort((a, b) => {
      if (a.veces !== b.veces) return b.veces - a.veces;
      return (ORDEN.get(a.group) ?? 99) - (ORDEN.get(b.group) ?? 99);
    });
}

export interface ChoqueDiasSeguidos {
  group: MuscleGroup;
  /**
   * Los dos DÍAS DEL CALENDARIO (0-based, no sesiones) que caen seguidos.
   * Es lo que hay que enseñar: «sesión 2 y sesión 3» no dice nada si entre
   * medias hay descansos; «día 4 y día 5» sí.
   */
  dias: [number, number];
  /** El choque es entre el final de una vuelta y el principio de la siguiente. */
  entreVueltas?: boolean;
}

/**
 * Grupos que caen en dos días SEGUIDOS de calendario.
 *
 * `offsets` dice en qué día del ciclo cae cada sesión: sin él, las sesiones son
 * los primeros días del ciclo y basta comparar índices; con un reparto rotativo
 * (Push, Pull, Descanso, Legs, Descanso) las sesiones 2 y 3 están separadas por
 * un descanso y no son un choque.
 *
 * También mira el salto de vuelta: la última sesión del ciclo y la primera de
 * la siguiente son días consecutivos, y ese es justo el choque que se escapa
 * mirando solo dentro del ciclo.
 */
export function gruposEnDiasSeguidos(
  days: DayPlan[],
  opciones: { offsets?: number[]; cicloDias?: number } = {},
): ChoqueDiasSeguidos[] {
  const { offsets, cicloDias } = opciones;
  const diaDe = (sesion: number) => offsets?.[sesion] ?? sesion;
  const choques: ChoqueDiasSeguidos[] = [];

  for (const fila of frecuenciaSemanal(days)) {
    const enCalendario = fila.dias.map(diaDe).sort((a, b) => a - b);
    for (let i = 1; i < enCalendario.length; i++) {
      if (enCalendario[i] - enCalendario[i - 1] === 1) {
        choques.push({ group: fila.group, dias: [enCalendario[i - 1], enCalendario[i]] });
      }
    }
    // Salto de vuelta: el último día del ciclo pega con el primero del siguiente.
    if (cicloDias && enCalendario.length > 0) {
      const ultimo = enCalendario[enCalendario.length - 1];
      const primero = enCalendario[0];
      if (ultimo === cicloDias - 1 && primero === 0 && enCalendario.length >= 2) {
        choques.push({ group: fila.group, dias: [ultimo, primero], entreVueltas: true });
      }
    }
  }
  return choques;
}

// ── Reparto de series entre ejercicios ───────────────────────────────────────
// Cuántos ejercicios y con cuántas series cada uno cubren las series que la
// distribución asignó a un grupo en un día. Vive aquí, fuera del componente,
// porque es la regla de programación que el generador aplica en automático y
// tiene que poder comprobarse sin abrir la pantalla.

/**
 * Techo de series por ejercicio al generar en automático.
 *
 * Por encima de 4 series seguidas del mismo ejercicio la fatiga local manda
 * sobre el estímulo: es preferible repartir las series entre dos ejercicios
 * del mismo grupo. El coach puede subirlo a mano después; esto solo acota lo
 * que la app propone sola.
 */
export const SERIES_MAX_POR_EJERCICIO = 4;

/** Reparte `total` en `n` partes lo más iguales posible (las primeras, +1). */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [total];
  const base = Math.floor(total / n);
  const rem  = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Series por ejercicio para cubrir `series` de un grupo en un día.
 *
 * `ejerciciosDisponibles` acota cuántos huecos tiene sentido abrir: con un
 * catálogo pequeño para ese grupo, repartir en seis ejercicios significaría
 * repetir el mismo tres veces. En ese caso —y solo en ese— alguna parte puede
 * pasar del techo de series, porque la alternativa es perder volumen.
 */
export function repartoDeSeries(series: number, ejerciciosDisponibles: number): number[] {
  if (series <= 0) return [];
  const deseados = Math.max(1, Math.ceil(series / SERIES_MAX_POR_EJERCICIO));
  const tope = Math.max(1, ejerciciosDisponibles * 2);
  return splitEvenly(series, Math.min(deseados, tope));
}

// ── El repartidor ────────────────────────────────────────────────────────────
// Coloca las series de cada grupo en las sesiones del ciclo. Vivía dentro de
// MesocycleManager, donde no se podía probar: es la pieza que decide la
// frecuencia real de cada grupo —lo más delicado de toda la programación— y
// ahora tiene pruebas.

const ANTAGONIST_PAIRS: [MuscleGroup, MuscleGroup][] = [
  ['pecho',      'dorsal'],
  ['biceps',     'triceps'],
  ['cuadriceps', 'isquios'],
];

function getAntagonist(g: MuscleGroup): MuscleGroup | null {
  for (const [a, b] of ANTAGONIST_PAIRS) {
    if (g === a) return b;
    if (g === b) return a;
  }
  return null;
}

/**
 * Series efectivas de un grupo que tiene sentido meter en UNA sesión.
 *
 * Es lo que convierte volumen en frecuencia: 15 series semanales de pecho a 6
 * por sesión son 2,5 sesiones por semana. De ahí salen las frecuencias «y
 * media» que un ciclo de una sola semana no puede dar.
 */
const SERIES_POR_SESION_Y_GRUPO = 6;

/**
 * Cuántas sesiones del ciclo se lleva un grupo.
 *
 * `series` son SIEMPRE series por SEMANA (la unidad de todo el resto de la app:
 * los landmarks MEV/MAV/MRV, el sugeridor, los informes). `semanas` es la
 * duración del ciclo en semanas — y es lo que permite un número IMPAR de
 * sesiones en un ciclo de dos semanas: 5 sesiones repartidas 2 y 3 son la
 * frecuencia 2,5, que dentro de una semana suelta no existe.
 */
function sesionesDelGrupo(series: number, semanas: number, maxSesiones: number): number {
  if (series <= 0) return 0;
  const ideal = (series / SERIES_POR_SESION_Y_GRUPO) * semanas;
  return Math.max(1, Math.min(Math.round(ideal), maxSesiones));
}

export function runDistribution(
  groups: Record<MuscleGroup, MuscleGroupConfig>,
  sesiones: number,
  dayTypes?: string[], // reparto elegido (Torso/Pierna/Push/...) — si viene, restringe qué días acepta cada grupo muscular
  ciclo?: { cicloDias: number; offsets: number[] },
): { days: DayPlan[]; overloadAlert: boolean } {
  const days: DayPlan[] = Array.from({ length: sesiones }, (_, i) => ({
    assignments: [], totalSeries: 0, dayType: dayTypes?.[i],
  }));

  const cicloDias = ciclo?.cicloDias ?? 7;
  const semanas = cicloDias / 7;
  // Día de calendario de cada sesión: con un ciclo de dos semanas, las sesiones
  // 5 y 6 son viernes y lunes — no son días seguidos aunque sus índices lo
  // parezcan. Sin esto, la regla de "no repetir grupo en días seguidos" mide
  // una distancia que no existe.
  const diaDe = (sesion: number) => ciclo?.offsets?.[sesion] ?? sesion;

  const totalSemanal = MUSCLE_ORDER.reduce((s, g) => s + groups[g].series, 0);
  const overloadAlert = Math.round(totalSemanal * semanas) > sesiones * 12;

  const active = rankMuscleGroups(groups);

  const placedOn: Partial<Record<MuscleGroup, number[]>> = {};

  // Días permitidos para un grupo dado el reparto elegido; sin reparto, todos valen.
  const allowedDays = (group: MuscleGroup): number[] => {
    if (!dayTypes) return Array.from({ length: sesiones }, (_, i) => i);
    const allowed = Array.from({ length: sesiones }, (_, i) => i)
      .filter(i => (DAY_TYPE_MUSCLES[dayTypes[i]] ?? []).includes(group));
    // si el reparto no cubre este grupo en ningún día, no lo bloqueamos —
    // mejor colocarlo en algún día que perder el volumen configurado
    return allowed.length > 0 ? allowed : Array.from({ length: sesiones }, (_, i) => i);
  };

  for (const group of active) {
    const candidates = allowedDays(group);
    // Volumen del CICLO: la configuración es semanal, así que un ciclo de dos
    // semanas mueve el doble de series. Es lo que hace que la vuelta entera
    // cuadre con lo que el coach pidió por semana.
    const totalCiclo = Math.round(groups[group].series * semanas);
    const sessions = sesionesDelGrupo(groups[group].series, semanas, candidates.length);
    if (sessions === 0) continue;
    const chunks = splitEvenly(totalCiclo, sessions);
    const myDays: number[] = [];
    placedOn[group] = myDays;

    const antag     = getAntagonist(group);
    const antagDays = (antag && placedOn[antag]) ? placedOn[antag]! : [];

    for (const chunk of chunks) {
      let bestDay = -1, bestScore = Infinity;

      for (const d of candidates) {
        if (myDays.some(pd => Math.abs(diaDe(d) - diaDe(pd)) < 2)) continue;
        let score = days[d].totalSeries;
        if (groups[group].priority === 'alta') score += d * 0.3;
        if (antagDays.includes(d)) score += 50;
        if (score < bestScore) { bestScore = score; bestDay = d; }
      }

      if (bestDay === -1) {
        for (const d of candidates) {
          if (myDays.includes(d)) continue;
          let score = days[d].totalSeries;
          if (antagDays.includes(d)) score += 50;
          if (score < bestScore) { bestScore = score; bestDay = d; }
        }
      }

      if (bestDay === -1) bestDay = candidates.find(d => !myDays.includes(d)) ?? candidates[0] ?? 0;
      const existente = days[bestDay].assignments.find(a => a.group === group);
      if (existente) existente.series += chunk;
      else days[bestDay].assignments.push({ group, series: chunk });
      days[bestDay].totalSeries += chunk;
      if (!myDays.includes(bestDay)) myDays.push(bestDay);
    }
  }

  return { days, overloadAlert };
}
