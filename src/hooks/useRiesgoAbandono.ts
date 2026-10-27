import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '../firebase';
import { getAllUserProfilesOrThrow } from '../dbService';
import { useRespuestasDeLaBandeja } from './useRevisionesSinLeer';
import { colaDeRevisiones } from '../utils/colaDeRevisiones';
import { atletasActivos } from '../utils/atletas';
import { hoyIsoLocal } from '../utils/trainingWeek';

/**
 * Emails (en minúsculas) de los atletas en riesgo de abandono: dos revisiones
 * seguidas sin responder, o satisfacción / ganas de seguir ≤ 6 en un hito. Lo
 * enseña el CRM antes de la renovación. Mismas consultas (y caché) que la
 * bandeja de Revisiones.
 */
export function useRiesgoAbandono(cargar = true): Set<string> {
  const coachId = auth.currentUser?.uid ?? '';
  const { responses, questionnaires } = useRespuestasDeLaBandeja(coachId, cargar);
  const { data: perfiles = [] } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfilesOrThrow,
    enabled: cargar,
  });
  return useMemo(() => {
    const cola = colaDeRevisiones({ hoy: hoyIsoLocal(), atletas: atletasActivos(perfiles), responses, questionnaires });
    return new Set(cola.filter(f => f.riesgoAbandono).map(f => f.atleta.email.toLowerCase()));
  }, [perfiles, responses, questionnaires]);
}
