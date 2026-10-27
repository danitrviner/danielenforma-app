import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getStepsForAthlete, getWorkoutLogs, getExercises, getWorkoutAssignmentsForAthlete,
} from '../dbService';
import { getBodyweightForAthlete } from '../dbService';
import { bodyweightForAthleteKey } from './useAthleteWeight';
import { calcularAutoRellenos, desdeDeLaSemana, zonasEntrenadas } from '../utils/cuestionarioAuto';
import { todayStr } from '../utils/questionnaireSchedule';

/**
 * Datos de la semana que el asistente de cuestionarios usa para no preguntar
 * lo que la app ya sabe: pasos, peso, sesiones hechas frente a programadas y
 * zonas entrenadas (para las agujetas). Mismas claves de caché que el resto de
 * pantallas, así que normalmente no lee nada nuevo. `habilitado: false` mientras
 * el asistente está cerrado.
 */
export function useDatosSemanaCuestionario(athlete: { email: string; userId: string }, habilitado: boolean) {
  const { email, userId } = athlete;
  const hoy = todayStr();
  const desde = desdeDeLaSemana(hoy);
  const on = habilitado && !!email;

  const { data: steps } = useQuery({
    queryKey: ['stepsForAthlete', email, desde],
    queryFn: () => getStepsForAthlete(email, desde),
    enabled: on,
  });
  const { data: pesos } = useQuery({
    queryKey: bodyweightForAthleteKey(email),
    queryFn: () => getBodyweightForAthlete(email),
    enabled: on,
  });
  const { data: logs } = useQuery({
    queryKey: ['workoutLogs', email],
    queryFn: () => getWorkoutLogs(email),
    enabled: on,
  });
  const { data: exercises } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
    enabled: on,
  });
  const { data: programadas } = useQuery({
    queryKey: ['workoutAssignmentsForAthlete', email],
    queryFn: () => getWorkoutAssignmentsForAthlete({ email, uid: userId }),
    enabled: on && !!userId,
  });

  return useMemo(() => {
    const datos = { hoy, steps, pesos, logs, programadas, exercises };
    return { autoRellenos: calcularAutoRellenos(datos), zonasEntrenadas: zonasEntrenadas(datos) };
  }, [hoy, steps, pesos, logs, programadas, exercises]);
}
