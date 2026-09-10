import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { WeeklyChallenge, WorkoutAssignment } from '../types';
import {
  getNutritionProgram, getRoadmap, getBodyweightForAthlete, getStepsForAthlete,
  getWorkoutLogs, getExercises, getDietCompletionLogsForAthlete, getDietsForAthlete,
  getOnboarding, getAthleteNutritionConfig,
  getWeeklyChallengesForAthlete, getCardioSessionsSince, getWeeklyChallenge,
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
 * Las ASIGNACIONES las pasa quien llama, en vez de pedirlas aquí: la app
 * tiene dos claves distintas para el mismo dato (`workoutAssignments` en
 * Inicio y App, `workoutAssignmentsForAthlete` en Road map y Entrenamiento).
 * Elegir una habría obligado a la otra pantalla a leerlas dos veces, y unificar
 * las dos claves toca seis ficheros que no van en esta tanda.
 *
 * `ensureWeeklyChallenge` es «generate-on-read»: garantiza que la semana en
 * curso tiene reto (lo genera si el coach no asignó ninguno), refresca el
 * progreso con los datos ya registrados y cierra el de la semana anterior.
 * Se dispara UNA vez por atleta cuando todo ha cargado, no en cada refetch de
 * fondo — mismo patrón de guard con ref que ya usaba el Road map.
 */
export function useRetoDeLaSemana(athleteEmail: string, assignments: WorkoutAssignment[]) {
  const qc = useQueryClient();
  const [resultado, setResultado] = useState<EnsureChallengeResult | null>(null);
  const hoy = useMemo(() => new Date().toISOString().split('T')[0], []);
  const semana = useMemo(() => isoWeekKey(hoy), [hoy]);

  /* El reto guardado de esta semana: UN documento. Es lo que decide si hay que
     encender el motor o no. Sin esto, Inicio pagaba el historial completo de
     pasos, pesajes, entrenos y comidas en cada apertura de la app — y solo
     `stepLogs` son ~728 documentos a los dos años. */
  const { data: guardado = null, isPending: cargandoGuardado } = useQuery({
    queryKey: ['weeklyChallenge', athleteEmail, semana],
    queryFn: () => getWeeklyChallenge(athleteEmail, semana),
  });

  /* Si ya se evaluó HOY, se pinta el snapshot y no se carga nada más. El
     progreso puede quedarse corto dentro del mismo día (si el atleta entrena
     y vuelve a Inicio sin pasar por el Road map), pero antes de esto solo se
     refrescaba al visitar el Road map: es estrictamente mejor que lo de antes.
     Un reto ya conseguido tampoco necesita motor: no va a desconseguirse. */
  const alDia = !!guardado
    && (guardado.evaluadoEn === hoy || guardado.status === 'conseguido');
  const hazFalta = !cargandoGuardado && !alDia;

  const { data: nutritionProgram = null, isPending: cargandoPrograma } = useQuery({
    queryKey: ['nutritionProgram', athleteEmail],
    queryFn: () => getNutritionProgram(athleteEmail),
    enabled: hazFalta,
  });
  const { data: roadmap = null, isPending: cargandoRoadmap } = useQuery({
    queryKey: ['roadmap', athleteEmail],
    queryFn: () => getRoadmap(athleteEmail),
    enabled: hazFalta,
  });
  const { data: bodyweightLogs = [], isPending: cargandoPeso } = useQuery({
    queryKey: bodyweightForAthleteKey(athleteEmail),
    queryFn: () => getBodyweightForAthlete(athleteEmail),
    enabled: hazFalta,
  });
  const { data: stepLogs = [], isPending: cargandoPasos } = useQuery({
    queryKey: ['stepsForAthlete', athleteEmail],
    queryFn: () => getStepsForAthlete(athleteEmail),
    enabled: hazFalta,
  });
  const { data: workoutLogs = [], isPending: cargandoLogs } = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail),
    enabled: hazFalta,
  });
  const { data: exercises = [], isPending: cargandoEjercicios } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
    enabled: hazFalta,
  });
  const { data: dietCompletionLogs = [], isPending: cargandoDieta } = useQuery({
    queryKey: ['dietCompletionLogsForAthlete', athleteEmail],
    queryFn: () => getDietCompletionLogsForAthlete(athleteEmail),
    enabled: hazFalta,
  });
  const { data: diets = [], isPending: cargandoDietas } = useQuery({
    queryKey: ['dietsForAthlete', athleteEmail],
    queryFn: () => getDietsForAthlete(athleteEmail),
    enabled: hazFalta,
  });
  const { data: onboarding = null, isPending: cargandoAlta } = useQuery({
    queryKey: ['onboarding', athleteEmail],
    queryFn: () => getOnboarding(athleteEmail).catch(() => null),
    enabled: hazFalta,
  });
  const { data: nutConfig = null, isPending: cargandoConfig } = useQuery({
    queryKey: ['athleteNutritionConfig', athleteEmail],
    queryFn: () => getAthleteNutritionConfig(athleteEmail).catch(() => null),
    enabled: hazFalta,
  });
  const { data: historial = [], isPending: cargandoHistorial } = useQuery({
    queryKey: ['weeklyChallengesForAthlete', athleteEmail],
    queryFn: () => getWeeklyChallengesForAthlete(athleteEmail),
    enabled: hazFalta,
  });
  // Misma ventana que el Road map — el año en curso. El motor solo mira cuatro
  // semanas atrás, pero la clave tiene que coincidir para compartir caché.
  const cardioSince = useMemo(() => `${new Date().getFullYear()}-01-01`, []);
  const { data: cardioSessions = [], isPending: cargandoCardio } = useQuery({
    queryKey: ['cardioSessionsSince', athleteEmail, cardioSince],
    queryFn: () => getCardioSessionsSince(athleteEmail, cardioSince),
    enabled: hazFalta,
  });

  const cargando = cargandoPrograma || cargandoRoadmap || cargandoPeso || cargandoPasos
    || cargandoLogs || cargandoEjercicios || cargandoDieta || cargandoDietas || cargandoAlta
    || cargandoConfig || cargandoHistorial || cargandoCardio;

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
      .then(res => {
        setResultado(res);
        // Se ceba la caché del documento con lo que acaba de guardarse. Sin
        // esto, volver a montar el hook —navegar al Road map y atrás— leía el
        // reto de antes, veía `evaluadoEn` viejo y encendía el motor entero
        // otra vez en cada ida y vuelta.
        if (res.challenge) qc.setQueryData(['weeklyChallenge', athleteEmail, semana], res.challenge);
      })
      .catch(err => console.warn('useRetoDeLaSemana:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, athleteEmail]);

  /* Con el motor apagado, el reto se pinta del snapshot guardado. `pct` se
     recalcula del progreso y el objetivo en vez de guardarse: es aritmética,
     y un porcentaje guardado es un segundo sitio del que se puede quedar
     viejo. `achieved` sale del estado, que es la verdad. */
  const delSnapshot = useMemo<EnsureChallengeResult | null>(() => {
    if (!guardado) return null;
    const objetivo = guardado.metric.target || 1;
    const valor = guardado.progressValue ?? 0;
    return {
      challenge: guardado,
      progress: {
        progressValue: valor,
        pct: Math.max(0, Math.min(100, (valor / objetivo) * 100)),
        achieved: guardado.status === 'conseguido',
      },
      pending: false,
    };
  }, [guardado]);

  /** Retos ganados seguidos ANTES del de esta semana, del historial ya cargado. */
  const racha = useMemo(() => {
    // Sin historial cargado (motor apagado) no hay racha que calcular. Se
    // devuelve 0, que la tarjeta traduce en «no pintar nada»: mejor callarse
    // que enseñar una racha inventada.
    if (historial.length === 0) return 0;
    return buildChallengeMemory(historial, semana).winStreak;
  }, [historial, semana]);

  return {
    // El del motor manda en cuanto llega; hasta entonces (y todo el resto del
    // día, si ya se evaluó) vale el snapshot.
    resultado: resultado ?? (alDia ? delSnapshot : null),
    racha,
    cargando: cargandoGuardado || (hazFalta && cargando),
    historial, roadmap, projection,
  };
}

/**
 * Marca el reto de esta semana para que se vuelva a evaluar.
 *
 * Lo llama quien acaba de escribir algo que puede haberlo movido — de momento,
 * terminar un entreno. Suelta el sello `evaluadoEn` EN LA CACHÉ (no en
 * Firestore: el motor lo reescribe al reevaluar), que es lo que hace que el
 * siguiente montaje del hook encienda el motor en vez de pintar el snapshot.
 *
 * Invalidar la consulta a secas no vale: releería el mismo documento, con el
 * mismo sello de hoy, y seguiría saltándose el motor.
 */
export function marcarRetoParaReevaluar(qc: QueryClient, athleteEmail: string): void {
  const semana = isoWeekKey(new Date().toISOString().split('T')[0]);
  qc.setQueryData<WeeklyChallenge | null>(
    ['weeklyChallenge', athleteEmail, semana],
    prev => (prev ? { ...prev, evaluadoEn: undefined } : prev),
  );
}
