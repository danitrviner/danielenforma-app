import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQuestionnairesByCoach, getResponsesForAthlete } from '../dbService';
import { leerSexo, leerAntiguedadAnios, nivelExperienciaDe, Sexo, NivelExperiencia } from '../utils/athleteProfileSignals';

// Mismas queryKeys que ClientHub.tsx/VolumeSuggestionSheet.tsx/ReportsPanel.tsx
// ('questionnairesByCoach'/'responsesForAthlete') a propósito — si esa
// pantalla ya las tiene cargadas, react-query reutiliza el caché en vez de
// disparar un fetch duplicado.
export interface AthleteProfileSignals {
  sexo: Sexo | null;
  antiguedadAnios: number | null;
  nivel: NivelExperiencia | null;
  loading: boolean;
}

export function useAthleteProfileSignals(
  athleteEmail: string | undefined,
  coachUid: string | undefined,
): AthleteProfileSignals {
  const { data: questionnaires, isPending: loadingQ } = useQuery({
    queryKey: ['questionnairesByCoach', coachUid ?? ''],
    queryFn: () => getQuestionnairesByCoach(coachUid!),
    enabled: !!coachUid,
  });
  const { data: responses, isPending: loadingR } = useQuery({
    queryKey: ['responsesForAthlete', athleteEmail ?? ''],
    queryFn: () => getResponsesForAthlete(athleteEmail!),
    enabled: !!athleteEmail,
  });

  return useMemo(() => {
    const qs = questionnaires ?? [];
    const rs = responses ?? [];
    const antiguedadAnios = leerAntiguedadAnios(rs, qs);
    return {
      sexo: leerSexo(rs, qs),
      antiguedadAnios,
      nivel: antiguedadAnios != null ? nivelExperienciaDe(antiguedadAnios) : null,
      loading: loadingQ || loadingR,
    };
  }, [questionnaires, responses, loadingQ, loadingR]);
}
