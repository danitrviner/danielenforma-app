// ═══════════════════════════════════════════════════════════════════════════
// Zonas de volumen (Sin volumen / MEV / Productivo / MAV / MRV) — antes vivían
// como umbrales fijos (≤4, ≤9, ≤14, 15+) duplicados en MesocycleManager.tsx y
// MesocycleTemplateLibrary.tsx, iguales para los 17 grupos musculares. Ahora
// leen la tabla de landmarks por grupo (src/data/volumeLandmarks.ts, editable
// en el panel del asistente) para que "MAV" signifique el rango real de ESE
// grupo y no un número genérico igual para pecho que para antebrazo.
//
// Los call sites que no tienen un grupo concreto (p.ej. el total de un día,
// que mezcla varios grupos) siguen usando GENERIC_LANDMARK, que reproduce
// EXACTAMENTE los umbrales antiguos (0 / 1-4 / 5-9 / 10-14 / 15+) — cero
// cambio de comportamiento visual para esos casos.
import { VolumeLandmark } from '../data/volumeLandmarks';

export type VolumeZone = 'sin_volumen' | 'mev' | 'productivo' | 'mav' | 'mrv';

export const GENERIC_LANDMARK: VolumeLandmark = { mv: 0, mev: 5, mavMin: 10, mavMax: 14, mrv: 20 };

export function zoneOf(series: number, landmark: VolumeLandmark = GENERIC_LANDMARK): VolumeZone {
  if (series <= 0) return 'sin_volumen';
  if (series < landmark.mev) return 'mev';
  if (series < landmark.mavMin) return 'productivo';
  if (series <= landmark.mavMax) return 'mav';
  return 'mrv';
}

const ZONE_LABEL: Record<VolumeZone, string> = {
  sin_volumen: 'Sin volumen', mev: 'MEV', productivo: 'Productivo', mav: 'MAV', mrv: 'MRV',
};

export function zoneLabel(series: number, landmark?: VolumeLandmark): string {
  return ZONE_LABEL[zoneOf(series, landmark)];
}

const ZONE_COLOR_TEXT: Record<VolumeZone, string> = {
  sin_volumen: 'var(--color-ink-3)',
  mev: 'var(--color-info)',
  productivo: 'var(--color-success)',
  mav: 'var(--color-warning)',
  mrv: 'var(--color-danger)',
};

export function heatmapText(series: number, landmark?: VolumeLandmark): string {
  return ZONE_COLOR_TEXT[zoneOf(series, landmark)];
}

// Rampa de opacidad dentro de cada zona — mismos números que el código
// original, generalizados a los límites reales del landmark en vez de a los
// umbrales fijos 1/4/5/9/10/14/15 que solo eran correctos para el genérico.
export function heatmapBg(series: number, landmark: VolumeLandmark = GENERIC_LANDMARK): string {
  const zone = zoneOf(series, landmark);
  if (zone === 'sin_volumen') return 'var(--color-surface)';

  if (zone === 'mev') {
    const start = 1, end = Math.max(start, landmark.mev - 1);
    const t = (series - start) / Math.max(1, end - start);
    return `rgb(59 130 246 / ${Math.round(18 + t * 32)}%)`;
  }
  if (zone === 'productivo') {
    const start = landmark.mev, end = Math.max(start, landmark.mavMin - 1);
    const t = (series - start) / Math.max(1, end - start);
    return `rgb(34 197 94 / ${Math.round(20 + t * 40)}%)`;
  }
  if (zone === 'mav') {
    const start = landmark.mavMin, end = landmark.mavMax;
    const t = (series - start) / Math.max(1, end - start);
    return `rgb(249 115 22 / ${Math.round(28 + t * 42)}%)`;
  }
  // mrv — mismo ancho de rampa fijo (5 series) que el original, más allá del mavMax.
  const t = Math.min((series - landmark.mavMax) / 5, 1);
  return `rgb(239 68 68 / ${Math.round(48 + t * 42)}%)`;
}

export const VOLUME_ZONE_LEGEND = [
  { label: 'Sin volumen', bg: 'var(--color-surface)',      text: 'var(--color-ink-3)'     },
  { label: 'MEV',         bg: 'rgb(59 130 246 / 35%)',     text: 'var(--color-info)'      },
  { label: 'Productivo',  bg: 'rgb(34 197 94 / 45%)',      text: 'var(--color-success)'   },
  { label: 'MAV',         bg: 'rgb(249 115 22 / 55%)',     text: 'var(--color-warning)'   },
  { label: 'MRV',         bg: 'rgb(239 68 68 / 65%)',      text: 'var(--color-danger)'    },
];
