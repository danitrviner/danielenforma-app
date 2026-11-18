import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getExercises, getMesocycles, getWorkoutLogs } from '../dbService';
import { ejerciciosDelBloque } from '../utils/cuestionarioAuto';
import { todayStr } from '../utils/questionnaireSchedule';

/**
 * Los ejercicios que el atleta ha hecho en el bloque que se cierra, para la
 * pregunta «se queda / lo quitaría» del cuestionario de cierre. Mismas claves
 * de caché que Rutinas (registros, catálogo y mesociclos), así que
 * normalmente no lee nada nuevo. `habilitado: false` mientras el cuestionario
 * abierto no lleve esa pregunta.
 */
export function useEjerciciosDelBloque(email: string, habilitado: boolean) {
  const hoy = todayStr();
  const on = habilitado && !!email;

  const { data: logs, isPending: cargandoLogs } = useQuery({
    queryKey: ['workoutLogs', email],
    queryFn: () => getWorkoutLogs(email),
    enabled: on,
  });
  const { data: exercises, isPending: cargandoCatalogo } = useQuery({
    queryKey: ['exercises'],
    queryFn: getExercises,
    enabled: on,
  });
  const { data: mesocycles, isPending: cargandoBloques } = useQuery({
    queryKey: ['mesocycles', email],
    queryFn: () => getMesocycles(email),
    enabled: on,
  });

  const cargando = on && (cargandoLogs || cargandoCatalogo || cargandoBloques);
  return useMemo(
    () => ({ ejercicios: ejerciciosDelBloque({ hoy, logs, exercises, mesocycles }), cargando }),
    [hoy, logs, exercises, mesocycles, cargando],
  );
}
