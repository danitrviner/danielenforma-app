import { useEffect, useState } from 'react';
import type { UserProfile } from '../types';
import { vecesVisto, apuntarVisto } from '../utils/avisosVistos';

/**
 * ¿Toca enseñar este aviso? Sí las `max` primeras veces que se monta, y nunca
 * más después. Para los textos de ayuda que, repetidos en cada visita, el
 * atleta ya no lee (Dani: «con que te salga una o dos veces vale»).
 *
 * `activo` = false no cuenta la vista: un aviso que no llega a pintarse
 * (porque su condición no se cumple) no gasta una de sus apariciones.
 */
export function useAvisoLimitado(
  profile: Pick<UserProfile, 'email' | 'userId' | 'avisosVistos'>,
  id: string,
  activo: boolean,
  max = 2,
): boolean {
  const [agotado] = useState(() => vecesVisto(profile, id) >= max);
  const [contado, setContado] = useState(false);
  useEffect(() => {
    if (!activo || agotado || contado) return;
    apuntarVisto(profile, id, vecesVisto(profile, id) + 1);
    setContado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, agotado, contado, id]);
  return activo && !agotado;
}
