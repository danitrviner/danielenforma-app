import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BodyMeasurement, BodyMetricKey } from '../types';
import { getBodyMeasurementsForAthlete } from '../dbService';

// Shared react-query key — QuestionnaireForm (writer, via una respuesta
// 'metric') y BodyMeasurementsPanel (lector, ficha de mediciones) usan la
// misma clave, mismo patrón que bodyweightForAthleteKey en useAthleteWeight.ts.
export function bodyMeasurementsForAthleteKey(athleteEmail: string) {
  return ['bodyMeasurementsForAthlete', athleteEmail] as const;
}

export interface AthleteMeasurements {
  all: BodyMeasurement[]; // ascending by date
  latest: Partial<Record<BodyMetricKey, BodyMeasurement>>;
  loading: boolean;
}

export function useBodyMeasurements(athleteEmail: string | undefined): AthleteMeasurements {
  const { data, isPending } = useQuery({
    queryKey: bodyMeasurementsForAthleteKey(athleteEmail ?? ''),
    queryFn: () => getBodyMeasurementsForAthlete(athleteEmail!),
    enabled: !!athleteEmail,
  });
  const all = data ?? [];
  const latest = useMemo(() => {
    const map: Partial<Record<BodyMetricKey, BodyMeasurement>> = {};
    for (const m of all) map[m.metricKey] = m; // all está ascendente por fecha, el último gana
    return map;
  }, [all]);
  return { all, latest, loading: isPending };
}
