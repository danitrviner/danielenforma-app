// Primitivas compartidas para leer el progreso del atleta desde sus logs.
// Usadas por el motor de retos semanales (weeklyChallenge.ts), la escalera de
// niveles (levelLadder.ts) y el progreso de fase (planPhase.ts) para que todos
// midan igual las mismas cosas.

import {
  BodyweightLog, StepLog, WorkoutLog, Exercise, DietCompletionLog, Diet,
  MuscleGroup, CardioSession,
} from '../types';
import { epley } from './oneRepMax';
import { weightedGroupsOf } from './trainingReport';

// Normaliza para comparar nombres de ejercicio: minúsculas y sin acentos.
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function lastBodyweight(logs: BodyweightLog[]): BodyweightLog | null {
  if (logs.length === 0) return null;
  return [...logs].sort((a, b) => a.date.localeCompare(b.date))[logs.length - 1];
}

export function firstBodyweight(logs: BodyweightLog[]): BodyweightLog | null {
  if (logs.length === 0) return null;
  return [...logs].sort((a, b) => a.date.localeCompare(b.date))[0];
}

// IDs de ejercicios cuyo nombre contiene el término (sin acentos ni mayúsculas).
export function exerciseIdsMatching(exercises: Exercise[], nameMatch: string): Set<string> {
  const needle = normalizeText(nameMatch);
  return new Set(exercises.filter(e => normalizeText(e.name).includes(needle)).map(e => e.id));
}

export interface BestSet {
  exerciseId: string;
  weight: number;
  reps: number;
  e1rm: number;
  date: string;
}

// Mejor serie (por e1RM estimado) entre los logs dados, opcionalmente acotada a
// un conjunto de ejercicios y/o a un rango de fechas [from, to] inclusivo.
export function bestSet(
  logs: WorkoutLog[],
  opts: { exerciseIds?: Set<string>; from?: string; to?: string } = {},
): BestSet | null {
  let best: BestSet | null = null;
  for (const log of logs) {
    if (opts.from && log.date < opts.from) continue;
    if (opts.to && log.date > opts.to) continue;
    for (const entry of log.entries) {
      if (opts.exerciseIds && !opts.exerciseIds.has(entry.exerciseId)) continue;
      for (const set of entry.sets) {
        const e1rm = epley(set.weight, set.repsDone);
        if (e1rm > 0 && (!best || e1rm > best.e1rm)) {
          best = { exerciseId: entry.exerciseId, weight: set.weight, reps: set.repsDone, e1rm, date: log.date };
        }
      }
    }
  }
  return best;
}

export interface ExerciseBestProgress {
  current: BestSet;
  // kg de diferencia respecto al mejor set ANTERIOR a `current.date` — en kg
  // del peso levantado, no del e1RM (que no es una cifra que el atleta
  // reconozca). null si `current` es el único/primer registro del ejercicio.
  deltaKgVsPrevious: number | null;
}

// "Tu mejor serie" de la ficha de ejercicio (F3.13, panel "Biblioteca" 02):
// el mejor set histórico de un ejercicio + cuánto mejoró sobre el mejor set
// que había ANTES de esa fecha.
export function exerciseBestProgress(logs: WorkoutLog[], exerciseId: string): ExerciseBestProgress | null {
  const ids = new Set([exerciseId]);
  const current = bestSet(logs, { exerciseIds: ids });
  if (!current) return null;
  const previous = bestSet(logs.filter(l => l.date < current.date), { exerciseIds: ids });
  return {
    current,
    deltaKgVsPrevious: previous ? Math.round((current.weight - previous.weight) * 10) / 10 : null,
  };
}

export interface ExerciseSessionEntry {
  date: string;
  sets: { weight: number; reps: number }[];
}

// Lista sesión a sesión (más reciente primero) de lo que el atleta levantó en
// un ejercicio — a diferencia de exerciseBestProgress (solo el mejor set de
// siempre), esto es lo que pide "revisar los pesos usados": cada sesión con
// sus series reales, para que el atleta compare sin tener que hacer memoria.
export function exerciseSessionHistory(
  logs: WorkoutLog[],
  exerciseId: string,
  limit = 10,
): ExerciseSessionEntry[] {
  const bySession: ExerciseSessionEntry[] = [];
  for (const log of logs) {
    const entry = log.entries.find(e => e.exerciseId === exerciseId);
    if (!entry || entry.sets.length === 0) continue;
    bySession.push({ date: log.date, sets: entry.sets.map(s => ({ weight: s.weight, reps: s.repsDone })) });
  }
  return bySession.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

// Peso máximo levantado por sesión en un ejercicio, últimas `sessionsBack`
// sesiones que lo incluyeron, más antigua primero — para el `Sparkline` de
// la ficha de ejercicio (construido en F3.3 ya pensando en este uso).
export function exerciseWeightTrend(logs: WorkoutLog[], exerciseId: string, sessionsBack = 8): number[] {
  const bySession: { date: string; weight: number }[] = [];
  for (const log of logs) {
    const entry = log.entries.find(e => e.exerciseId === exerciseId);
    if (!entry) continue;
    const topWeight = entry.sets.reduce((max, s) => Math.max(max, s.weight), 0);
    if (topWeight > 0) bySession.push({ date: log.date, weight: topWeight });
  }
  return bySession.sort((a, b) => a.date.localeCompare(b.date)).slice(-sessionsBack).map(s => s.weight);
}

// Media diaria de pasos sobre los días CON registro dentro de [from, to].
export function avgSteps(logs: StepLog[], from: string, to: string): { avg: number; days: number } {
  const inRange = logs.filter(l => l.date >= from && l.date <= to);
  if (inRange.length === 0) return { avg: 0, days: 0 };
  // Un log por día en la práctica; si hubiera duplicados nos quedamos con el mayor.
  const byDay = new Map<string, number>();
  for (const l of inRange) byDay.set(l.date, Math.max(byDay.get(l.date) ?? 0, l.steps));
  const values = [...byDay.values()];
  return { avg: values.reduce((s, v) => s + v, 0) / values.length, days: values.length };
}

export function totalSteps(logs: StepLog[], from: string, to: string): number {
  const byDay = new Map<string, number>();
  for (const l of logs) {
    if (l.date < from || l.date > to) continue;
    byDay.set(l.date, Math.max(byDay.get(l.date) ?? 0, l.steps));
  }
  return [...byDay.values()].reduce((s, v) => s + v, 0);
}

// % de adherencia por día registrado dentro de [from, to] — la misma métrica
// que weeklyDietAdherencePct (items marcados / items totales de la dieta) pero
// sin bucketing por semanas de programa.
export function dailyDietPcts(
  completionLogs: DietCompletionLog[],
  diets: Diet[],
  from: string,
  to: string,
): { avg: number; days: number } {
  const dietsById = new Map(diets.map(d => [d.id, d]));
  const pcts: number[] = [];
  for (const log of completionLogs) {
    if (log.date < from || log.date > to) continue;
    const diet = dietsById.get(log.dietId);
    const totalItems = diet ? diet.meals.reduce((s, m) => s + m.items.length, 0) : 0;
    if (totalItems === 0) continue;
    pcts.push(Math.min(100, (log.doneItemIds.length / totalItems) * 100));
  }
  if (pcts.length === 0) return { avg: 0, days: 0 };
  return { avg: pcts.reduce((s, v) => s + v, 0) / pcts.length, days: pcts.length };
}

// ── Primitivas de los retos de volumen, cardio y hábito ───────────────────────

// Series FRACCIONALES por grupo muscular en [from, to]: el secundario de un
// ejercicio cuenta con su peso parcial, igual que en los informes de
// entrenamiento (weightedGroupsOf) — así "series de pierna" no ignora lo que
// aporta un peso muerto al isquio.
export function fractionalSetsByGroup(
  logs: WorkoutLog[],
  exercises: Exercise[],
  from: string,
  to: string,
): Map<MuscleGroup, number> {
  const acc = new Map<MuscleGroup, number>();
  for (const log of logs) {
    if (log.date < from || log.date > to) continue;
    for (const entry of log.entries) {
      if (entry.sets.length === 0) continue;
      for (const { group, weight } of weightedGroupsOf(entry.exerciseId, exercises)) {
        if (group === 'none') continue;
        acc.set(group, (acc.get(group) ?? 0) + entry.sets.length * weight);
      }
    }
  }
  return acc;
}

// Mejores repeticiones logradas a `atWeight` kg o más en un ejercicio dentro de
// [from, to]. Es la métrica del reto de "PR de reps": subir repeticiones sin
// tocar el peso, que progresa igual pero no obliga a fallar un intento pesado.
export function bestRepsAtWeight(
  logs: WorkoutLog[],
  exerciseId: string,
  atWeight: number,
  from: string,
  to: string,
): number {
  let best = 0;
  for (const log of logs) {
    if (log.date < from || log.date > to) continue;
    for (const entry of log.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      for (const set of entry.sets) {
        // Tolerancia de 0,01 kg: los discos se registran con decimales y un
        // 79,999 no debe descalificar una serie hecha a 80.
        if (set.weight + 0.01 >= atWeight && set.repsDone > best) best = set.repsDone;
      }
    }
  }
  return best;
}

// Minutos acumulados en Zona 2 en [from, to]. Las sesiones añadidas a mano
// (`manual`) no cuentan: sin banda no hay zonas reales, solo una estimación que
// el atleta podría inflar sin querer — misma regla que el XP de FITIV.
export function zone2Minutes(sessions: CardioSession[], from: string, to: string): number {
  let sec = 0;
  for (const s of sessions) {
    if (s.date < from || s.date > to || s.manual) continue;
    sec += s.timeInZoneSec?.z2 ?? 0;
  }
  return Math.round(sec / 60);
}

// Días DISTINTOS con registro en [from, to]. Base de los retos de hábito: lo
// que se mide es que el atleta abra la app y anote, no cuánto anotó.
export function loggedDays(entries: { date: string }[], from: string, to: string): number {
  const days = new Set<string>();
  for (const e of entries) {
    if (e.date >= from && e.date <= to) days.add(e.date);
  }
  return days.size;
}
