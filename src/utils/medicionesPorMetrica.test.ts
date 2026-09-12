import { describe, it, expect } from 'vitest';
import { agruparMedicionesPorMetrica, metricasOrdenadas } from './medicionesPorMetrica';
import { BodyMeasurement, BodyMetricKey } from '../types';

/* El fallo de producción (Sentry, 29-08, 5 veces): una medición con una
   `metricKey` sin etiqueta hacía que ordenar lanzara
   «Cannot read properties of undefined (reading 'localeCompare')», y el atleta
   se quedaba SIN NINGUNA medición en pantalla — no sin la rara: sin todas. */

function medicion(metricKey: string, date: string, value: number): BodyMeasurement {
  return {
    id: `${metricKey}_${date}`,
    athleteId: 'ana@x.com',
    date,
    metricKey: metricKey as BodyMetricKey,
    value,
    unit: 'cm',
    source: 'manual',
    createdAt: `${date}T10:00:00.000Z`,
  };
}

describe('agruparMedicionesPorMetrica', () => {
  it('agrupa por métrica y ordena cada serie por fecha', () => {
    const mapa = agruparMedicionesPorMetrica([
      medicion('cintura', '2026-03-01', 84),
      medicion('cintura', '2026-01-01', 88),
      medicion('cadera', '2026-02-01', 96),
    ]);
    expect(mapa.get('cintura')).toEqual([
      { date: '2026-01-01', value: 88 },
      { date: '2026-03-01', value: 84 },
    ]);
    expect(mapa.get('cadera')).toHaveLength(1);
  });

  it('descarta una metricKey desconocida sin llevarse las demás por delante', () => {
    const mapa = agruparMedicionesPorMetrica([
      medicion('cintura', '2026-01-01', 88),
      medicion('perimetro_inventado_v3', '2026-01-01', 40), // no está en las etiquetas
      medicion('cadera', '2026-01-01', 96),
    ]);
    expect([...mapa.keys()].sort()).toEqual(['cadera', 'cintura']);
    // Y lo que importa: ordenar sobre esto no puede lanzar.
    expect(() => metricasOrdenadas(mapa)).not.toThrow();
  });

  it('deja fuera el peso y la altura, que no llevan tarjeta', () => {
    const mapa = agruparMedicionesPorMetrica([
      medicion('bodyweight', '2026-01-01', 82),
      medicion('altura', '2026-01-01', 178),
      medicion('cintura', '2026-01-01', 88),
    ]);
    expect([...mapa.keys()]).toEqual(['cintura']);
  });

  it('sin mediciones devuelve un mapa vacío, no un fallo', () => {
    expect(agruparMedicionesPorMetrica([]).size).toBe(0);
    expect(metricasOrdenadas(new Map())).toEqual([]);
  });
});

describe('metricasOrdenadas', () => {
  it('ordena alfabéticamente por la etiqueta, no por la clave', () => {
    // 'cuello' → «Cuello» va antes que 'cintura' → «Perímetro de cintura»,
    // aunque por clave sería al revés.
    const mapa = agruparMedicionesPorMetrica([
      medicion('cintura', '2026-01-01', 88),
      medicion('cuello', '2026-01-01', 38),
    ]);
    expect(metricasOrdenadas(mapa)).toEqual(['cuello', 'cintura']);
  });
});
