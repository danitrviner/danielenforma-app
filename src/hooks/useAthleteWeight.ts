import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BodyweightLog } from '../types';
import { getBodyweightForAthlete } from '../dbService';

export interface AthleteWeight {
  logs: BodyweightLog[]; // ascending by date
  initial: number | null; // earliest logged weight
  current: number | null; // most recent logged weight
  loading: boolean;
}

// Shared react-query key for an athlete's bodyweight log — BodyweightPanel
// (the writer) uses the same key so its mutations update exactly what this
// hook's read-only consumers (CoachRoadmapView, NutritionPerformanceDashboard)
// see, without either side needing to know about the other.
export function bodyweightForAthleteKey(athleteEmail: string) {
  return ['bodyweightForAthlete', athleteEmail] as const;
}

/* Claves de las consultas de FRONTERA (primer y último peso).
 *
 * Van aparte de `bodyweightForAthleteKey` a propósito: esa devuelve la lista
 * completa y la comparten las pantallas del coach para pintar gráficas. Guardar
 * un único registro bajo esa clave les dejaría un historial de un elemento sin
 * ningún error que lo delatara — el mismo accidente que se evitó en el widget
 * de pasos.
 *
 * `pesoUltimoKey` la comparten Check-in (que enseña el último peso) y la tarjeta
 * de plan en preparación (que solo mira si existe alguno): una lectura sirve a
 * las dos. */
export function pesoPrimeroKey(athleteEmail: string) {
  return ['pesoExtremo', athleteEmail, 'primero'] as const;
}
export function pesoUltimoKey(athleteEmail: string) {
  return ['pesoExtremo', athleteEmail, 'ultimo'] as const;
}

/** Tras escribir un peso, los extremos pueden haber cambiado. Los escritores
 *  llaman a esto para que Check-in y Destacados no se queden con el valor
 *  viejo. Se invalidan (no se parchean) porque un borrado puede dejar como
 *  extremo a un registro que no estaba en memoria. */
export function invalidarExtremosDePeso(
  queryClient: { invalidateQueries: (o: { queryKey: readonly unknown[] }) => unknown },
  athleteEmail: string,
): void {
  queryClient.invalidateQueries({ queryKey: pesoPrimeroKey(athleteEmail) });
  queryClient.invalidateQueries({ queryKey: pesoUltimoKey(athleteEmail) });
}

// Single source of truth for "what does this athlete weigh" — replaces the
// independent getBodyweightForAthlete() calls in CoachRoadmapView and
// NutritionPerformanceDashboard (read-only consumers), which could each show a
// slightly different snapshot depending on load timing.
export function useAthleteWeight(athleteEmail: string | undefined): AthleteWeight {
  const { data, isPending } = useQuery({
    queryKey: bodyweightForAthleteKey(athleteEmail ?? ''),
    queryFn: () => getBodyweightForAthlete(athleteEmail!),
    enabled: !!athleteEmail,
  });

  return useMemo(() => {
    const logs = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return {
      logs,
      initial: logs.length > 0 ? logs[0].weight : null,
      current: logs.length > 0 ? logs[logs.length - 1].weight : null,
      loading: athleteEmail ? isPending : false,
    };
  }, [data, isPending, athleteEmail]);
}
