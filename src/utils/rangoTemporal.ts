import { addDays, hoyIsoLocal } from './trainingWeek';
import type { SegmentedOption } from '../components/ui/SegmentedControl';

// Selector de rango temporal para gráficas de historial (peso, periodización…).
// Un mismo puñado de ventanas para todas: últimos 7/14 días, el último mes,
// los últimos 6 meses, o todo el histórico.

export type RangoTemporal = '7d' | '14d' | '1m' | '6m' | 'todo';

const DIAS_POR_RANGO: Record<Exclude<RangoTemporal, 'todo'>, number> = {
  '7d': 7,
  '14d': 14,
  '1m': 30,
  '6m': 182,
};

export const RANGO_TEMPORAL_OPTIONS: SegmentedOption[] = [
  { value: '7d', label: '7D' },
  { value: '14d', label: '14D' },
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: 'todo', label: 'Todo' },
];

/** Fecha ISO de corte del rango (inclusive), o null si es 'todo'. */
export function inicioDeRango(rango: RangoTemporal, hoy: string = hoyIsoLocal()): string | null {
  if (rango === 'todo') return null;
  return addDays(hoy, -(DIAS_POR_RANGO[rango] - 1));
}

/** Recorta puntos con fecha anterior al corte del rango. `hoy` fija el ancla
 *  (por defecto el día real) para que sea determinista en tests. */
export function recortarPorRango<T extends { date: string }>(
  puntos: T[],
  rango: RangoTemporal,
  hoy: string = hoyIsoLocal(),
): T[] {
  const desde = inicioDeRango(rango, hoy);
  if (desde == null) return puntos;
  return puntos.filter(p => p.date >= desde);
}
