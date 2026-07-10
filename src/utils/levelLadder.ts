// Evaluación de la escalera de niveles. Un nivel se alcanza cumpliendo TODOS
// sus criterios; los criterios con datos en la app se evalúan solos y los
// 'manual' (flexiones, dominadas…) los marca el coach. Un nivel ya logrado
// (achievedLevelIds) nunca se pierde aunque los datos actuales retrocedan.

import {
  LevelLadder, LadderLevel, LevelCriterion,
  BodyweightLog, StepLog, WorkoutLog, Exercise,
} from '../types';
import { addDays } from './trainingWeek';
import { lastBodyweight, firstBodyweight, bestSet, exerciseIdsMatching, avgSteps } from './athleteMetrics';

export interface LadderData {
  bodyweightLogs: BodyweightLog[];
  stepLogs: StepLog[];
  workoutLogs: WorkoutLog[];
  exercises: Exercise[];
  initialWeight?: number;   // de UserProfile/onboarding; fallback: primer pesaje
  today: string;            // YYYY-MM-DD
}

export interface CriterionStatus {
  criterion: LevelCriterion;
  done: boolean;
  currentValue?: number;    // no aplica a 'manual'
  pct: number;              // 0-100 hacia el target
}

export interface LadderStatus {
  currentLevel: LadderLevel | null;   // el más alto alcanzado; null = aún ninguno
  nextLevel: LadderLevel | null;      // null = escalera completada
  nextLevelCriteria: CriterionStatus[];
  newlyAchieved: LadderLevel[];       // cumplidos ahora y aún no persistidos
}

export function evaluateCriterion(c: LevelCriterion, data: LadderData): CriterionStatus {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  switch (c.kind) {
    case 'peso_perdido_kg': {
      const start = data.initialWeight ?? firstBodyweight(data.bodyweightLogs)?.weight;
      const last = lastBodyweight(data.bodyweightLogs)?.weight;
      const lost = start != null && last != null ? start - last : 0;
      const target = c.targetValue ?? 0;
      return { criterion: c, done: target > 0 && lost >= target, currentValue: Math.round(lost * 10) / 10, pct: target > 0 ? clamp((lost / target) * 100) : 0 };
    }
    case 'sentadilla_xbw': {
      const ids = exerciseIdsMatching(data.exercises, c.exerciseNameMatch ?? 'sentadilla');
      const best = bestSet(data.workoutLogs, { exerciseIds: ids });
      const bw = lastBodyweight(data.bodyweightLogs)?.weight;
      const ratio = best && bw ? best.e1rm / bw : 0;
      const target = c.targetValue ?? 0;
      return { criterion: c, done: target > 0 && ratio >= target, currentValue: Math.round(ratio * 100) / 100, pct: target > 0 ? clamp((ratio / target) * 100) : 0 };
    }
    case 'pasos_media_diaria': {
      const { avg } = avgSteps(data.stepLogs, addDays(data.today, -28), data.today);
      const target = c.targetValue ?? 0;
      return { criterion: c, done: target > 0 && avg >= target, currentValue: Math.round(avg), pct: target > 0 ? clamp((avg / target) * 100) : 0 };
    }
    case 'manual':
      return { criterion: c, done: c.manualDone === true, pct: c.manualDone ? 100 : 0 };
  }
}

export function computeLadderStatus(ladder: LevelLadder, data: LadderData): LadderStatus {
  const levels = [...ladder.levels].sort((a, b) => a.order - b.order);
  const achieved = ladder.achievedLevelIds ?? {};

  const meetsNow = new Map<string, boolean>();
  for (const lvl of levels) {
    meetsNow.set(lvl.id, lvl.criteria.length > 0 && lvl.criteria.every(c => evaluateCriterion(c, data).done));
  }

  // Alcanzado = persistido como logrado O cumplido con los datos actuales.
  const isAchieved = (lvl: LadderLevel) => achieved[lvl.id] != null || meetsNow.get(lvl.id) === true;

  let currentLevel: LadderLevel | null = null;
  for (const lvl of levels) {
    if (isAchieved(lvl)) currentLevel = lvl;   // el más alto gana
  }

  const nextLevel = levels.find(lvl => lvl.order > (currentLevel?.order ?? -1)) ?? null;
  const nextLevelCriteria = nextLevel ? nextLevel.criteria.map(c => evaluateCriterion(c, data)) : [];
  const newlyAchieved = levels.filter(lvl => meetsNow.get(lvl.id) && achieved[lvl.id] == null);

  return { currentLevel, nextLevel, nextLevelCriteria, newlyAchieved };
}
