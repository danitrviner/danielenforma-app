import React, { useState, useEffect, useMemo } from 'react';
import {
  UserProfile, Mesocycle, NutritionProgram, Roadmap, BodyweightLog, StepLog, WorkoutLog,
  Exercise, DietCompletionLog, Diet, OnboardingData, WorkoutAssignment, PlanPhase,
} from '../types';
import {
  getMesocycles, getNutritionProgram, getRoadmap, getBodyweightForAthlete,
  getStepsForAthlete, getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete,
  getDietsForAthlete, getOnboarding, getAthleteNutritionConfig, getWorkoutAssignmentsForAthlete,
  getWeeklyChallengesForAthlete, saveRoadmapLevelProgress, createNotificationDeduped,
} from '../dbService';
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

const PHASE_COLORS = ['#fbcb1a', '#00eefc', '#ff8c69', '#a78bfa'];
const DEFAULT_STEP_GOAL = 8000;
const COACH_EMAIL = 'danitrviner@gmail.com';

interface Props {
  profile: UserProfile;
}

interface LoadedData {
  mesocycles: Mesocycle[];
  nutritionProgram: NutritionProgram | null;
  roadmap: Roadmap | null;
  bodyweightLogs: BodyweightLog[];
  stepLogs: StepLog[];
  workoutLogs: WorkoutLog[];
  exercises: Exercise[];
  dietCompletionLogs: DietCompletionLog[];
  diets: Diet[];
  onboarding: OnboardingData | null;
  assignments: WorkoutAssignment[];
  stepGoal: number;
  kcalPerStep: number;
  challengeHistory: Awaited<ReturnType<typeof getWeeklyChallengesForAthlete>>;
  projection: ProjectionResult | null;
}

export default function AthleteRoadmapScreen({ profile }: Props) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [challengeResult, setChallengeResult] = useState<EnsureChallengeResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [
          mesos, nutri, rm, bwLogs, stepLogs, workoutLogs, exercises,
          dietCompletionLogs, diets, onboarding, nutConfig, assignments, challengeHistory,
        ] = await Promise.all([
          getMesocycles(profile.email),
          getNutritionProgram(profile.email),
          getRoadmap(profile.email),
          getBodyweightForAthlete(profile.email),
          getStepsForAthlete(profile.email),
          getWorkoutLogs(profile.email),
          getExercises(),
          getDietCompletionLogsForAthlete(profile.email),
          getDietsForAthlete(profile.email),
          getOnboarding(profile.email).catch(() => null),
          getAthleteNutritionConfig(profile.email).catch(() => null),
          getWorkoutAssignmentsForAthlete(profile.userId),
          getWeeklyChallengesForAthlete(profile.email),
        ]);
        if (cancelled) return;

        const stepGoal = nutConfig?.stepGoal ?? DEFAULT_STEP_GOAL;
        const kcalPerStep = nutConfig?.kcalPerStep ?? DEFAULT_KCAL_PER_STEP;
        const today = new Date().toISOString().split('T')[0];
        const projection = nutri
          ? buildWeightProjection({
              program: nutri,
              plans: buildPhaseEnergyPlans(nutri, diets),
              diets, onboarding, bodyweightLogs: bwLogs, completionLogs: dietCompletionLogs,
              stepLogs, stepGoal, kcalPerStep, today,
            })
          : null;

        const loaded: LoadedData = {
          mesocycles: mesos,
          nutritionProgram: nutri,
          roadmap: rm,
          bodyweightLogs: bwLogs,
          stepLogs,
          workoutLogs,
          exercises,
          dietCompletionLogs,
          diets,
          onboarding,
          assignments,
          stepGoal,
          kcalPerStep,
          challengeHistory,
          projection,
        };
        setData(loaded);

        const challengeData: ChallengeData = {
          stepLogs, bodyweightLogs: bwLogs, workoutLogs, exercises,
          completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
          assignments, projection, liftExerciseIds: rm?.challengeConfig?.liftExerciseIds,
        };
        const result = await ensureWeeklyChallenge(profile.email, challengeData, today);
        if (!cancelled) setChallengeResult(result);
      } catch (err) {
        console.warn('AthleteRoadmapScreen load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile.email, profile.userId]);

  const ladderStatus = useMemo(() => {
    if (!data) return null;
    const ladder = data.roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER;
    return computeLadderStatus(ladder, {
      bodyweightLogs: data.bodyweightLogs, stepLogs: data.stepLogs, workoutLogs: data.workoutLogs,
      exercises: data.exercises, initialWeight: profile.initialWeight,
      today: new Date().toISOString().split('T')[0],
    });
  }, [data, profile.initialWeight]);

  // Persiste nuevos niveles alcanzados con un merge parcial del campo
  // levelLadder: reescribir el roadmap completo desde el snapshot del atleta
  // podía revertir fases/items que el coach hubiera editado en paralelo.
  useEffect(() => {
    if (!data?.roadmap || !ladderStatus || ladderStatus.newlyAchieved.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    const achievedLevelIds = { ...(data.roadmap.levelLadder?.achievedLevelIds ?? {}) };
    for (const lvl of ladderStatus.newlyAchieved) achievedLevelIds[lvl.id] = today;
    const baseLadder = data.roadmap.levelLadder ?? DEFAULT_LEVEL_LADDER;
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
  }, [data, ladderStatus, profile.email]);

  const activePhase = useMemo(() => currentPhase(data?.roadmap?.planPhases), [data]);
  const phaseProgress = useMemo(() => {
    if (!data || !activePhase) return null;
    const phaseData: PhaseData = {
      bodyweightLogs: data.bodyweightLogs, stepLogs: data.stepLogs, workoutLogs: data.workoutLogs,
      exercises: data.exercises, initialWeight: profile.initialWeight,
      today: new Date().toISOString().split('T')[0],
      completionLogs: data.dietCompletionLogs, coachDiets: data.diets.filter(d => !d.selfManaged),
    };
    return computePhaseProgress(activePhase, phaseData);
  }, [data, activePhase, profile.initialWeight]);

  const phaseWeightStatus = useMemo(() => {
    if (!data?.projection || !data.nutritionProgram || !activePhase?.nutritionPhaseId) return null;
    return computePhaseWeightStatus(data.projection, data.nutritionProgram, activePhase.nutritionPhaseId);
  }, [data, activePhase]);

  const achievements: Achievement[] = useMemo(() => {
    if (!data) return [];
    const list: Achievement[] = [];
    for (const ch of data.challengeHistory) {
      if (ch.status === 'conseguido' && ch.resolvedAt) {
        list.push({ id: `ch-${ch.id}`, icon: 'emoji_events', color: '#fbcb1a', title: ch.title, date: ch.resolvedAt.split('T')[0] });
      }
    }
    const achievedIds: Record<string, string> = data.roadmap?.levelLadder?.achievedLevelIds ?? {};
    const levels = (data.roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER).levels;
    for (const [levelId, date] of Object.entries(achievedIds)) {
      const lvl = levels.find(l => l.id === levelId);
      if (lvl) list.push({ id: `lvl-${levelId}`, icon: 'military_tech', color: '#00eefc', title: `Nivel ${lvl.name}`, date });
    }
    for (const phase of data.roadmap?.planPhases ?? []) {
      if (phase.status === 'completada' && phase.completedAt) {
        list.push({ id: `ph-${phase.id}`, icon: 'route', color: phase.color, title: `Fase completada: ${phase.name}`, date: phase.completedAt });
      }
    }
    for (const item of data.roadmap?.items ?? []) {
      if (item.status === 'logrado' && item.targetDate) {
        list.push({ id: `it-${item.id}`, icon: 'star', color: '#a78bfa', title: item.title, date: item.targetDate });
      }
    }
    return list;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-3xl text-[#fbcb1a] animate-spin">refresh</span>
      </div>
    );
  }

  if (!data?.roadmap) {
    return (
      <div className="text-center py-24">
        <span className="material-symbols-outlined text-5xl text-[#2a2a2a] block mb-3">map</span>
        <p className="font-sans font-bold text-white text-sm mb-1">Road map</p>
        <p className="text-[#c6c9ab] text-xs font-mono">No hay planificación disponible todavía.</p>
        <p className="text-[#555] text-xs font-mono mt-1">Tu entrenador aún no ha creado tu hoja de ruta — estará disponible aquí en cuanto la configure.</p>
      </div>
    );
  }

  const phases = data.roadmap.planPhases ?? [];

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
          mesocycles={data.mesocycles}
          nutritionProgram={data.nutritionProgram}
          roadmap={data.roadmap}
          readonly={true}
          bodyweightLogs={data.bodyweightLogs}
          initialWeight={profile.actualWeight ?? profile.initialWeight}
        />
      </div>
    </div>
  );
}

export { PHASE_COLORS };
