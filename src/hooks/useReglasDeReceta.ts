import { useQuery } from '@tanstack/react-query';
import { getReglasDeReceta } from '../db/recipes';
import type { ReglaDeReceta } from '../utils/reglasDeReceta';

const SIN_REGLAS: ReglaDeReceta[] = [];
const SIN_RECOMENDADAS: string[] = [];

export const reglasDeRecetaKey = (email: string) => ['athleteRecipeRules', email] as const;

/**
 * Recetas que el coach ha escondido a este atleta (utils/reglasDeReceta.ts).
 * Mientras carga, o si falla, devuelve «ninguna»: nunca deja al atleta sin menú.
 * Misma clave en todas las pantallas, así que se lee una sola vez.
 */
export function useReglasDeReceta(email: string | undefined): ReglaDeReceta[] {
  const { data } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  return data?.reglas ?? SIN_REGLAS;
}

/**
 * Recetas que el coach le RECOMIENDA a este atleta: salen en una fila propia
 * arriba del recetario. Viajan en el mismo documento que las escondidas, así
 * que comparten la lectura: pedir las dos no cuesta una lectura más.
 */
export function useRecomendadasDelCoach(email: string | undefined): string[] {
  const { data } = useQuery({
    queryKey: reglasDeRecetaKey(email ?? ''),
    queryFn: () => getReglasDeReceta(email!),
    enabled: !!email,
    staleTime: 5 * 60_000,
  });
  return data?.recomendadas ?? SIN_RECOMENDADAS;
}
