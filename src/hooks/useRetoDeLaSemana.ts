import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getNutritionProgram, getRoadmap, getBodyweightForAthlete, getStepsForAthlete,
  getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete, getDietsForAthlete,
  getOnboarding, getAthleteNutritionConfig, getWorkoutAssignmentsForAthlete,
  getWeeklyChallengesForAthlete, getCardioSessionsSince,
} from '../dbService';
import { bodyweightForAthleteKey } from './useAthleteWeight';
import { ensureWeeklyChallenge, EnsureChallengeResult } from '../utils/ensureWeeklyChallenge';
import { ChallengeData, isoWeekKey } from '../utils/weeklyChallenge';
import { buildChallengeMemory } from '../utils/challengeMemory';
import { buildPhaseEnergyPlans, buildWeightProjection, ProjectionResult } from '../utils/nutritionPeriodization';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';

const DEFAULT_STEP_GOAL = 8000;

/**
 * El reto de la semana, listo para pintar.
 *
 * Vive en un hook porque desde 09-2026 lo enseñan DOS pantallas: el Road map,
 * que ya lo tenía, e Inicio, donde el reto pasó a ser lo primero que se ve.
 * Duplicar el efecto habría duplicado también sus catorce consultas.
 *
 * No las duplica de verdad: todas usan las MISMAS claves de React Query que el
 * Road map, así que la segunda pantalla que monte el hook no lee nada — se
 * sirve de la caché. Si algún día alguien cambia una clave aquí, se pagan las
 * lecturas dos veces sin que nada falle a la vista, que es la forma más cara
 * de romper esto.
 *
 * `ensureWeeklyChallenge` es «generate-on-read»: garantiza que la semana en
 * curso tiene reto (lo genera si el coach no asignó ninguno), refresca el
 * progreso con los datos ya registrados y cierra el de la semana anterior.
 * Se dispara UNA vez por atleta cuando todo ha cargado, no en cada refetch de
 * fondo — mismo patrón de guard con ref que ya usaba el Road map.
 */
export function useRetoDeLaSemana(athleteEmail: string, userId: string) {
  const [resultado, setResultado] = useState<EnsureChallengeResult | null>(null);

  const { data: nutritionProgram = null, isPending: cargandoPrograma } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
  });
  const { data: roadmap = null, isPending: cargandoRoadmap } = useQuery({
    queryKey: ['roadmap', athleteEmail],
    queryFn: () => getRoadmap(athleteEmail),
  });
  const { data: bodyweightLogs = [], isPending: cargandoPeso } = useQuery({
    queryKey: bodyweightForAthleteKey(athleteEmail),
    queryFn: () => getBodyweightForAthlete(athleteEmail),
  });
  const { data: stepLogs = [], isPending: cargandoPasos } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
  });
  const { data: workoutLogs = [], isPending: cargandoLogs } = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail),
  });
  const { data: exercises = [], isPending: cargandoEjercicios } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
  });
  const { data: dietCompletionLogs = [], isPending: cargandoDieta } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
  });
  const { data: diets = [], isPending: cargandoDietas } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
  });
  const { data: onboarding = null, isPending: cargandoAlta } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail),
  });
  const { data: nutConfig = null, isPending: cargandoConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', athleteEmail],
    queryFn: () => getAthleteNutritionConfig(athleteEmail),
  });
  const { data: assignments = [], isPending: cargandoAsignaciones } = useQuery({
    queryKey: ['workoutAssignmentsForAthlete', userId],
    queryFn: () => getWorkoutAssignmentsForAthlete({ uid: userId, email: athleteEmail }),
  });
  const { data: historial = [], isPending: cargandoHistorial } = useQuery({
    queryKey: ['weeklyChallengesForAthlete', athleteEmail],
    queryFn: () => getWeeklyChallengesForAthlete(athleteEmail),
  });
  // Misma ventana que el Road map — el año en curso. El motor solo mira cuatro
  // semanas atrás, pero la clave tiene que coincidir para compartir caché.
  const cardioSince = useMemo(() => `${new Date().getFullYear()}-01-01`, []);
  const { data: cardioSessions = [], isPending: cargandoCardio } = useQuery({
    queryKey: ['cardioSessionsSince', athleteEmail, cardioSince],
    queryFn: () => getCardioSessionsSince(athleteEmail, cardioSince),
  });

  const cargando = cargandoPrograma || cargandoRoadmap || cargandoPeso || cargandoPasos
    || cargandoLogs || cargandoEjercicios || cargandoDieta || cargandoDietas || cargandoAlta
    || cargandoConfig || cargandoAsignaciones || cargandoHistorial || cargandoCardio;

  const stepGoal = nutConfig?.stepGoal ?? DEFAULT_STEP_GOAL;
  const kcalPerStep = nutConfig?.kcalPerStep ?? DEFAULT_KCAL_PER_STEP;

  const projection = useMemo<ProjectionResult | null>(() => {
    if (cargando || !nutritionProgram) return null;
    const today = new Date().toISOString().split('T')[0];
    return buildWeightProjection({
      program: nutritionProgram,
      plans: buildPhaseEnergyPlans(nutritionProgram, diets),
      diets, onboarding, bodyweightLogs, completionLogs: dietCompletionLogs,
      stepLogs, stepGoal, kcalPerStep, today,
    });
  }, [cargando, nutritionProgram, diets, onboarding, bodyweightLogs, dietCompletionLogs, stepLogs, stepGoal, kcalPerStep]);

  const arrancadoPara = useRef<string | null>(null);
  useEffect(() => {
    if (cargando || arrancadoPara.current === athleteEmail) return;
    arrancadoPara.current = athleteEmail;
    const today = new Date().toISOString().split('T')[0];
    // El generador razona sobre las últimas 4-5 semanas; la consulta de cardio
    // trae el año entero para el calendario, así que la ventana se recorta aquí
    // para no cambiarle la base de cálculo. El corte va en UTC a propósito: es
    // lo que hacía la consulta anterior, y en 35 días un día no significa nada.
    const desde = new Date();
    desde.setDate(desde.getDate() - 35);
    const cardioRecientes = cardioSessions.filter(s => s.date >= desde.toISOString().split('T')[0]);
    const datos: ChallengeData = {
      stepLogs, bodyweightLogs, workoutLogs, exercises,
      completionLogs: dietCompletionLogs, coachDiets: diets.filter(d => !d.selfManaged),
      assignments, projection, liftExerciseIds: roadmap?.challengeConfig?.liftExerciseIds,
      cardioSessions: cardioRecientes,
      // Ya está cargado para los logros del Road map, así que la memoria del
      // motor (rotación de 4 semanas + dificultad adaptativa) sale gratis.
      history: historial,
    };
    ensureWeeklyChallenge(athleteEmail, datos, today)
      .then(setResultado)
      .catch(err => console.warn('useRetoDeLaSemana:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, athleteEmail]);

  /** Retos ganados seguidos ANTES del de esta semana, del historial ya cargado. */
  const racha = useMemo(() => {
    const clave = resultado?.challenge?.isoWeek ?? isoWeekKey(new Date().toISOString().split('T')[0]);
    return buildChallengeMemory(historial, clave).winStreak;
  }, [historial, resultado]);

  return { resultado, racha, cargando, historial, roadmap, projection, bodyweightLogs };
}
