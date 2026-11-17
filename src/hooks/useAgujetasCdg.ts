import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '../firebase';
import { getQuestionnairesByCoach, getResponsesForAthlete } from '../db/questionnaires';
import { getWorkoutLogs } from '../db/training';
import { esElCoachPermanente } from '../utils/coach';
import { historialDeSeñal } from '../utils/signalReading';
import { ewmaDeSeñal } from '../utils/wellnessTrend';
import { agujetasPorZona, cansancioDeSesiones, ultimaVigente, type PuntoSeñal } from '../utils/cdg';
import { addDays, hoyIsoLocal } from '../utils/trainingWeek';

/** «La semana que acaba» cuando no se mira una semana concreta del bloque: hoy y los seis días anteriores. */
const DIAS_DE_LA_SEMANA_QUE_ACABA = 7;

/**
 * Agujetas de la semana por zona de IEM (1-5 de «Tu semana», o del DOM's 0-10 convertidas) (y el sueño, que el curso pone al lado al
 * decidir si se sube) de un atleta. Solo coach. Mismas claves de caché que el
 * resto de la app (`responsesForAthlete`, `questionnairesByCoach`): si la ficha
 * del cliente ya las cargó, no cuesta ni una lectura más.
 *
 * Estrés, sueño, motivación y cansancio al salir caducan a los 10 días (F16,
 * `UMBRALES_PROTOCOLO.diasVigenciaContexto`): la respuesta de hace meses no es
 * el contexto de esta semana. Caducada sale `undefined` («sin dato») y su
 * nombre va en `caducadas`, para que la pantalla pueda decir por qué falta.
 *
 * 17-11-2026 (D6r, D7): también lee los registros de entreno (misma clave
 * `workoutLogs` que Mesociclo y la ficha, así que tampoco suma lecturas).
 *  · Agujetas: las contestadas a las 48 h de cada sesión se mezclan con las del
 *    cuestionario semanal; por zona manda la más reciente (`agujetasPorZona`).
 *  · Cansancio al salir: `fatigaPost` es la media de las sesiones de los
 *    últimos 7 días que lo lleven apuntado (`cansancioSesiones` dice además de
 *    cuál salió peor); sin ninguna, la cifra del cuestionario semanal, que
 *    sigue disponible aparte en `fatigaPostSemanal`.
 *  · Auditoría de cifras (17-11-2026): `cansancioSesiones.duras` trae las
 *    sesiones de 8 o más con los ejercicios hechos en cada una. Quien tenga el
 *    catálogo las reparte por zona con `sesionesDurasPorZona`: una sesión dura
 *    frena solo lo que se trabajó en ella, sin esperar a la media.
 */
export function useAgujetasCdg (athleteEmail?: string) {
  const coach = auth.currentUser;
  const enabled = !!athleteEmail && !!coach && esElCoachPermanente(coach.email);
  const respuestas = useQuery({
    queryKey: ['responsesForAthlete', athleteEmail],
    queryFn: () => getResponsesForAthlete(athleteEmail!),
    enabled,
  });
  const cuestionarios = useQuery({
    queryKey: ['questionnairesByCoach', coach?.uid],
    queryFn: () => getQuestionnairesByCoach(coach!.uid),
    enabled,
  });
  const registros = useQuery({
    queryKey: ['workoutLogs', athleteEmail],
    queryFn: () => getWorkoutLogs(athleteEmail!),
    enabled,
  });
  return useMemo(() => {
    // Los registros se esperan, pero si fallan no tumban lo demás: se sigue con el cuestionario.
    if (!respuestas.data || !cuestionarios.data || (enabled && registros.isPending)) return { agujetas: undefined, sueño: undefined, estres: undefined, motivacion: undefined, fatigaPost: undefined, fatigaPostSemanal: undefined, cansancioSesiones: undefined, historial: undefined, caducadas: [] as string[], cargando: enabled && (respuestas.isPending || cuestionarios.isPending || registros.isPending) };
    const r = respuestas.data; const q = cuestionarios.data; const logs = registros.data ?? [];
    const hoy = hoyIsoLocal();
    const serie = (k: string) => historialDeSeñal(k, r, q);
    // Las series con su fecha: el historial se alinea por semana, no por posición.
    const historial = {
      estres: serie('wellness.stress_weekly'),
      sueño: serie('wellness.sleep_hours_weekly'),
      motivacion: serie('wellness.motivation_weekly'),
      fatigaPost: serie('wellness.fatigue_post_weekly'),
    };
    // Lo último que contestó (no la media): el protocolo decide con la semana que
    // acaba. El sueño va suavizado (EWMA), pero con la fecha de su última respuesta.
    const fatigaPostSemanal = ultimaVigente(historial.fatigaPost, hoy);
    // El cansancio apuntado sesión a sesión manda sobre el recuerdo semanal (D6r).
    const cansancioSesiones = cansancioDeSesiones(logs, { desde: addDays(hoy, -(DIAS_DE_LA_SEMANA_QUE_ACABA - 1)), hasta: hoy });
    const deSesiones: PuntoSeñal | undefined = cansancioSesiones && { date: cansancioSesiones.fecha, value: cansancioSesiones.media };
    const señales = {
      sueño: ultimaVigente(ewmaDeSeñal('wellness.sleep_hours_weekly', r, q), hoy),
      estres: ultimaVigente(historial.estres, hoy),
      motivacion: ultimaVigente(historial.motivacion, hoy),
      fatigaPost: deSesiones ?? fatigaPostSemanal,
    };
    const NOMBRES = { sueño: 'sueño', estres: 'estrés', motivacion: 'motivación', fatigaPost: 'cansancio al salir' } as const;
    const caducadas = (Object.keys(NOMBRES) as Array<keyof typeof NOMBRES>)
      .filter(k => !señales[k] && historial[k].some(p => p.date <= hoy))
      .map(k => NOMBRES[k]);
    return {
      agujetas: agujetasPorZona(serie, logs), ...señales,
      fatigaPostSemanal, cansancioSesiones,
      // Las semanas anteriores, para ver si un mal contexto es puntual o persistente.
      historial, caducadas,
      cargando: false,
    };
  }, [respuestas.data, cuestionarios.data, registros.data, respuestas.isPending, cuestionarios.isPending, registros.isPending, enabled]);
}
