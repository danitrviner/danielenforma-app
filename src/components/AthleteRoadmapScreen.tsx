import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile } from '../types';
import {
  getNutritionProgram, getRoadmap, getBodyweightForAthlete,
  getStepsForAthlete, getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete,
  getDietsForAthlete, getAthleteNutritionConfig, getWorkoutAssignmentsForAthlete,
  getWeeklyChallengesForAthlete, saveRoadmapLevelProgress, createNotificationDeduped,
  updateUserProfile, getMesocycles, getResponsesForAthlete,
} from '../dbService';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import WeeklyChallengeCard, { ChallengePendingCard } from './roadmap/WeeklyChallengeCard';
import RoadmapDelAtletaVista from './roadmap/RoadmapDelAtletaVista';
import { useRetoDeLaSemana } from '../hooks/useRetoDeLaSemana';
import { computeLadderStatus } from '../utils/levelLadder';
import { DEFAULT_LEVEL_LADDER } from '../data/defaultLevelLadder';
import { semanasDelPlan, evaluarPlan, calcularGastoReal } from '../utils/seguimientoPlan';
import { construirRoadmap, type HitoAutomatico } from '../utils/roadmapDelAtleta';
import { markRoadmapVisited } from './PlanInPreparationCard';
import { Icon, PageHeader } from './ui';
import TarjetaIdentidadAtleta from './TarjetaIdentidadAtleta';
import { COACH_EMAIL } from '../utils/coach';
import { ventanaPasos } from '../utils/ventanaHistorial';
import { hoyIsoLocal } from '../utils/trainingWeek';

/* ═══════════════════════════════════════════════════════════════════════════
   Road map del atleta (reescrito 29-10-2026)

   Decisión de Dani (28-10): el Road map SALE de los objetivos del plan —las
   fases del programa de nutrición con su objetivo y su peso meta— y del
   bloque de entreno. No se monta aparte. Las fases manuales
   (`roadmap.planPhases`, «Usar plan estándar») y la escalera de niveles
   desaparecen de esta pantalla; los hitos salen solos (cambio de fase, peso
   objetivo, fin de bloque, constancia) y los 16 `roadmap.items` viejos ya
   no se pintan.

   Fuente de verdad: `semanasDelPlan` / `evaluarPlan`, lo mismo que ve Dani
   en Plan › Objetivo › Seguimiento. Aquí no se calcula nada que él no vea.

   La escalera sigue calculándose y guardándose en silencio: la Academia
   usa `UserProfile.level` para desbloquear cursos.
   ═══════════════════════════════════════════════════════════════════════════ */

const PHASE_COLORS = ['var(--color-accent)', 'var(--color-data)', 'var(--color-warning)', 'var(--color-chart-3)'];
const DEFAULT_STEP_GOAL = 8000;

interface Props {
  profile: UserProfile;
}

export default function AthleteRoadmapScreen({ profile }: Props) {
  useEffect(() => { markRoadmapVisited(profile.email); }, [profile.email]);
  const hoy = hoyIsoLocal();

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
  const desdePasos = ventanaPasos();
  const { data: stepLogs = [], isPending: loadingSteps } = useQuery({
    queryKey: ['stepsForAthlete', profile.email, desdePasos],
    queryFn: () => getStepsForAthlete(profile.email, desdePasos),
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
  // Mismas claves que Inicio y Perfil › Revisión: no añaden lecturas si ya se abrieron.
  const { data: mesocycles = [], isPending: loadingMesocycles } = useQuery({
    queryKey: ['mesocycles', profile.email],
    queryFn: () => getMesocycles(profile.email),
  });
  const { data: respuestas = [], isPending: loadingRespuestas } = useQuery({
    queryKey: ['responsesForAthlete', profile.email],
    queryFn: () => getResponsesForAthlete(profile.email),
  });

  const loading = loadingNutritionProgram || loadingRoadmap || loadingBodyweight
    || loadingSteps || loadingWorkoutLogs || loadingExercises || loadingDietCompletionLogs
    || loadingDiets || loadingNutConfig || loadingAssignments || loadingChallengeHistory
    || loadingMesocycles || loadingRespuestas;

  const stepGoal = nutConfig?.stepGoal ?? DEFAULT_STEP_GOAL;

  const { resultado: challengeResult, racha: challengeStreak } =
    useRetoDeLaSemana(profile.email, assignments, loadingAssignments);

  // La escalera, en silencio (ver cabecera).
  const ladderStatus = useMemo(() => {
    if (loading) return null;
    const ladder = roadmap?.levelLadder ?? DEFAULT_LEVEL_LADDER;
    return computeLadderStatus(ladder, { bodyweightLogs, stepLogs, workoutLogs, exercises, initialWeight: profile.initialWeight, today: hoy });
  }, [loading, roadmap, bodyweightLogs, stepLogs, workoutLogs, exercises, profile.initialWeight, hoy]);

  useEffect(() => {
    if (!roadmap || !ladderStatus || ladderStatus.newlyAchieved.length === 0) return;
    const achievedLevelIds = { ...(roadmap.levelLadder?.achievedLevelIds ?? {}) };
    for (const lvl of ladderStatus.newlyAchieved) achievedLevelIds[lvl.id] = hoy;
    const baseLadder = roadmap.levelLadder ?? DEFAULT_LEVEL_LADDER;
    saveRoadmapLevelProgress(profile.email, { ...baseLadder, achievedLevelIds }).catch(err =>
      console.warn('saveRoadmapLevelProgress (level up) failed:', err),
    );
    const peldaños = Object.keys(achievedLevelIds).length;
    if (peldaños !== profile.level) {
      updateUserProfile(profile.userId, { level: peldaños }).catch(err =>
        console.warn('updateUserProfile (nivel de la escalera) failed:', err),
      );
    }
    for (const lvl of ladderStatus.newlyAchieved) {
      createNotificationDeduped(`notif_lvl_${profile.email}_${lvl.id}`, {
        recipientEmail: profile.email, type: 'level_up', title: 'Nuevo nivel 🏅', body: `Has alcanzado el nivel ${lvl.name}. ¡Enorme!`,
        link: 'roadmap', createdAt: new Date().toISOString(), read: false,
      }).catch(err => console.warn('createNotificationDeduped (level up, athlete) failed:', err));
      createNotificationDeduped(`notif_lvl_${profile.email}_${lvl.id}_coach`, {
        recipientEmail: COACH_EMAIL, type: 'level_up', title: 'Nuevo nivel',
        body: `${profile.email} ha alcanzado el nivel ${lvl.name}`,
        createdAt: new Date().toISOString(), read: false,
      }).catch(err => console.warn('createNotificationDeduped (level up, coach) failed:', err));
    }
  }, [roadmap, ladderStatus, profile.email, profile.userId, profile.level, hoy]);

  // El plan, semana a semana: la misma cuenta que Plan › Objetivo.
  const roadmapDelAtleta = useMemo(() => {
    if (loading) return null;
    const coachDiets = diets.filter(d => !d.selfManaged);
    const semanas = nutritionProgram
      ? semanasDelPlan({ program: nutritionProgram, diets: coachDiets, pesos: bodyweightLogs, registros: dietCompletionLogs, pasos: stepLogs, pasosBase: stepGoal, hoy })
      : [];
    const gasto = calcularGastoReal({ pesos: bodyweightLogs, registros: dietCompletionLogs, diets: coachDiets, hasta: hoy });
    const evaluacion = nutritionProgram ? evaluarPlan(nutritionProgram, semanas, gasto) : null;
    return construirRoadmap({ program: nutritionProgram, semanas, evaluacion, mesociclos: mesocycles, assignments, workoutLogs, respuestas, stepLogs, stepGoal, hoy });
  }, [loading, nutritionProgram, diets, bodyweightLogs, dietCompletionLogs, stepLogs, stepGoal, hoy, mesocycles, assignments, workoutLogs, respuestas]);

  // Retos conseguidos: los logros que no salen del plan.
  const logrosExtra: HitoAutomatico[] = useMemo(() =>
    challengeHistory
      .filter(ch => ch.status === 'conseguido' && ch.resolvedAt)
      .map(ch => ({ id: `ch-${ch.id}`, titulo: ch.title, fecha: ch.resolvedAt!.split('T')[0], icon: 'emoji_events', tipo: 'constancia' as const })),
    [challengeHistory]);

  if (loading || !roadmapDelAtleta) {
    return (
      <div className="flex items-center justify-center py-10">
        <Icon name="refresh" size="xl" className="text-accent-ink animate-spin" />
      </div>
    );
  }

  const reto = challengeResult && (challengeResult.pending
    ? <ChallengePendingCard />
    : <WeeklyChallengeCard challenge={challengeResult.challenge!} progress={challengeResult.progress!} streak={challengeStreak} />);

  return (
    <div className="pantalla space-y-6">
      <PageHeader title="Road map" subtitle="Dónde estás, qué viene y qué toca esta semana" />
      <RoadmapDelAtletaVista roadmap={roadmapDelAtleta} reto={reto} logrosExtra={logrosExtra} />
      <TarjetaIdentidadAtleta profile={profile} />
    </div>
  );
}

export { PHASE_COLORS };
