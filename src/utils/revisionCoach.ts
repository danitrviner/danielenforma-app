import {
  WorkoutLog, Exercise, Mesocycle, MuscleGroup, BodyweightLog,
  Questionnaire, QuestionnaireResponse, WeightCheckIn, MUSCLE_ORDER,
} from '../types';
import {
  buildTrainingReport, TrainingReport, ExercisePerf, ComparisonMode, resolveWindows,
} from './trainingReport';
import {
  buildMovementPatternReport, MovementPattern, PatternPerf, patronesDeGrupo, PATTERN_LABELS,
} from './movementPatterns';
import { buildAccumulatedStimulusReport, IEARow } from './accumulatedStimulusIndex';
import { seriesRealizadasPorGrupo } from './programacion';
import { construirMapaCalor, CeldaMapaCalor } from './mapaCalorCorporal';
import { VolumeLandmark, VOLUME_LANDMARKS_DEFAULT } from '../data/volumeLandmarks';
import { addDays, hoyIsoLocal, getWeekStart } from './trainingWeek';
import { nombreDeMeso } from './nombresMeso';
import { mesocycleWeekNumber } from './progression';
import { ewmaDeSeñal } from './wellnessTrend';
import { computeIRP, historialIRP, IRPResult } from './readinessIndex';
import { domsCronicoDeGrupo, esDomsCronico } from './domsCronico';
import { DataPoint } from './seriesCorrelation';

// ═══════════════════════════════════════════════════════════════════════════
// REVISIÓN DEL COACH — el motor de la pantalla que Dani graba en vídeo para
// contarle al atleta cómo va.
//
// No inventa ni una cuenta: encadena los motores que ya existían y estaban
// repartidos por cinco pantallas distintas (trainingReport, movementPatterns,
// accumulatedStimulusIndex, programacion, mapaCalorCorporal). Lo único propio
// de aquí es QUÉ ventana se mira, CÓMO se agrupa para contarlo, y qué merece
// salir en el vídeo.
//
// Determinista y sin IA, como el resto de motores de análisis del proyecto:
// los mismos logs dan siempre los mismos números. Fecha inyectable (`hoy`)
// para poder testear.
// ═══════════════════════════════════════════════════════════════════════════

export type PeriodoRevision =
  | { tipo: '7d' }
  | { tipo: '14d' }
  | { tipo: 'ultima_revision' }
  | { tipo: 'meso'; mesoId: string };

/**
 * Fecha del último check-in que Dani ya contestó o aprobó — el corte real de
 * «desde la última vez que hablamos».
 *
 * Un check-in recibido y sin tocar NO vale: ese es justo el que se está a punto
 * de contestar, y tomarlo como corte dejaría la ventana en cero días. El
 * criterio es que haya feedback escrito o esté aprobado, que es lo que
 * significa que esa conversación ya ocurrió.
 */
export function fechaDeLaUltimaRevision(checkins: WeightCheckIn[]): string | null {
  const fechas = checkins
    .filter(c => c.approved || (c.coachFeedback ?? '').trim().length > 0)
    .map(c => {
      const d = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp);
      return Number.isNaN(d.getTime())
        ? null
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
    .filter((f): f is string => f !== null)
    .sort();
  return fechas.length > 0 ? fechas[fechas.length - 1] : null;
}

export interface VentanaRevision {
  desde: string;
  hasta: string;
  comparison: ComparisonMode;
  /** Lo que se lee en el selector: «Últimos 7 días», «Meso #4 · en curso». */
  etiqueta: string;
  /** Con qué se compara: «vs la semana anterior», «vs Macrociclo 3». */
  etiquetaComparacion: string;
  /**
   * Semanas que abarca la ventana, con decimales. Es lo que normaliza el mapa
   * de calor. Nunca baja de 1 — ver `semanasDeVentana`.
   */
  semanas: number;
  /** Semana N del mesociclo activo, si la ventana es un mesociclo. */
  semanaDelPlan: number | null;
  /** De cuántas. */
  semanasDelPlan: number | null;
  /** El mesociclo de la ventana, si lo hay. */
  meso: Mesocycle | null;
}

/**
 * Cuántas semanas mide una ventana, con decimales, para poder pasar un total de
 * series a series/semana.
 *
 * Dos detalles que parecen menores y no lo son:
 *
 *  · **Con decimales.** Un bloque de 5 semanas visto el octavo día lleva 8 días
 *    corridos, no 2 semanas. Redondear a 2 repartiría entre dos semanas lo que
 *    se hizo en una y pintaría al atleta haciendo la mitad de volumen del que
 *    hace, justo el lunes, que es cuando Dani graba la revisión.
 *  · **Suelo de 1.** El primer día de un bloque, 1/7 de semana convertiría tres
 *    series en «21 a la semana» y mandaría el grupo a MRV. Extrapolar al alza
 *    desde dos días de datos es inventar. Quedarse corto al principio del
 *    bloque es el error seguro de los dos.
 */
/** Días naturales entre dos fechas ISO (exclusivo: del 1 al 8 son 7). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = new Date(hasta + 'T12:00:00').getTime() - new Date(desde + 'T12:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

export function semanasDeVentana(desde: string, hasta: string): number {
  const ms = new Date(hasta + 'T12:00:00').getTime() - new Date(desde + 'T12:00:00').getTime();
  const dias = Math.floor(ms / 86_400_000) + 1; // inclusivo por los dos extremos
  return Math.max(1, Math.round((dias / 7) * 100) / 100);
}

/**
 * El mesociclo que toca por defecto: el que contiene a hoy; si ninguno, el
 * último que empezó. `null` si el atleta no tiene bloques.
 */
export function mesoActivo(mesocycles: Mesocycle[], hoy: string): Mesocycle | null {
  const empezados = [...mesocycles]
    .filter(m => !!m.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (empezados.length === 0) return null;
  const enCurso = empezados.find(m => hoy >= m.startDate && hoy <= addDays(m.startDate, m.weeks * 7 - 1));
  return enCurso ?? empezados[empezados.length - 1];
}

/**
 * Traduce la elección del selector a fechas y modo de comparación.
 *
 * Los dos modos por días comparan contra la ventana equivalente inmediatamente
 * anterior; el de mesociclo compara contra el bloque de número anterior, que es
 * el mismo criterio que usa el cierre de mesociclo — si los dos comparasen
 * distinto, los números de esta pantalla y los de aquella no cuadrarían y no
 * habría forma de saber cuál está mal.
 */
export function resolverPeriodoRevision(
  periodo: PeriodoRevision,
  mesocycles: Mesocycle[],
  hoy: string = hoyIsoLocal(),
  checkins: WeightCheckIn[] = [],
): VentanaRevision {
  if (periodo.tipo === 'ultima_revision') {
    const corte = fechaDeLaUltimaRevision(checkins);
    // Sin ninguna revisión contestada no hay «desde la última»: se cae a la
    // semana, que es la ventana por defecto de la pantalla. El selector solo
    // ofrece esta opción cuando hay corte, así que aquí llegar es raro
    // (borraron el feedback en otra pestaña) y vale más caer a algo con
    // sentido que pintar una ventana vacía.
    if (corte === null) return resolverPeriodoRevision({ tipo: '7d' }, mesocycles, hoy, checkins);
    // Desde el día SIGUIENTE al del check-in contestado: ese día ya se comentó.
    const desde = addDays(corte, 1) > hoy ? hoy : addDays(corte, 1);
    const dias = diasEntre(desde, hoy) + 1;
    // La ventana equivalente justo antes. Se usa 'offset' y no 'weeks' porque
    // «desde la última revisión» mide días sueltos (once, diecisiete), no
    // semanas enteras: con 'weeks' habría que redondear y los dos lados de la
    // comparación dejarían de medir lo mismo.
    const comparison: ComparisonMode = {
      mode: 'offset', dias, label: `vs los ${dias} días anteriores`,
    };
    const w = resolveWindows(desde, hoy, comparison, mesocycles);
    return {
      desde, hasta: hoy, comparison,
      etiqueta: `Desde la última revisión · ${dias} ${dias === 1 ? 'día' : 'días'}`,
      etiquetaComparacion: w.comparisonLabel,
      semanas: semanasDeVentana(desde, hoy),
      semanaDelPlan: null, semanasDelPlan: null, meso: null,
    };
  }

  if (periodo.tipo === '7d' || periodo.tipo === '14d') {
    const dias = periodo.tipo === '7d' ? 7 : 14;
    const desde = addDays(hoy, -(dias - 1));
    const comparison: ComparisonMode = { mode: 'weeks', n: dias / 7 };
    const w = resolveWindows(desde, hoy, comparison, mesocycles);
    return {
      desde, hasta: hoy, comparison,
      etiqueta: `Últimos ${dias} días`,
      etiquetaComparacion: w.comparisonLabel,
      semanas: semanasDeVentana(desde, hoy),
      semanaDelPlan: null, semanasDelPlan: null, meso: null,
    };
  }

  const meso = mesocycles.find(m => m.id === periodo.mesoId) ?? null;
  if (!meso) {
    // El mesociclo elegido ya no existe (lo borró el coach en otra pestaña).
    // Caer a 7 días es preferible a pintar una ventana vacía sin explicación.
    return resolverPeriodoRevision({ tipo: '7d' }, mesocycles, hoy);
  }

  const fin = addDays(meso.startDate, meso.weeks * 7 - 1);
  const enCurso = hoy >= meso.startDate && hoy <= fin;
  const anterior = [...mesocycles]
    .filter(m => m.id !== meso.id && m.number < meso.number)
    .sort((a, b) => b.number - a.number)[0] ?? null;

  // Mientras el bloque está en curso, la ventana termina HOY: si llegase hasta
  // el final programado, el mapa de calor dividiría lo hecho en dos semanas
  // entre las cinco del bloque y todo parecería un tercio de lo que es.
  const hasta = enCurso ? hoy : fin;

  // Y la COMPARACIÓN tiene que medir lo mismo a los dos lados. El modo
  // 'mesocycle' compara bloque entero contra bloque entero, que es lo correcto
  // al cerrar uno y una trampa a mitad: 16 días contra 35 salen siempre en
  // −45 % de tonelaje, un número que solo dice «aún no ha terminado» y que el
  // coach leería en el vídeo como un bajón. Con el bloque en curso se compara
  // contra los MISMOS días iniciales del bloque anterior, desplazando la
  // ventana justo la distancia entre los dos inicios.
  const comparison: ComparisonMode = enCurso && anterior
    ? {
        mode: 'offset',
        dias: diasEntre(anterior.startDate, meso.startDate),
        label: `vs el mismo tramo de ${nombreDeMeso(anterior)}`,
      }
    : { mode: 'mesocycle', currentId: meso.id, previousId: anterior?.id ?? null };

  const w = resolveWindows(meso.startDate, hasta, comparison, mesocycles);
  const semanaDelPlan = enCurso
    ? Math.min(meso.weeks, mesocycleWeekNumber(meso.startDate, hoy))
    : meso.weeks;

  return {
    desde: meso.startDate, hasta, comparison,
    etiqueta: `${nombreDeMeso(meso)}${enCurso ? ' · en curso' : ''}`,
    etiquetaComparacion: w.comparisonLabel,
    semanas: semanasDeVentana(meso.startDate, hasta),
    semanaDelPlan, semanasDelPlan: meso.weeks, meso,
  };
}

export interface RevisionDelAtleta {
  ventana: VentanaRevision;
  informe: TrainingReport;
  patrones: PatternPerf[];
  /** Los ejercicios de cada patrón, ya ordenados por tonelaje (como vienen del informe). */
  ejerciciosPorPatron: Record<MovementPattern, ExercisePerf[]>;
  /** Ejercicios sin patrón asignado (core, gemelo, lumbares, rotadores y los que no tienen grupo). */
  ejerciciosSinPatron: ExercisePerf[];
  suben: ExercisePerf[];
  bajan: ExercisePerf[];
  mapa: CeldaMapaCalor[];
  estimulo: IEARow[];
  bienestar: BienestarDeLaVentana;
}

/**
 * Cómo ha dormido, cuánto estrés arrastra y qué grupos le siguen doliendo.
 *
 * Todo sale de los cuestionarios que el atleta ya contesta: nada nuevo que
 * pedirle. El IRP (sueño × (10 − estrés − DOMS crónico) / 10) es el titular, y
 * `historial` es su serie para poder decir «venía de 5,8 y está en 4,1» en vez
 * de soltar un número suelto que no significa nada por sí solo.
 *
 * Un componente que falta NO se rellena con un 0 ni con una media: `irp.valor`
 * sale `null` y la pantalla dice que falta, porque un IRP con un trozo
 * inventado engaña más que no enseñar ninguno.
 */
export interface BienestarDeLaVentana {
  irp: IRPResult;
  /** IRP al empezar la ventana, para poder contar el cambio. null si no había. */
  irpAlInicio: number | null;
  historial: DataPoint[];
  sueño: DataPoint[];
  estres: DataPoint[];
  /** Grupos con agujetas crónicas (media ≥ 6/10 sostenida), de más a menos. */
  domsCronico: { grupo: MuscleGroup; media: number }[];
  /**
   * La media crónica de CADA grupo que tenga lecturas suficientes, pase o no el
   * umbral. `domsCronico` es la lista de alarma; esto es la columna que se pone
   * al lado de las series en la tabla de volumen, donde un 4/10 tampoco es
   * alarma pero sí cambia la lectura de un grupo que no sube.
   */
  domsPorGrupo: Partial<Record<MuscleGroup, number>>;
}

/** El último punto de una serie en o antes de `fecha`, o null si no hay ninguno. */
function valorEn(puntos: DataPoint[], fecha: string): number | null {
  let ultimo: number | null = null;
  for (const p of puntos) {
    if (p.date > fecha) break;
    ultimo = p.value;
  }
  return ultimo;
}

export function construirBienestar(params: {
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
  ventana: Pick<VentanaRevision, 'desde' | 'hasta'>;
}): BienestarDeLaVentana {
  const { responses, questionnaires, ventana } = params;
  const historial = historialIRP({ responses, questionnaires });

  const medias = MUSCLE_ORDER
    .map(grupo => ({ grupo, media: domsCronicoDeGrupo(grupo, responses, questionnaires) }))
    .filter((d): d is { grupo: MuscleGroup; media: number } => d.media != null);
  const domsPorGrupo: Partial<Record<MuscleGroup, number>> = {};
  for (const d of medias) domsPorGrupo[d.grupo] = d.media;
  const domsCronico = medias
    .filter(d => esDomsCronico(d.media))
    .sort((a, b) => b.media - a.media);

  return {
    irp: computeIRP({ responses, questionnaires }),
    // El valor de referencia es el del día ANTERIOR a la ventana: el del primer
    // día ya es parte de lo que se está revisando, y compararlo consigo mismo
    // daría siempre «sin cambios».
    irpAlInicio: valorEn(historial, addDays(ventana.desde, -1)),
    historial,
    sueño: ewmaDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires),
    estres: ewmaDeSeñal('wellness.stress_weekly', responses, questionnaires),
    domsCronico, domsPorGrupo,
  };
}

export interface RevisionParams {
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  periodo: PeriodoRevision;
  landmarks?: Record<MuscleGroup, VolumeLandmark>;
  hoy?: string;
  /** Cuestionarios contestados — alimentan el bienestar. Sin ellos sale vacío. */
  responses?: QuestionnaireResponse[];
  questionnaires?: Questionnaire[];
  /** Check-ins — solo para resolver el periodo «desde la última revisión». */
  checkins?: WeightCheckIn[];
}

export function buildRevisionCoach(params: RevisionParams): RevisionDelAtleta {
  const {
    logs, exercises, mesocycles, periodo,
    landmarks = VOLUME_LANDMARKS_DEFAULT,
    hoy = hoyIsoLocal(),
    responses = [], questionnaires = [], checkins = [],
  } = params;

  const ventana = resolverPeriodoRevision(periodo, mesocycles, hoy, checkins);
  const comun = {
    logs, exercises, mesocycles,
    periodStart: ventana.desde, periodEnd: ventana.hasta,
    comparison: ventana.comparison,
  };

  const informe = buildTrainingReport(comun);
  const patrones = buildMovementPatternReport(comun).patterns;
  const estimulo = buildAccumulatedStimulusReport(comun).rows;

  // El mapa de calor cuenta SOLO el grupo principal, igual que el cierre de
  // mesociclo: es la unidad con la que se programó `Mesocycle.groups`. Las
  // series ponderadas de `informe.muscleGroups` responden a otra pregunta y
  // viven en el bloque de tonelaje.
  const logsVentana = logs.filter(l => l.date >= ventana.desde && l.date <= ventana.hasta);
  const mapa = construirMapaCalor({
    realizadas: seriesRealizadasPorGrupo(logsVentana, exercises),
    groups: ventana.meso?.groups,
    landmarks,
    semanasDeLaVentana: ventana.semanas,
  });

  const { porPatron, sinPatron } = agruparEjerciciosPorPatron(informe.perExercise, exercises);
  const { suben, bajan } = mejoresYPeores(informe.perExercise);

  const bienestar = construirBienestar({ responses, questionnaires, ventana });

  return {
    ventana, informe, patrones,
    ejerciciosPorPatron: porPatron,
    ejerciciosSinPatron: sinPatron,
    suben, bajan, mapa, estimulo, bienestar,
  };
}

/**
 * Reparte los ejercicios entre los cinco patrones de movimiento.
 *
 * Un ejercicio puede caer en DOS (el press francés es empuje de torso y es
 * brazo), igual que hace `patronesDeGrupo` para el agregado — aparece entero en
 * los dos, no se reparte. Por eso la suma de las listas no es el total de
 * ejercicios, y por eso `ejerciciosSinPatron` existe: core, gemelo, lumbares y
 * rotadores no entran en ningún patrón del protocolo, y un ejercicio sin
 * `muscleGroup` tampoco. Sin esa lista, esos ejercicios desaparecerían de la
 * pantalla sin dejar rastro.
 */
export function agruparEjerciciosPorPatron(
  perExercise: ExercisePerf[],
  exercises: Exercise[],
): { porPatron: Record<MovementPattern, ExercisePerf[]>; sinPatron: ExercisePerf[] } {
  const porId = new Map(exercises.map(e => [e.id, e]));
  const porPatron = {} as Record<MovementPattern, ExercisePerf[]>;
  for (const p of Object.keys(PATTERN_LABELS) as MovementPattern[]) porPatron[p] = [];
  const sinPatron: ExercisePerf[] = [];

  for (const ex of perExercise) {
    const grupo = porId.get(ex.exerciseId)?.muscleGroup;
    const patrones = grupo ? patronesDeGrupo(grupo) : [];
    if (patrones.length === 0) { sinPatron.push(ex); continue; }
    for (const p of patrones) porPatron[p].push(ex);
  }
  return { porPatron, sinPatron };
}

export interface OpcionesMejoresYPeores {
  /** Cuántos devolver de cada lado. */
  n?: number;
  /** Series mínimas en la ventana para entrar en la lista. */
  minSeries?: number;
  /** Variación mínima en % para considerarla movimiento y no ruido. */
  umbralPct?: number;
}

/**
 * Los ejercicios que más suben y los que más bajan en 1RM estimado.
 *
 * Tres filtros, y los tres existen por el mismo motivo: esto se lee en voz alta
 * en un vídeo, así que un dato flojo cuesta la credibilidad de todo lo demás.
 *
 *  · `deltaOrmPct != null` — sin ventana de comparación no hay progresión que
 *    contar. Un ejercicio que se estrena no «sube un 100 %».
 *  · `minSeries` — dos series sueltas de un accesorio no son una tendencia.
 *  · `umbralPct` — un ±1 % en un 1RM estimado por Epley es ruido de redondeo,
 *    no una mejora.
 */
export function mejoresYPeores(
  perExercise: ExercisePerf[],
  opciones: OpcionesMejoresYPeores = {},
): { suben: ExercisePerf[]; bajan: ExercisePerf[] } {
  const { n = 5, minSeries = 3, umbralPct = 2 } = opciones;
  const elegibles = perExercise.filter(e =>
    e.deltaOrmPct != null && e.sets >= minSeries && e.bestOrm > 0);

  const suben = elegibles
    .filter(e => (e.deltaOrmPct as number) >= umbralPct)
    .sort((a, b) => (b.deltaOrmPct as number) - (a.deltaOrmPct as number))
    .slice(0, n);

  const bajan = elegibles
    .filter(e => (e.deltaOrmPct as number) <= -umbralPct)
    .sort((a, b) => (a.deltaOrmPct as number) - (b.deltaOrmPct as number))
    .slice(0, n);

  return { suben, bajan };
}

// ── Peso: esta semana contra la pasada ──────────────────────────────────────

export interface PesoVsSemanaPasada {
  /** Media de los pesos registrados esta semana. */
  estaSemana: number | null;
  semanaAnterior: number | null;
  /** estaSemana − semanaAnterior. Negativo = ha bajado. */
  deltaKg: number | null;
  registrosEstaSemana: number;
}

/**
 * Cuánto ha movido el peso respecto a la semana pasada, comparando MEDIAS.
 *
 * Se comparan medias y no el último registro de cada semana a propósito: el
 * peso diario oscila un kilo largo por hidratación y sal, así que coger un día
 * suelto de cada semana mide sobre todo cuándo se pesó, no cómo va. Con dos
 * medias, un día raro pesa lo que le toca.
 *
 * `null` si falta cualquiera de las dos semanas: sin las dos no hay diferencia
 * que dar, y enseñar un cero sería decir «no ha cambiado» cuando lo que pasa es
 * que no se sabe.
 */
export function pesoVsSemanaPasada(
  logs: BodyweightLog[],
  hoy: string = hoyIsoLocal(),
): PesoVsSemanaPasada {
  const inicioEsta = getWeekStart(hoy);
  const inicioAnterior = addDays(inicioEsta, -7);

  const media = (desde: string, hasta: string): { media: number | null; n: number } => {
    const v = logs.filter(l => l.date >= desde && l.date < hasta).map(l => l.weight);
    return v.length === 0
      ? { media: null, n: 0 }
      : { media: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, n: v.length };
  };

  const esta = media(inicioEsta, addDays(inicioEsta, 7));
  const anterior = media(inicioAnterior, inicioEsta);

  return {
    estaSemana: esta.media,
    semanaAnterior: anterior.media,
    deltaKg: esta.media != null && anterior.media != null
      ? Math.round((esta.media - anterior.media) * 10) / 10
      : null,
    registrosEstaSemana: esta.n,
  };
}
