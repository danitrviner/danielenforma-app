import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '../firebase';
import { getQuestionnairesByCoach, getResponsesForAthlete } from '../db/questionnaires';
import { esElCoachPermanente } from '../utils/coach';
import { historialDeSeñal } from '../utils/signalReading';
import { ewmaDeSeñal } from '../utils/wellnessTrend';
import { agujetasPorZona } from '../utils/cdg';

/**
 * Agujetas a las 48 h por zona de IEM (y el sueño, que el curso pone al lado al
 * decidir si se sube) de un atleta. Solo coach. Mismas claves de caché que el
 * resto de la app (`responsesForAthlete`, `questionnairesByCoach`): si la ficha
 * del cliente ya las cargó, no cuesta ni una lectura más.
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
    if (!respuestas.data || !cuestionarios.data) return { agujetas: undefined, sueño: undefined, cargando: enabled && (respuestas.isPending || cuestionarios.isPending) };
    const r = respuestas.data; const q = cuestionarios.data;
    const sueño = ewmaDeSeñal('wellness.sleep_hours_weekly', r, q).at(-1);
    return { agujetas: agujetasPorZona(k => historialDeSeñal(k, r, q)), sueño, cargando: false };
  }, [respuestas.data, cuestionarios.data, respuestas.isPending, cuestionarios.isPending, enabled]);
}
