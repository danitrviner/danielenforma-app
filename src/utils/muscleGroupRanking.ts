import { MuscleGroup, MuscleGroupConfig } from '../types';

// Ranks muscle groups within a stage's volume config: priority (alta→baja) first,
// then weekly series descending. Same ordering MesocycleManager's distribution
// engine already used inline — extracted here so MesocycleTemplateLibrary can
// compute "top N prioritized groups" per template without duplicating the logic.
const PRIO_ORDER: Record<MuscleGroupConfig['priority'], number> = { alta: 0, media: 1, baja: 2 };

export function rankMuscleGroups(groups: Record<MuscleGroup, MuscleGroupConfig>): MuscleGroup[] {
  return (Object.keys(groups) as MuscleGroup[])
    .filter(g => groups[g].series > 0)
    .sort((a, b) => {
      const dp = PRIO_ORDER[groups[a].priority] - PRIO_ORDER[groups[b].priority];
      return dp !== 0 ? dp : groups[b].series - groups[a].series;
    });
}

export function getTopMuscleGroups(groups: Record<MuscleGroup, MuscleGroupConfig>, count = 3): MuscleGroup[] {
  return rankMuscleGroups(groups).slice(0, count);
}
