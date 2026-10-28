import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWeeklyChallenge } from '../../dbService';
import { isoWeekKey } from '../../utils/weeklyChallenge';
import { hoyIsoLocal } from '../../utils/trainingWeek';
import { avisoDeReto } from '../../utils/avisoDeReto';
import { Icon } from '../ui';

interface Props {
  athleteEmail: string;
  exerciseId: string;
  workoutId?: string;
}

/**
 * El reto de la semana en el ejercicio al que afecta. Lee el mismo documento
 * (y la misma clave) que la tarjeta de Inicio: si el atleta ha pasado por
 * Inicio, no cuesta ninguna lectura.
 */
export default function AvisoDeRetoEnSesion({ athleteEmail, exerciseId, workoutId }: Props) {
  const semana = isoWeekKey(hoyIsoLocal());
  const { data: reto = null } = useQuery({
    queryKey: ['weeklyChallenge', athleteEmail, semana],
    queryFn: () => getWeeklyChallenge(athleteEmail, semana),
  });
  const aviso = avisoDeReto(reto, exerciseId, workoutId);
  if (!aviso) return null;
  return (
    <div className="flex items-start gap-2 rounded-surface border border-accent-line bg-accent/10 px-4 py-3">
      <Icon name="flag" size="s" className="text-accent-ink mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-label text-accent-ink uppercase tracking-wide">{aviso.etiqueta}</p>
        <p className="font-sans text-caption text-ink-2 leading-relaxed">{aviso.texto}</p>
      </div>
    </div>
  );
}
