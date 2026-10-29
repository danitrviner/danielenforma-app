import { WorkoutLog, Exercise } from '../types.js';
import { weightedGroupsOf } from './trainingReport.js';
import { MovementPattern, PATTERN_LABELS, patronesDeGrupo } from './movementPatterns.js';
import { DataPoint, weekKey } from './seriesCorrelation.js';

// Series temporales de tonelaje por patrón, para el panel de correlaciones.
// Las tablas de patrones de cierreMesociclo.ts dan UN número por mesociclo
// cerrado; aquí hace falta una CURVA para poder cruzarla con peso, sueño o
// adherencia, así que se recalcula por semana natural (weekKey) sobre el log
// crudo. Mismos criterios que movementPatterns.ts: grupos vía weightedGroupsOf,
// y un grupo puede caer en más de un patrón contando entero en cada uno.
// (La curva del antiguo IEA —series × RIR/10— se retiró en E-11: premiaba el
// RIR alto. El estímulo se mide con el IEM del motor CDG.)

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
