import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserProfile,
} from '../types';
import {
  getMesocycles, getNutritionProgram, getRoadmap, getBodyweightForAthlete,
  getStepsForAthlete, getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete,
  getDietsForAthlete, getOnboarding, getAthleteNutritionConfig, getWorkoutAssignmentsForAthlete,
  getWeeklyChallengesForAthlete, saveRoadmapLevelProgress, createNotificationDeduped,
} from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import RoadmapTimeline from './RoadmapTimeline';
import PhaseHeroCard from './roadmap/PhaseHeroCard';
import WeeklyChallengeCard, { ChallengePendingCard } from './roadmap/WeeklyChallengeCard';
import PhasePathStepper from './roadmap/PhasePathStepper';
import LevelLadderCard from './roadmap/LevelLadderCard';
import RecentAchievements, { Achievement } from './roadmap/RecentAchievements';
import { ensureWeeklyChallenge, EnsureChallengeResult } from '../utils/ensureWeeklyChallenge';
import { ChallengeData } from '../utils/weeklyChallenge';
import { computeLadderStatus } from '../utils/levelLadder';
import { computePhaseProgress, currentPhase, PhaseData } from '../utils/planPhase';
import { DEFAULT_LEVEL_LADDER } from '../data/defaultLevelLadder';
import { buildPhaseEnergyPlans, buildWeightProjection, ProjectionResult } from '../utils/nutritionPeriodization';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { computePhaseWeightStatus } from '../utils/planNutritionBridge';
import { markRoadmapVisited } from './PlanInPreparationCard';

const PHASE_COLORS = ['#fbcb1a', '#00eefc', '#ff8c69', '#a78bfa'];
const DEFAULT_STEP_GOAL = 8000;
const COACH_EMAIL = 'danitrviner@gmail.com';

interface Props {
  profile: UserProfile;
}

export default function AthleteRoadmapScreen({ profile }: Props) {
  const [challengeResult, setChallengeResult] = useState<EnsureChallengeResult | null>(null);

  // El checklist de "primeros pasos" en Inicio (PlanInPreparationCard) marca
  // este ítem como hecho también si el atleta llega aquí directo por la nav,
  // no solo pulsando el ítem desde el checklist.
  useEffect(() => { markRoadmapVisited(profile.email); }, [profile.email]);

  const { data: mesocycles = [], isPending: loadingMesocycles } = useQuery({
    queryKey: ['mesocycles', profile.email],
    queryFn: () => getMesocycles(profile.email),
  });
  const { data: nutritionProgram = null, isPending: loadingNutritionProgram } = useQuery({
    queryKey: ['nutritionProgram', profile.email],
    queryFn: () => getNutritionProgram(profile.email),
  });
  const { data: roadmap = null, isPending: loadingRoadmap } = useQuery({
    queryKey: ['roadmap', profile.email],
    queryFn: () => getRoadmap(profile.email),
  });
  const { data: bodyweightLogs = [], isPending: loadingBodyweight } = useQuery({
    queryKey: bodyweightForAthleteKey(profile.email),
    queryFn: () => getBodyweightForAthlete(profile.email),
  });
  const { data: stepLogs = [], isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', profile.email],
    queryFn: () => getStepsForAthlete(profile.email),
  });
  const { data: workoutLogs = [], isPending: loadingWorkoutLogs } = useQuery({
    queryKey: ['workoutLogs', profile.email],
    queryFn: () => getWorkoutLogs(profile.email),
  });
  const { data: exercises = [], isPending: loadingExercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });
  const { data: dietCompletionLogs = [], isPending: loadingDietCompletionLogs } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', profile.email],
    queryFn: () => getDietCompletionLogsForAthlete(profile.email),
  });
  const { data: diets = [], isPending: loadingDiets } = useQuery({
    queryKey: ['dietsForAthlete', profile.email],
    queryFn: () => getDietsForAthlete(profile.email),
  });
  const { data: onboarding = null, isPending: loadingOnboarding } = useQuery({
    queryKey: ['onboarding', profile.email],
    queryFn: () => getOnboarding(profile.email).catch(() => null),
  });
  const { data: nutConfig, isPending: loadingNutConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', profile.email],
    queryFn: () => getAthleteNutritionConfig(profile.email).catch(() => null),
  });
  const { data: assignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['workoutAssignmentsForAthlete', profile.userId],
    queryFn: () => getWorkoutAssignmentsForAthlete(profile.userId),
  });
  const { data: challengeHistory = [], isPending: loadingChallengeHistory } = useQuery({
    queryKey: ['weeklyChallengesForAthlete', profile.email],
    queryFn: () => getWeeklyChallengesForAthlete(profile.email),
  });

  const loading = loadingMesocycles || loadingNutritionProgram || loadingRoadmap || loadingBodyweight
    || loadingSteps || loadingWorkoutLogs || loadingExercises || loadingDietCompletionLogs
    || loadingDiets || loadingOnboarding || loadingNutConfig || loadingAssignments || loadingChallengeHistory;

  const stepGoal = nutConfig?.stepGoal ?? DEFAULT_STEP_GOAL;
  const kcalPerStep = nutConfig?.kcalPerStep ?? DEFAULT_KCAL_PER_STEP;

  const projection = useMemo<ProjectionResult | null>(() => {
    if (loading || !nutritionProgram) return null;
    const today = new Date().toISOString().split('T')[0];
    return buildWeightProjection({
      program: nutritionProgram,
      plans: buildPhaseEnergyPlans(nutritionProgram, diets),
      diets, onboarding, bodyweightLogs, completionLogs: dietCompletionLogs,
      stepLogs, stepGoal, kcalPerStep, today,
    });
  }, [loading, nutritionProgram, diets, onboarding, bodyweightLogs, dietCompletionLogs, stepLogs, stepGoal, kcalPerStep]);

  // Igual que el Promise.all().then() original: ensureWeeklyChallenge se
  // dispara una sola vez por atleta cuando todos los datos ya cargaron, no en
  // cada refetch de fondo — mismo patrón de guard con ref que StepsWidget.
  const challengeInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading || challengeInitFor.current === profile.email) return;
    challengeInitFor.current = profile.email;
    const today = new Date().toISOString().split('T')[0];
    const challengeData: ChallengeData = {
      stepLogs, bodyweightLogs, workoutLogs, exercises,
      completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
      assignments, projection, liftExerciseIds: roadmap?.challengeConfig?.liftExerciseIds,
    };
    ensureWeeklyChallenge(profile.email, challengeData, today)
      .then(result => setChallengeResult(result))
      .catch(err => console.warn('AthleteRoadmapScreen load error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile.email]);

  const ladderStatus = useMemo(() => {
    if (loading) return null;
    const ladder = roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER;
    return computeLadderStatus(ladder, {
      bodyweightLogs, stepLogs, workoutLogs,
      exercises, initialWeight: profile.initialWeight,
      today: new Date().toISOString().split('T')[0],
    });
  }, [loading, roadmap, bodyweightLogs, stepLogs, workoutLogs, exercises, profile.initialWeight]);

  // Persiste nuevos niveles alcanzados con un merge parcial del campo
  // levelLadder: reescribir el roadmap completo desde el snapshot del atleta
  // podía revertir fases/items que el coach hubiera editado en paralelo.
  useEffect(() => {
    if (!roadmap || !ladderStatus || ladderStatus.newlyAchieved.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    const achievedLevelIds = { ...(roadmap.levelLadder?.achievedLevelIds ?? {}) };
    for (const lvl of ladderStatus.newlyAchieved) achievedLevelIds[lvl.id] = today;
    const baseLadder = roadmap.levelLadder ?? DEFAULT_LEVEL_LADDER;
    saveRoadmapLevelProgress(profile.email, { ...baseLadder, achievedLevelIds }).catch(err =>
      console.warn('saveRoadmapLevelProgress (level up) failed:', err),
    );
    for (const lvl of ladderStatus.newlyAchieved) {
      const body = `Has alcanzado el nivel ${lvl.name}. ¡Enorme!`;
      createNotificationDeduped(`notif_lvl_${profile.email}_${lvl.id}`, {
        recipientEmail: profile.email, type: 'level_up', title: 'Nuevo nivel 🏅', body,
        link: 'roadmap', createdAt: new Date().toISOString(), read: false,
      }).catch(err => console.warn('createNotificationDeduped (level up, athlete) failed:', err));
      createNotificationDeduped(`notif_lvl_${profile.email}_${lvl.id}_coach`, {
        recipientEmail: COACH_EMAIL, type: 'level_up', title: 'Nuevo nivel',
        body: `${profile.email} ha alcanzado el nivel ${lvl.name}`,
        createdAt: new Date().toISOString(), read: false,
      }).catch(err => console.warn('createNotificationDeduped (level up, coach) failed:', err));
    }
  }, [roadmap, ladderStatus, profile.email]);

  const activePhase = useMemo(() => currentPhase(roadmap?.planPhases), [roadmap]);
  const phaseProgress = useMemo(() => {
    if (loading || !activePhase) return null;
    const phaseData: PhaseData = {
      bodyweightLogs, stepLogs, workoutLogs,
      exercises, initialWeight: profile.initialWeight,
      today: new Date().toISOString().split('T')[0],
      completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
    };
    return computePhaseProgress(activePhase, phaseData);
  }, [loading, bodyweightLogs, stepLogs, workoutLogs, exercises, dietCompletionLogs, diets, activePhase, profile.initialWeight]);

  const phaseWeightStatus = useMemo(() => {
    if (!projection || !nutritionProgram || !activePhase?.nutritionPhaseId) return null;
    return computePhaseWeightStatus(projection, nutritionProgram, activePhase.nutritionPhaseId);
  }, [projection, nutritionProgram, activePhase]);

  const achievements: Achievement[] = useMemo(() => {
    if (loading) return [];
    const list: Achievement[] = [];
    for (const ch of challengeHistory) {
      if (ch.status === 'conseguido' && ch.resolvedAt) {
        list.push({ id: `ch-${ch.id}`, icon: 'emoji_events', color: '#fbcb1a', title: ch.title, date: ch.resolvedAt.split('T')[0] });
      }
    }
    const achievedIds: Record<string, string> = roadmap?.levelLadder?.achievedLevelIds ?? {};
    const levels = (roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER).levels;
    for (const [levelId, date] of Object.entries(achievedIds)) {
      const lvl = levels.find(l => l.id === levelId);
      if (lvl) list.push({ id: `lvl-${levelId}`, icon: 'military_tech', color: '#00eefc', title: `Nivel ${lvl.name}`, date });
    }
    for (const phase of roadmap?.planPhases ?? []) {
      if (phase.status === 'completada' && phase.completedAt) {
        list.push({ id: `ph-${phase.id}`, icon: 'route', color: phase.color, title: `Fase completada: ${phase.name}`, date: phase.completedAt });
      }
    }
    for (const item of roadmap?.items ?? []) {
      if (item.status === 'logrado' && item.targetDate) {
        list.push({ id: `it-${item.id}`, icon: 'star', color: '#a78bfa', title: item.title, date: item.targetDate });
      }
    }
    return list;
  }, [loading, challengeHistory, roadmap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-3xl text-[#fbcb1a] animate-spin">refresh</span>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="text-center py-24">
        <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">map</span>
        <p className="font-sans font-bold text-white text-sm mb-1">Road map</p>
        <p className="text-[#c6c9ab] text-xs font-mono">No hay planificación disponible todavía.</p>
        <p className="text-[#555] text-xs font-mono mt-1">Tu entrenador aún no ha creado tu hoja de ruta — estará disponible aquí en cuanto la configure.</p>
      </div>
    );
  }

  const phases = roadmap.planPhases ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-black text-2xl text-white uppercase tracking-tight">Road map</h1>
        <p className="text-[#c6c9ab] text-xs font-mono mt-1">Tu progreso y lo que te queda por delante</p>
      </div>

      {activePhase && phaseProgress && (
        <PhaseHeroCard phase={activePhase} progress={phaseProgress} weightStatus={phaseWeightStatus} />
      )}

      {challengeResult && (challengeResult.pending
        ? <ChallengePendingCard />
        : <WeeklyChallengeCard challenge={challengeResult.challenge!} progress={challengeResult.progress!} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {phases.length > 0 && <PhasePathStepper phases={phases} />}
        {ladderStatus && <LevelLadderCard status={ladderStatus} />}
      </div>

      <RecentAchievements achievements={achievements} />

      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab] mb-3 px-1">Planificación completa</p>
        <RoadmapTimeline
          mesocycles={mesocycles}
          nutritionProgram={nutritionProgram}
          roadmap={roadmap}
          readonly={true}
          bodyweightLogs={bodyweightLogs}
          initialWeight={profile.actualWeight ?? profile.initialWeight}
        />
      </div>
    </div>
  );
}

export { PHASE_COLORS };
