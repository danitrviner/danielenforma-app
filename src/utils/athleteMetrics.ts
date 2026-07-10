// Primitivas compartidas para leer el progreso del atleta desde sus logs.
// Usadas por el motor de retos semanales (weeklyChallenge.ts), la escalera de
// niveles (levelLadder.ts) y el progreso de fase (planPhase.ts) para que todos
// midan igual las mismas cosas.

import { BodyweightLog, StepLog, WorkoutLog, Exercise, DietCompletionLog, Diet } from '../types';
import { epley } from './oneRepMax';

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
