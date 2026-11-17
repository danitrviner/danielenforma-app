import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '../firebase';
import { getQuestionnairesByCoach, getResponsesForAthlete } from '../db/questionnaires';
import { esElCoachPermanente } from '../utils/coach';
import { historialDeSeñal } from '../utils/signalReading';
import { ewmaDeSeñal } from '../utils/wellnessTrend';
import { agujetasPorZona, ultimaVigente } from '../utils/cdg';
import { hoyIsoLocal } from '../utils/trainingWeek';

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
  return useMemo(() => {
    if (!respuestas.data || !cuestionarios.data) return { agujetas: undefined, sueño: undefined, estres: undefined, motivacion: undefined, fatigaPost: undefined, historial: undefined, caducadas: [] as string[], cargando: enabled && (respuestas.isPending || cuestionarios.isPending) };
    const r = respuestas.data; const q = cuestionarios.data;
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
    const señales = {
      sueño: ultimaVigente(ewmaDeSeñal('wellness.sleep_hours_weekly', r, q), hoy),
      estres: ultimaVigente(historial.estres, hoy),
      motivacion: ultimaVigente(historial.motivacion, hoy),
      fatigaPost: ultimaVigente(historial.fatigaPost, hoy),
    };
    const NOMBRES = { sueño: 'sueño', estres: 'estrés', motivacion: 'motivación', fatigaPost: 'cansancio al salir' } as const;
    const caducadas = (Object.keys(NOMBRES) as Array<keyof typeof NOMBRES>)
      .filter(k => !señales[k] && historial[k].some(p => p.date <= hoy))
      .map(k => NOMBRES[k]);
    return {
      agujetas: agujetasPorZona(serie), ...señales,
      // Las semanas anteriores, para ver si un mal contexto es puntual o persistente.
      historial, caducadas,
      cargando: false,
    };
  }, [respuestas.data, cuestionarios.data, respuestas.isPending, cuestionarios.isPending, enabled]);
}
