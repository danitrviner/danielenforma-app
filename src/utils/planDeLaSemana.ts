// Lo que el motor de retos necesita saber del ENTRENAMIENTO del atleta: qué
// bloque está haciendo, qué sesiones le quedan esta semana con su prescripción
// real (escalones, descarga, test…), qué hizo la última vez en cada ejercicio
// y en qué nivel de retos está.
//
// Existe porque hasta el 28-10-2026 el motor elegía el ejercicio del reto por
// palabra clave («remo», «press banca») entre lo registrado las últimas tres
// semanas, sin mirar el plan. A Dani le pidió «Mejora tu Remo en T» seis
// semanas en las que el Remo en T no estaba en su rutina: seis fallos con 0, y
// el motor acabó mandándole «Registra tus pasos 3 días» con diez semanas de
// antigüedad y «avanzado» en el alta.
//
// Módulo puro (sin Firebase): lo usan el navegador, el panel del coach, el
// asistente y el latido del servidor. Por eso importa con `.js`.

import type {
  Mesocycle, Workout, WorkoutAssignment, WorkoutExercise, WorkoutLog, WorkoutSetLog,
  Exercise, ExperienceLevel, NivelDeRetos, ContextoDeReto, ReferenciaDeEjercicio, MuscleGroup,
} from '../types.js';
import { mesocycleWeekNumber, resolverEjercicioDelMeso, vueltasDelCiclo } from './progression.js';
import { cicloDiasDeMeso } from './asignacionMesociclo.js';
import { nombreDeMeso, nombreCortoDeSesion } from './nombresMeso.js';
import { getWeekStart, addDays } from './trainingWeek.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { rirEfectivo } from './oneRepMax.js';
import { normalizeText } from './athleteMetrics.js';

// ── Nivel ─────────────────────────────────────────────────────────────────────

// Semanas con entrenos registrados a partir de las cuales el atleta deja de
// recibir retos de arranque, y a partir de las cuales los recibe de rendimiento.
export const SEMANAS_CONSTANCIA = 4;
export const SEMANAS_RENDIMIENTO = 8;
// Un atleta que llega diciendo «avanzado» no necesita dos meses de rodaje para
// que se le hable de su entrenamiento: con dos semanas de datos ya hay marcas.
export const SEMANAS_RENDIMIENTO_AVANZADO = 2;

/** Semanas distintas (lunes a domingo) con algún entreno registrado antes de `antesDe`. */
export function semanasEntrenadas(logs: WorkoutLog[], antesDe: string): number {
  const semanas = new Set<string>();
  for (const l of logs) {
    if (l.date >= antesDe) continue;
    if (l.entries.some(e => e.sets.length > 0)) semanas.add(getWeekStart(l.date));
  }
  return semanas.size;
}

/**
 * En qué nivel de retos está el atleta.
 *
 *   · arranque     — hábitos: registrar, completar sesiones.
 *   · constancia   — adherencia: semana completa, dieta, pasos, Zona 2.
 *   · rendimiento  — retos sobre su mesociclo: progresión, AMRAP, récords.
 *
 * El coach puede fijarlo a mano (`challengeConfig.nivel`); si no, sale de la
 * antigüedad real (semanas con entrenos) y de lo que el atleta declaró en el alta.
 */
export function nivelDeRetos(params: {
  workoutLogs: WorkoutLog[];
  today: string;
  experienceLevel?: ExperienceLevel;
  nivelForzado?: NivelDeRetos;
}): NivelDeRetos {
  if (params.nivelForzado) return params.nivelForzado;
  const semanas = semanasEntrenadas(params.workoutLogs, getWeekStart(params.today));
  if (semanas >= SEMANAS_RENDIMIENTO) return 'rendimiento';
  if (params.experienceLevel === 'avanzado' && semanas >= SEMANAS_RENDIMIENTO_AVANZADO) return 'rendimiento';
  if (semanas >= SEMANAS_CONSTANCIA) return 'constancia';
  return 'arranque';
}

// ── Plan de la semana ─────────────────────────────────────────────────────────

export interface EjercicioPlaneado {
  exerciseId: string;
  nombre: string;
  /** Prescripción de ESA semana (escalones, descarga, test ya aplicados). */
  prescripcion: WorkoutExercise;
  grupo?: MuscleGroup;
  /** Rango de repeticiones («8-12» → [8, 12]); null si no es un rango numérico. */
  rango: [number, number] | null;
}

export interface SesionPlaneada {
  assignmentId: string;
  date: string;
  status: WorkoutAssignment['status'];
  workoutId: string;
  nombre: string;
  ejercicios: EjercicioPlaneado[];
}

export interface PlanDeLaSemana {
  meso: Mesocycle | null;
  sesiones: SesionPlaneada[];
  contexto?: ContextoDeReto;
  /** Nota del coach del evento de la semana («Entrena en el hotel…»). */
  notaEvento?: string;
}

/** «8-12» → [8, 12]; «10» → [10, 10]; «AMRAP» o vacío → null. */
export function rangoDeReps(reps: string | undefined): [number, number] | null {
  const m = String(reps ?? '').match(/^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : a;
  return a > 0 && b >= a ? [a, b] : null;
}

/** Fin (inclusive) de un mesociclo: sus semanas de calendario desde el inicio. */
function finDeMeso(m: Mesocycle): string {
  return addDays(m.startDate, Math.max(1, m.weeks) * 7 - 1);
}

/**
 * El bloque que el atleta está haciendo hoy: el que ya empezó y no ha
 * terminado; si se solapan, el más reciente. Fuera de cualquier bloque, null.
 */
export function mesoActivo(mesos: Mesocycle[] | undefined, hoy: string): Mesocycle | null {
  const vivos = (mesos ?? []).filter(m => m.startDate && m.startDate <= hoy && hoy <= finDeMeso(m));
  if (vivos.length === 0) return null;
  return [...vivos].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

/**
 * Las sesiones de la semana de `today` con su prescripción resuelta.
 *
 * Con un bloque activo SOLO cuentan sus sesiones: si quedan asignaciones de un
 * mesociclo anterior (o de uno borrado), no son lo que el atleta está
 * haciendo — a Dani le quedaban 6 sesiones del «Meso #1» encima de las 5 de
 * «Hipertrofia 1», y un «completa la semana» le habría pedido 11.
 *
 * Devuelve null cuando quien llama no pasó rutinas: entonces no se sabe nada
 * del plan y el motor no debe proponer retos de rendimiento.
 */
export function planDeLaSemana(params: {
  assignments: WorkoutAssignment[];
  workouts?: Workout[];
  mesocycles?: Mesocycle[];
  exercises: Exercise[];
  today: string;
}): PlanDeLaSemana | null {
  if (!params.workouts) return null;
  const weekStart = getWeekStart(params.today);
  const weekEnd = addDays(weekStart, 6);
  const meso = mesoActivo(params.mesocycles, params.today);
  const ciclo = meso ? cicloDiasDeMeso(meso) : 7;
  const workoutById = new Map(params.workouts.map(w => [w.id, w]));
  const ejercicioById = new Map(params.exercises.map(e => [e.id, e]));

  const sesiones: SesionPlaneada[] = [];
  for (const a of params.assignments) {
    if (a.date < weekStart || a.date > weekEnd || a.status === 'skipped') continue;
    const w = workoutById.get(a.workoutId);
    if (!w) continue;
    if (meso && (a.mesocycleId ?? w.mesocycleId) !== meso.id) continue;
    const vuelta = meso ? mesocycleWeekNumber(meso.startDate, a.date, ciclo) : 1;
    const ejercicios = [...(w.exercises ?? [])]
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .map(we => {
        const prescripcion = meso ? resolverEjercicioDelMeso(we, meso, vuelta) : we;
        const ex = ejercicioById.get(we.exerciseId);
        return {
          exerciseId: we.exerciseId,
          nombre: ex?.name ?? 'Ejercicio',
          prescripcion,
          grupo: we.muscleGroup ?? ex?.muscleGroup,
          rango: rangoDeReps(prescripcion.reps),
        };
      });
    // «Torso A · Daniel Briz · Meso #2» → «Torso A»: el atleta ya sabe quién es.
    sesiones.push({ assignmentId: a.id, date: a.date, status: a.status, workoutId: w.id, nombre: nombreCortoDeSesion(w.name), ejercicios });
  }
  sesiones.sort((x, y) => x.date.localeCompare(y.date));

  if (!meso) return { meso: null, sesiones };

  const semana = mesocycleWeekNumber(meso.startDate, params.today, ciclo);
  const evento = meso.eventosSemana?.[String(semana)];
  const tipoSemana: ContextoDeReto['tipoSemana'] =
    meso.semanasTest?.includes(semana) ? 'test'
    : meso.semanasDescarga?.includes(semana) ? 'descarga'
    : meso.vuelveDeParon && semana === 1 ? 'paron'
    : evento ? 'evento'
    : undefined;
  return {
    meso,
    sesiones,
    contexto: {
      bloque: nombreDeMeso(meso),
      semana,
      semanas: vueltasDelCiclo(meso.weeks, ciclo),
      ...(tipoSemana ? { tipoSemana } : {}),
    },
    ...(evento?.nota ? { notaEvento: evento.nota } : {}),
  };
}

/** Sesiones que aún no se han hecho: las de hoy en adelante, sin completar. */
export function sesionesPendientes(plan: PlanDeLaSemana, today: string): SesionPlaneada[] {
  return plan.sesiones.filter(s => s.date >= today && s.status !== 'completed');
}

// ── Marcas ────────────────────────────────────────────────────────────────────

export interface Marca {
  weight: number;
  reps: number;
  rir: number;        // efectivo: al fallo = 0
  alFallo: boolean;
}

function aMarca(s: WorkoutSetLog): Marca {
  return { weight: Number(s.weight) || 0, reps: Number(s.repsDone) || 0, rir: rirEfectivo(s.rir, s.alFallo), alFallo: !!s.alFallo };
}

// Una marca de hace más de tres meses ya no dice lo que el atleta mueve hoy.
export const VENTANA_ULTIMA_VEZ_DIAS = 84;

/**
 * Las series principales de la última sesión en la que el atleta hizo este
 * ejercicio antes de `antesDe` (sin bajadas ni miniseries, que no son series).
 */
export function ultimaVez(
  logs: WorkoutLog[], exerciseId: string, antesDe: string,
): { date: string; series: Marca[] } | null {
  const desde = addDays(antesDe, -VENTANA_ULTIMA_VEZ_DIAS);
  let mejor: { date: string; series: Marca[] } | null = null;
  for (const log of logs) {
    if (log.date >= antesDe || log.date < desde) continue;
    if (mejor && log.date <= mejor.date) continue;
    const series = log.entries
      .filter(e => e.exerciseId === exerciseId)
      .flatMap(e => seriesPrincipales(e.sets))
      .map(aMarca)
      .filter(m => m.reps > 0);
    if (series.length > 0) mejor = { date: log.date, series };
  }
  return mejor;
}

/** Las dos últimas sesiones con el ejercicio (la más reciente primero). */
export function ultimasDosVeces(
  logs: WorkoutLog[], exerciseId: string, antesDe: string,
): [Marca[], Marca[]] | null {
  const ultima = ultimaVez(logs, exerciseId, antesDe);
  if (!ultima) return null;
  const anterior = ultimaVez(logs, exerciseId, ultima.date);
  return anterior ? [ultima.series, anterior.series] : null;
}

/** La serie más pesada; a igual peso, la de más repeticiones. */
export function serieTop(series: Marca[]): Marca | null {
  let top: Marca | null = null;
  for (const s of series) {
    if (!top || s.weight > top.weight + 0.01 || (Math.abs(s.weight - top.weight) <= 0.01 && s.reps > top.reps)) top = s;
  }
  return top;
}

/** Más kilos con las mismas repeticiones (o más), o más repeticiones con los mismos kilos (o más). */
export function superaA(ref: { weight: number; reps: number }, s: { weight: number; reps: number }): boolean {
  return (s.weight > ref.weight + 0.01 && s.reps >= ref.reps)
    || (s.weight + 0.01 >= ref.weight && s.reps > ref.reps);
}

export function referenciaDe(exerciseId: string, exerciseName: string, top: Marca): ReferenciaDeEjercicio {
  return { exerciseId, exerciseName, weight: top.weight, reps: top.reps };
}

/**
 * Cuántas de las referencias se han superado en [from, to]. Con `workoutId`,
 * solo cuentan las sesiones de esa rutina.
 */
export function ejerciciosMejorados(
  refs: ReferenciaDeEjercicio[], logs: WorkoutLog[], from: string, to: string, workoutId?: string,
): number {
  let n = 0;
  for (const ref of refs) {
    const mejorado = logs.some(log =>
      log.date >= from && log.date <= to && (!workoutId || log.workoutId === workoutId)
      && log.entries.some(e => e.exerciseId === ref.exerciseId
        && seriesPrincipales(e.sets).some(s => superaA(ref, { weight: Number(s.weight) || 0, reps: Number(s.repsDone) || 0 }))));
    if (mejorado) n++;
  }
  return n;
}

/** Más repeticiones hechas con `weight` kg o más en este ejercicio antes de `antesDe`. */
export function recordDeReps(logs: WorkoutLog[], exerciseId: string, weight: number, antesDe: string): number {
  let best = 0;
  for (const log of logs) {
    if (log.date >= antesDe) continue;
    for (const e of log.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of e.sets) {
        if ((Number(s.weight) || 0) + 0.01 >= weight && (Number(s.repsDone) || 0) > best) best = Number(s.repsDone) || 0;
      }
    }
  }
  return best;
}

/**
 * Los récords vigentes de un ejercicio antes de `antesDe`: para cada peso, las
 * repeticiones máximas, quitando los que otro récord ya domina (más kilos y
 * más repeticiones). Del más pesado al más ligero.
 */
export function tablaDeRecords(logs: WorkoutLog[], exerciseId: string, antesDe: string): { weight: number; reps: number }[] {
  const porPeso = new Map<number, number>();
  for (const log of logs) {
    if (log.date >= antesDe) continue;
    for (const e of log.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of e.sets) {
        const w = Number(s.weight) || 0;
        const r = Number(s.repsDone) || 0;
        if (r > 0 && r > (porPeso.get(w) ?? 0)) porPeso.set(w, r);
      }
    }
  }
  const pesos = [...porPeso.entries()].sort((a, b) => b[0] - a[0]);
  const frente: { weight: number; reps: number }[] = [];
  let maxReps = 0;
  for (const [weight, reps] of pesos) {
    if (reps > maxReps) { frente.push({ weight, reps }); maxReps = reps; }
  }
  return frente;
}

/**
 * En cuántos ejercicios distintos se batió un récord de repeticiones en
 * [from, to]: una serie con más repeticiones que nunca a ese peso (o más
 * kilos que nunca). Solo cuentan ejercicios que ya tenían historial — el
 * primer día con un ejercicio nuevo no es un récord, es un punto de partida.
 */
export function recordsBatidos(
  logs: WorkoutLog[], from: string, to: string, exerciseId?: string,
): number {
  const conRecord = new Set<string>();
  for (const log of logs) {
    if (log.date < from || log.date > to) continue;
    for (const e of log.entries) {
      if (exerciseId && e.exerciseId !== exerciseId) continue;
      if (conRecord.has(e.exerciseId)) continue;
      const tieneHistorial = logs.some(l => l.date < from && l.entries.some(x => x.exerciseId === e.exerciseId && x.sets.length > 0));
      if (!tieneHistorial) continue;
      for (const s of seriesPrincipales(e.sets)) {
        const w = Number(s.weight) || 0;
        const r = Number(s.repsDone) || 0;
        if (r > 0 && r > recordDeReps(logs, e.exerciseId, w, from)) { conRecord.add(e.exerciseId); break; }
      }
    }
  }
  return conRecord.size;
}

// ── AMRAP ─────────────────────────────────────────────────────────────────────

// Ejercicios en los que NO se pide una serie al máximo: con barra libre y
// mucha carga axial, la última repetición «a ver si sale» es donde se rompe
// la técnica. Las variantes guiadas (hack, multipower, máquina) sí valen.
const NO_AMRAP = ['peso muerto', 'sentadilla', 'buenos dias', 'zancada', 'bulgara', 'good morning', 'clean', 'arrancada', 'snatch'];
const GUIADO = ['maquina', 'polea', 'prensa', 'hack', 'multipower', 'smith', 'pendular', 'jalon', 'contractora'];

/** Máquina, polea o trayectoria fija: donde fallar una repetición no tiene riesgo. */
export function esGuiado(ex: Pick<Exercise, 'name' | 'guiado'> | undefined): boolean {
  if (!ex) return false;
  const n = normalizeText(ex.name);
  return ex.guiado === true || GUIADO.some(k => n.includes(k));
}

export function seguroParaAmrap(ex: Pick<Exercise, 'name' | 'guiado'> | undefined): boolean {
  if (!ex) return false;
  if (esGuiado(ex)) return true;
  const n = normalizeText(ex.name);
  return !NO_AMRAP.some(k => n.includes(k));
}
