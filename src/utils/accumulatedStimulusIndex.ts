import { WorkoutLog, Exercise, Mesocycle, MuscleGroup, MUSCLE_LABELS } from '../types';
import { weightedGroupsOf, resolveWindows, ComparisonMode } from './trainingReport';

// IEA — Índice de Estímulo Acumulado. Sustituye al tonelaje bruto como
// medida de "cuánto estímulo real recibió el grupo": el tonelaje miente
// cuando cambia el rango de repeticiones de la rutina (un bloque de fuerza
// 3x3 dispara el tonelaje aunque el estímulo de hipertrofia sea menor que un
// bloque de 3x10). IEA = series fraccionales realizadas × (RIR medio real / 10)
// — no usamos RPE porque no existe en el log de entreno, solo RIR
// (inversamente relacionado: RPE≈10-RIR).

function round1(n: number): number { return Math.round(n * 10) / 10; }

interface GroupBucket { fractionalSets: number; rirSum: number; rirCount: number }

function statsByGroup(logs: WorkoutLog[], exercises: Exercise[]): Map<MuscleGroup, GroupBucket> {
  const byGroup = new Map<MuscleGroup, GroupBucket>();
  for (const log of logs) {
    for (const entry of log.entries) {
      const grupos = weightedGroupsOf(entry.exerciseId, exercises);
      for (const { group, weight } of grupos) {
        if (group === 'none') continue;
        let bucket = byGroup.get(group);
        if (!bucket) { bucket = { fractionalSets: 0, rirSum: 0, rirCount: 0 }; byGroup.set(group, bucket); }
        for (const set of entry.sets) {
          bucket.fractionalSets = round1(bucket.fractionalSets + weight);
          // Mismo criterio que rirStats.ts::computeAverageRir: series al fallo no leen `rir`, se excluyen.
          if (!set.alFallo && typeof set.rir === 'number' && !isNaN(set.rir)) {
            bucket.rirSum += set.rir;
            bucket.rirCount++;
          }
        }
      }
    }
  }
  return byGroup;
}

export interface IEARow {
  group: MuscleGroup;
  label: string;
  fractionalSets: number;
  meanRir: number | null;
  iea: number | null; // null si no hay RIR registrado en la ventana — no se asume un RIR
}

export interface AccumulatedStimulusReport {
  comparisonLabel: string;
  rows: IEARow[];
}

export function buildAccumulatedStimulusReport(params: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  periodStart: string;
  periodEnd: string;
  comparison: ComparisonMode;
}): AccumulatedStimulusReport {
  const { logs, exercises, mesocycles, periodStart, periodEnd, comparison } = params;
  const w = resolveWindows(periodStart, periodEnd, comparison, mesocycles);
  const curLogs = logs.filter(l => l.date >= w.curStart && l.date <= w.curEnd);

  const stats = statsByGroup(curLogs, exercises);
  const rows: IEARow[] = [...stats.entries()]
    .sort(([, a], [, b]) => b.fractionalSets - a.fractionalSets)
    .map(([group, s]) => {
      const meanRir = s.rirCount > 0 ? round1(s.rirSum / s.rirCount) : null;
      return {
        group,
        label: MUSCLE_LABELS[group],
        fractionalSets: s.fractionalSets,
        meanRir,
        iea: meanRir != null ? round1(s.fractionalSets * (meanRir / 10)) : null,
      };
    });

  return { comparisonLabel: w.comparisonLabel, rows };
}
