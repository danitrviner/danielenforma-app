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
  getTasksForAthlete, getWorkouts, getCardioSessionsSince, getProgressPhotos,
  getCoachDayNotesForAthlete,
} from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import CalendarioAtleta from './roadmap/calendario/atleta/CalendarioAtleta';
import PhaseHeroCard from './roadmap/PhaseHeroCard';
import WeeklyChallengeCard, { ChallengePendingCard } from './roadmap/WeeklyChallengeCard';
import PhasePathStepper from './roadmap/PhasePathStepper';
import LevelLadderCard from './roadmap/LevelLadderCard';
import RecentAchievements, { Achievement } from './roadmap/RecentAchievements';
import { ensureWeeklyChallenge, EnsureChallengeResult } from '../utils/ensureWeeklyChallenge';
import { ChallengeData, isoWeekKey } from '../utils/weeklyChallenge';
import { buildChallengeMemory } from '../utils/challengeMemory';
import { computeLadderStatus } from '../utils/levelLadder';
import { computePhaseProgress, currentPhase, PhaseData } from '../utils/planPhase';
import { DEFAULT_LEVEL_LADDER } from '../data/defaultLevelLadder';
import { buildPhaseEnergyPlans, buildWeightProjection, ProjectionResult } from '../utils/nutritionPeriodization';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { computePhaseWeightStatus } from '../utils/planNutritionBridge';
import { markRoadmapVisited } from './PlanInPreparationCard';
import { Icon, PageHeader, EmptyState } from './ui';
import TarjetaIdentidadAtleta from './TarjetaIdentidadAtleta';

const PHASE_COLORS = ['var(--color-accent)', 'var(--color-data)', 'var(--color-warning)', 'var(--color-chart-3)'];
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
    queryFn: () => getWorkoutAssignmentsForAthlete({ uid: profile.userId, email: profile.email }),
  });
  const { data: challengeHistory = [], isPending: loadingChallengeHistory } = useQuery({
    queryKey: ['weeklyChallengesForAthlete', profile.email],
    queryFn: () => getWeeklyChallengesForAthlete(profile.email),
  });
  // Pantalla 6 (Bloque H) — el atleta ve su propio cuadro de mando, en modo
  // solo lectura: mismos derivadores que el coach, sin ningún handler de
  // edición (RoadmapTimeline los oculta solo cuando faltan los `on*`).
  const { data: tasks = [], isPending: loadingTasks } = useQuery({
    queryKey: ['tasksForAthlete', profile.email],
    queryFn: () => getTasksForAthlete(profile.email),
  });
  const { data: workouts = [], isPending: loadingWorkouts } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });
  // El año natural en curso: es exactamente el rango que puede pintar el
  // calendario (sus tres niveles cuelgan de `new Date().getFullYear()`), y de
  // paso da de sobra para el motor de retos, que solo mira 4 semanas atrás.
  // Una consulta con ventana en vez de dos —ni el histórico entero de la
  // banda, que son cientos de lecturas por cada visita al Road map.
  const cardioSince = useMemo(() => `${new Date().getFullYear()}-01-01`, []);
  const { data: cardioSessions = [], isPending: loadingCardio } = useQuery({
    queryKey: ['cardioSessionsSince', profile.email, cardioSince],
    queryFn: () => getCardioSessionsSince(profile.email, cardioSince),
  });
  // Solo para el calendario: la foto y la nota del entrenador de cada día.
  const { data: progressPhotos = [], isPending: loadingPhotos } = useQuery({
    queryKey: ['progressPhotos', profile.email],
    queryFn: () => getProgressPhotos(profile.email),
  });
  const { data: coachDayNotes = [], isPending: loadingDayNotes } = useQuery({
    queryKey: ['coachDayNotes', profile.email],
    queryFn: () => getCoachDayNotesForAthlete(profile.email),
  });

  const loading = loadingMesocycles || loadingNutritionProgram || loadingRoadmap || loadingBodyweight
    || loadingSteps || loadingWorkoutLogs || loadingExercises || loadingDietCompletionLogs
    || loadingDiets || loadingOnboarding || loadingNutConfig || loadingAssignments || loadingChallengeHistory
    || loadingTasks || loadingWorkouts || loadingCardio || loadingPhotos || loadingDayNotes;

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
    // El generador de retos razona sobre las últimas 4-5 semanas; ahora que la
    // consulta trae el año entero para el calendario, la ventana se recorta
    // aquí para no cambiarle la base de cálculo. El corte se calcula en UTC
    // (`toISOString`) a propósito, no con `hoyIsoLocal()`: es exactamente lo
    // que hacía la consulta anterior, y en una ventana de 35 días un día de
    // margen no significa nada frente a mover el suelo del motor de retos.
    const desde = new Date();
    desde.setDate(desde.getDate() - 35);
    const cardioRecientes = cardioSessions.filter(s => s.date >= desde.toISOString().split('T')[0]);
    const challengeData: ChallengeData = {
      stepLogs, bodyweightLogs, workoutLogs, exercises,
      completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
      assignments, projection, liftExerciseIds: roadmap?.challengeConfig?.liftExerciseIds,
      cardioSessions: cardioRecientes,
      // Ya está cargado para la lista de logros, así que la memoria del motor
      // (rotación de 4 semanas + dificultad adaptativa) sale gratis en lecturas.
      history: challengeHistory,
    };
    ensureWeeklyChallenge(profile.email, challengeData, today)
      .then(result => setChallengeResult(result))
      .catch(err => console.warn('AthleteRoadmapScreen load error:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile.email]);

  // Racha de retos ganados ANTES del de esta semana — se calcula del historial
  // ya cargado, sin lecturas extra.
  const challengeStreak = useMemo(() => {
    const key = challengeResult?.challenge?.isoWeek ?? isoWeekKey(new Date().toISOString().split('T')[0]);
    return buildChallengeMemory(challengeHistory, key).winStreak;
  }, [challengeHistory, challengeResult]);

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
        list.push({ id: `ch-${ch.id}`, icon: 'emoji_events', color: 'var(--color-accent)', title: ch.title, date: ch.resolvedAt.split('T')[0] });
      }
    }
    const achievedIds: Record<string, string> = roadmap?.levelLadder?.achievedLevelIds ?? {};
    const levels = (roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER).levels;
    for (const [levelId, date] of Object.entries(achievedIds)) {
      const lvl = levels.find(l => l.id === levelId);
      if (lvl) list.push({ id: `lvl-${levelId}`, icon: 'military_tech', color: 'var(--color-data)', title: `Nivel ${lvl.name}`, date });
    }
    for (const phase of roadmap?.planPhases ?? []) {
      if (phase.status === 'completada' && phase.completedAt) {
        list.push({ id: `ph-${phase.id}`, icon: 'route', color: phase.color, title: `Fase completada: ${phase.name}`, date: phase.completedAt });
      }
    }
    for (const item of roadmap?.items ?? []) {
      if (item.status === 'logrado' && item.targetDate) {
        list.push({ id: `it-${item.id}`, icon: 'star', color: 'var(--color-chart-3)', title: item.title, date: item.targetDate });
      }
    }
    return list;
  }, [loading, challengeHistory, roadmap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Icon name="refresh" size="xl" className="text-accent animate-spin" />
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="space-y-6">
        <PageHeader title="Road map" subtitle="Tu progreso y lo que te queda por delante" />
        <EmptyState
          icon="map"
          title="No hay planificación disponible todavía."
          description="Tu entrenador aún no ha creado tu hoja de ruta — estará disponible aquí en cuanto la configure."
        />
      </div>
    );
  }

  const phases = roadmap.planPhases ?? [];

  return (
    <div className="space-y-6">
      {activePhase && phaseProgress && (
        <PhaseHeroCard phase={activePhase} progress={phaseProgress} weightStatus={phaseWeightStatus} />
      )}

      {challengeResult && (challengeResult.pending
        ? <ChallengePendingCard />
        : <WeeklyChallengeCard
            challenge={challengeResult.challenge!}
            progress={challengeResult.progress!}
            streak={challengeStreak}
          />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {phases.length > 0 && <PhasePathStepper phases={phases} />}
        {ladderStatus && <LevelLadderCard status={ladderStatus} />}
      </div>

      <RecentAchievements achievements={achievements} />

      <div>
        <p className="font-mono text-caption uppercase tracking-widest text-ink-2 mb-3 px-1">Tu planificación completa</p>
        <CalendarioAtleta
          mesocycles={mesocycles}
          nutritionProgram={nutritionProgram}
          roadmap={roadmap}
          workoutAssignments={assignments}
          workoutLogs={workoutLogs}
          workouts={workouts}
          exercises={exercises}
          diets={diets}
          dietCompletionLogs={dietCompletionLogs}
          cardioSessions={cardioSessions}
          bodyweightLogs={bodyweightLogs}
          tasks={tasks}
          progressPhotos={progressPhotos}
          coachDayNotes={coachDayNotes}
        />
      </div>

      {/* Quién eres, al final: nombre, nivel, XP y meta. Estaba encima de las
          pestañas del Perfil ocupando la primera pantalla entera antes de
          poder llegar a nada, y aquí cierra el relato de por dónde vas, detrás
          del calendario y de los logros (Dani, 10-09-2026). */}
      <TarjetaIdentidadAtleta profile={profile} />
    </div>
  );
}

export { PHASE_COLORS };
