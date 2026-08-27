import { WorkoutLog, Exercise, Mesocycle, MuscleGroup } from '../types';
import { aggregate, weightedGroupsOf, resolveWindows, ComparisonMode, Agg } from './trainingReport';

// Bloque "Rendimiento" del protocolo de mediciones de Dani: variación de 1RM
// estimado y tonelaje agrupada por PATRÓN DE MOVIMIENTO (empuje torso,
// tracción, brazo, empuje pierna, empuje cadera) en vez de por grupo
// muscular — la app solo tenía lo segundo (MuscleGroup, trainingReport.ts).
// Mismo motor (aggregate + weightedGroupsOf), solo cambia la clave de
// agrupación, así que los números coinciden con los de "Por grupo" en
// MesocycleReviewPanel cuando se suman los grupos que caen en cada patrón.

export type MovementPattern =
  | 'empuje_torso' | 'traccion' | 'brazo' | 'empuje_pierna' | 'empuje_cadera';

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  empuje_torso:  'Empujes torso',
  traccion:      'Tracciones',
  brazo:         'Brazo',
  empuje_pierna: 'Empujes pierna',
  empuje_cadera: 'Empujes cadera',
};

const ALL_PATTERNS: MovementPattern[] = ['empuje_torso', 'traccion', 'brazo', 'empuje_pierna', 'empuje_cadera'];

// Un grupo muscular puede caer en más de un patrón (el tríceps empuja Y es
// brazo) — cuenta entero en cada uno, no se reparte el peso entre patrones.
// core, gemelo, lumbares y rotadores quedan sin patrón: el protocolo de Dani
// solo trackea estos 5.
const MUSCLE_TO_PATTERNS: Partial<Record<MuscleGroup, MovementPattern[]>> = {
  pecho:         ['empuje_torso'],
  deltoide_ant:  ['empuje_torso'],
  deltoide_lat:  ['empuje_torso'],
  triceps:       ['empuje_torso', 'brazo'],
  dorsal:        ['traccion'],
  trapecio:      ['traccion'],
  deltoide_post: ['traccion'],
  biceps:        ['traccion', 'brazo'],
  antebrazo:     ['brazo'],
  cuadriceps:    ['empuje_pierna'],
  gluteo:        ['empuje_cadera'],
  isquios:       ['empuje_cadera'],
  aductores:     ['empuje_cadera'],
};

/** Patrones en los que cae un grupo muscular — lista vacía si el grupo no entra en ninguno (core, gemelo, lumbares, rotadores). */
export function patronesDeGrupo(g: MuscleGroup): MovementPattern[] {
  return MUSCLE_TO_PATTERNS[g] ?? [];
}

function mapToPatterns(g: MuscleGroup): MovementPattern[] {
  return patronesDeGrupo(g);
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function deltaPct(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

interface PatternBucket { tonnage: number; sets: number; orms: number[] }

function patternAgg(agg: Agg, exercises: Exercise[]): Map<MovementPattern, PatternBucket> {
  const byPattern = new Map<MovementPattern, PatternBucket>();
  for (const [exerciseId, row] of agg.perExercise) {
    for (const { group, weight } of weightedGroupsOf(exerciseId, exercises, mapToPatterns)) {
      if (group === 'none') continue; // ejercicio sin patrón asignado (o sin grupo muscular)
      let bucket = byPattern.get(group);
      if (!bucket) { bucket = { tonnage: 0, sets: 0, orms: [] }; byPattern.set(group, bucket); }
      bucket.tonnage = round1(bucket.tonnage + row.tonnage * weight);
      bucket.sets = round1(bucket.sets + row.sets * weight);
      // El 1RM estimado, igual que en trainingReport, solo cuenta para el patrón principal del ejercicio.
      if (weight === 1 && row.bestOrm > 0) bucket.orms.push(row.bestOrm);
    }
  }
  return byPattern;
}

// Misma forma que MuscleGroupPerf (trainingReport.ts) para que
// MesocycleReviewPanel pueda reutilizar la misma tabla de UI sin acoplarse al
// tipo — solo cambia `group` de MuscleGroup a MovementPattern.
export interface PatternPerf {
  group: MovementPattern;
  label: string;
  tonnage: number;
  tonnageDeltaPct: number | null;
  sets: number;
  setsDeltaPct: number | null;
  meanOrm: number | null;
  ormDeltaPct: number | null;
}

export interface MovementPatternReport {
  comparisonLabel: string;
  patterns: PatternPerf[];
}

export function buildMovementPatternReport(params: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  periodStart: string;
  periodEnd: string;
  comparison: ComparisonMode;
}): MovementPatternReport {
  const { logs, exercises, mesocycles, periodStart, periodEnd, comparison } = params;
  const w = resolveWindows(periodStart, periodEnd, comparison, mesocycles);

  const inRange = (date: string, start: string, end: string) => date >= start && date <= end;
  const curLogs = logs.filter(l => inRange(l.date, w.curStart, w.curEnd));
  const prevLogs = w.prevStart && w.prevEnd ? logs.filter(l => inRange(l.date, w.prevStart!, w.prevEnd!)) : [];

  const curP = patternAgg(aggregate(curLogs), exercises);
  const prevP = patternAgg(aggregate(prevLogs), exercises);
  const meanOf = (arr: number[]) => arr.length ? round1(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  const ordered = [...ALL_PATTERNS].sort((a, b) => (curP.get(b)?.tonnage ?? 0) - (curP.get(a)?.tonnage ?? 0));

  const patterns: PatternPerf[] = ordered.map(pattern => {
    const c = curP.get(pattern) ?? { tonnage: 0, sets: 0, orms: [] };
    const p = prevP.get(pattern) ?? null;
    const meanOrm = meanOf(c.orms);
    const prevMeanOrm = p ? meanOf(p.orms) : null;
    return {
      group: pattern,
      label: PATTERN_LABELS[pattern],
      tonnage: c.tonnage,
      tonnageDeltaPct: p ? deltaPct(c.tonnage, p.tonnage) : null,
      sets: c.sets,
      setsDeltaPct: p ? deltaPct(c.sets, p.sets) : null,
      meanOrm,
      ormDeltaPct: meanOrm != null && prevMeanOrm != null ? deltaPct(meanOrm, prevMeanOrm) : null,
    };
  });

  return { comparisonLabel: w.comparisonLabel, patterns };
}
