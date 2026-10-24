import { useQuery } from '@tanstack/react-query';
import type { CardioAplazo } from '../types';
import { getCardioAplazosDesde } from '../dbService';
import { addDays } from '../utils/trainingWeek';
import { DIAS_DE_APLAZOS } from '../utils/cardioAplazos';

/** Aplazos de «Mover a mañana» de un atleta en los últimos días, para el coach. */
export function useCardioAplazosDelAtleta(email: string, hoy: string) {
  return useQuery<CardioAplazo[]>({
    queryKey: ['cardioAplazosDelAtleta', email, hoy],
    queryFn: () => getCardioAplazosDesde(email, addDays(hoy, -DIAS_DE_APLAZOS)),
    staleTime: 5 * 60_000,
  });
}
