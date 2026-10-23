import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CardioAplazo, CardioAssignment } from '../types';
import { getCardioAplazos } from '../dbService';
import { addDays } from '../utils/trainingWeek';
import { aplicarAplazos } from '../utils/cardioAplazos';

export function cardioAplazosKey(email: string, hoy: string) {
  return ['cardioAplazos', email, hoy] as const;
}

/**
 * Los aplazos de «Mover a mañana» que afectan a HOY (el de hoy y el de ayer: dos
 * lecturas por id, sin consulta de colección) y las asignaciones ya ajustadas.
 * Lo comparten el motor de la sesión y la pantalla para que vean lo mismo.
 */
export function useCardioAplazos(email: string, hoy: string, asignaciones: CardioAssignment[], enabled = true) {
  const { data: aplazos = [] } = useQuery<CardioAplazo[]>({
    queryKey: cardioAplazosKey(email, hoy),
    queryFn: () => getCardioAplazos(email, addDays(hoy, -1), hoy),
    enabled,
  });
  const efectivas = useMemo(() => aplicarAplazos(asignaciones, aplazos, hoy), [asignaciones, aplazos, hoy]);
  return { aplazos, asignacionesEfectivas: efectivas };
}
