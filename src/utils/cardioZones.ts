import { CardioZones } from '../types';

export const ZONE_ORDER: (keyof CardioZones)[] = ['z1', 'z2', 'z3', 'z4', 'z5'];

export const ZONE_LABEL: Record<keyof CardioZones, string> = {
  z1: 'Z1 Recuperación', z2: 'Z2 Base aeróbica', z3: 'Z3 Tempo', z4: 'Z4 Umbral', z5: 'Z5 VO₂máx',
};

export const ZONE_COLOR: Record<keyof CardioZones, string> = {
  z1: '#4a90d9', z2: '#00eefc', z3: '#fbcb1a', z4: '#ff8c42', z5: '#ff4d4d',
};

export function getZoneForBpm(bpm: number, zones: CardioZones): keyof CardioZones | null {
  for (const z of ZONE_ORDER) {
    if (bpm >= zones[z].min && bpm <= zones[z].max) return z;
  }
  if (bpm > zones.z5.max) return 'z5';
  if (bpm < zones.z1.min) return null; // por debajo de Z1: en calentamiento/reposo
  return null;
}

// Friel por LTHR (referencia running, §5.6 del plan) — usado cuando el
// atleta ya tiene LTHR de un test de umbral (Test 2), más preciso que Karvonen.
export function zonesFromLthr(lthr: number): CardioZones {
  const pct = (p: number) => Math.round(lthr * p);
  return {
    z1: { min: 0, max: pct(0.85) - 1 },
    z2: { min: pct(0.85), max: pct(0.89) },
    z3: { min: pct(0.90), max: pct(0.94) },
    z4: { min: pct(0.95), max: pct(0.99) },
    z5: { min: pct(1.00), max: pct(1.10) },
  };
}
