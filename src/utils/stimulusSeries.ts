import { WorkoutLog, Exercise, MuscleGroup, MUSCLE_LABELS } from '../types';
import { weightedGroupsOf } from './trainingReport';
import { MovementPattern, PATTERN_LABELS, patronesDeGrupo } from './movementPatterns';
import { DataPoint, weekKey } from './seriesCorrelation';

// Series temporales de estímulo, para el panel de correlaciones. Las tablas
// de IEA/patrones de cierreMesociclo.ts dan UN número por mesociclo cerrado;
// aquí hace falta una CURVA para poder cruzarla con peso, sueño o adherencia,
// así que se recalcula por semana natural (weekKey) sobre el log crudo.
// Mismos criterios que accumulatedStimulusIndex.ts y movementPatterns.ts:
// series fraccionales vía weightedGroupsOf, RIR excluyendo las series al
// fallo, y un grupo puede caer en más de un patrón contando entero en cada uno.

function round1(n: number): number { return Math.round(n * 10) / 10; }

interface Bucket { fractionalSets: number; rirSum: number; rirCount: number; tonnage: number }

function nuevoBucket(): Bucket { return { fractionalSets: 0, rirSum: 0, rirCount: 0, tonnage: 0 }; }

/** Serie semanal de IEA por grupo muscular: series fraccionales × (RIR medio real / 10). */
export function seriesIEAPorGrupo(
  logs: WorkoutLog[],
  exercises: Exercise[],
): { group: MuscleGroup; label: string; points: DataPoint[] }[] {
  // semana -> grupo -> bucket
  const porSemana = new Map<string, Map<MuscleGroup, Bucket>>();
  for (const log of logs) {
    const wk = weekKey(log.date);
    let semana = porSemana.get(wk);
    if (!semana) { semana = new Map(); porSemana.set(wk, semana); }
    for (const entry of log.entries) {
      for (const { group, weight } of weightedGroupsOf(entry.exerciseId, exercises)) {
        if (group === 'none') continue;
        let b = semana.get(group);
        if (!b) { b = nuevoBucket(); semana.set(group, b); }
        for (const set of entry.sets) {
          b.fractionalSets += weight;
          if (!set.alFallo && typeof set.rir === 'number' && !isNaN(set.rir)) {
            b.rirSum += set.rir;
            b.rirCount++;
          }
        }
      }
    }
  }

  const porGrupo = new Map<MuscleGroup, DataPoint[]>();
  for (const [wk, semana] of [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [group, b] of semana) {
      // Sin RIR registrado esa semana no hay IEA — no se asume un RIR ni se
      // cuenta la semana como 0 (sería inventar un estímulo nulo que sí hubo).
      if (b.rirCount === 0) continue;
      const iea = round1(b.fractionalSets * ((b.rirSum / b.rirCount) / 10));
      if (!porGrupo.has(group)) porGrupo.set(group, []);
      porGrupo.get(group)!.push({ date: wk, value: iea });
    }
  }

  return [...porGrupo.entries()]
    .map(([group, points]) => ({ group, label: MUSCLE_LABELS[group], points }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Serie semanal de tonelaje por patrón de movimiento (empuje torso, tracción, brazo, empuje pierna, empuje cadera). */
export function seriesTonelajePorPatron(
  logs: WorkoutLog[],
  exercises: Exercise[],
): { pattern: MovementPattern; label: string; points: DataPoint[] }[] {
  const porSemana = new Map<string, Map<MovementPattern, number>>();
  for (const log of logs) {
    const wk = weekKey(log.date);
    let semana = porSemana.get(wk);
    if (!semana) { semana = new Map(); porSemana.set(wk, semana); }
    for (const entry of log.entries) {
      const tonelajeEntry = entry.sets.reduce((s, set) => s + (set.weight || 0) * (set.repsDone || 0), 0);
      if (tonelajeEntry === 0) continue;
      for (const { group, weight } of weightedGroupsOf(entry.exerciseId, exercises)) {
        if (group === 'none') continue;
        for (const pattern of patronesDeGrupo(group)) {
          semana.set(pattern, (semana.get(pattern) ?? 0) + tonelajeEntry * weight);
        }
      }
    }
  }

  const porPatron = new Map<MovementPattern, DataPoint[]>();
  for (const [wk, semana] of [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [pattern, tonelaje] of semana) {
      if (!porPatron.has(pattern)) porPatron.set(pattern, []);
      porPatron.get(pattern)!.push({ date: wk, value: Math.round(tonelaje) });
    }
  }

  return [...porPatron.entries()]
    .map(([pattern, points]) => ({ pattern, label: PATTERN_LABELS[pattern], points }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
