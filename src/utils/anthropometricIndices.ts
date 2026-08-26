import { BodyMeasurement, BodyMetricKey } from '../types';

// Índices antropométricos del protocolo de Dani: ratios entre dos perímetros,
// nunca almacenados — se derivan al vuelo de la última medida de cada
// perímetro implicado. Si falta cualquiera de los dos, el índice es null (no
// se rellena con datos legacy de otro protocolo).

export type AnthropometricIndexKey = 'ipc' | 'ibc' | 'icac' | 'imc_muslo' | 'whtr';

export const ANTHROPOMETRIC_INDEX_LABELS: Record<AnthropometricIndexKey, string> = {
  ipc:       'Pecho / Cintura',
  ibc:       'Bíceps der. contraído / Cintura',
  icac:      'Cadera / Cintura',
  imc_muslo: 'Muslo der. relajado / Cintura',
  whtr:      'Cintura / Altura (WHtR)',
};

const INDEX_PAIRS: Record<AnthropometricIndexKey, [BodyMetricKey, BodyMetricKey]> = {
  ipc:       ['pecho', 'cintura'],
  ibc:       ['biceps_der_contraido', 'cintura'],
  icac:      ['cadera', 'cintura'],
  imc_muslo: ['muslo_der_relajado', 'cintura'],
  // WHtR se define convencionalmente cintura/altura (no al revés) — a diferencia
  // de los otros 4 índices, la altura es prácticamente invariable en adultos,
  // por eso es el ratio con más respaldo en salud cardiometabólica.
  whtr:      ['cintura', 'altura'],
};

/** Última medida de cada perímetro, por clave — pásale `latest` de useBodyMeasurements. */
export function computeAnthropometricIndices(
  latest: Partial<Record<BodyMetricKey, BodyMeasurement>>,
): Record<AnthropometricIndexKey, number | null> {
  const out = {} as Record<AnthropometricIndexKey, number | null>;
  for (const [key, [numKey, denKey]] of Object.entries(INDEX_PAIRS) as [AnthropometricIndexKey, [BodyMetricKey, BodyMetricKey]][]) {
    const num = latest[numKey]?.value;
    const den = latest[denKey]?.value;
    out[key] = num != null && den != null && den !== 0 ? Math.round((num / den) * 1000) / 1000 : null;
  }
  return out;
}
