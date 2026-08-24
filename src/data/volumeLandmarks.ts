// ═══════════════════════════════════════════════════════════════════════════
// Volume landmarks por grupo muscular — MV / MEV / MAV(min-max) / MRV, en
// series efectivas por semana. Esta es la versión TIPADA de los rangos que
// Dani ya tenía escritos en prosa dentro de la doctrina de entrenamiento
// (ai/doctrina.ts, sección "Volumen: series efectivas por grupo y semana").
//
// mavMin/mavMax son EXACTAMENTE esos rangos — no se han cambiado. mv/mev/mrv
// se han completado con literatura de referencia (RP Strength, revisiones de
// volumen de hipertrofia) para los grupos que la doctrina no acotaba por
// abajo/arriba. Esta constante es el valor POR DEFECTO — igual que
// DOCTRINA_ENTRENAMIENTO_DEFAULT, lo que de verdad se usa puede estar editado
// por Dani en Firestore (coachSettings/volumeLandmarks, ver db/coachSettings.ts).
//
// Un mesociclo nuevo, en el buscador de volumen, arranca su base en algún
// punto de este rango según el nivel del atleta (ver utils/volumeSuggestion.ts).
// ═══════════════════════════════════════════════════════════════════════════

import { MuscleGroup, MUSCLE_ORDER } from '../types';

export interface VolumeLandmark {
  mv: number;      // volumen de mantenimiento
  mev: number;     // mínimo efectivo — por debajo, no hay estímulo de crecimiento
  mavMin: number;  // inicio de la zona adaptativa (rango de la doctrina de Dani)
  mavMax: number;  // techo de la zona adaptativa (rango de la doctrina de Dani)
  mrv: number;     // máximo recuperable — por encima, la fatiga supera la adaptación
}

export const VOLUME_LANDMARKS_DEFAULT: Record<MuscleGroup, VolumeLandmark> = {
  pecho:         { mv: 6, mev: 8,  mavMin: 10, mavMax: 15, mrv: 20 },
  dorsal:        { mv: 8, mev: 10, mavMin: 12, mavMax: 20, mrv: 25 },
  trapecio:      { mv: 4, mev: 6,  mavMin: 6,  mavMax: 12, mrv: 18 },
  deltoide_ant:  { mv: 0, mev: 4,  mavMin: 4,  mavMax: 8,  mrv: 12 },
  deltoide_lat:  { mv: 6, mev: 8,  mavMin: 12, mavMax: 20, mrv: 24 },
  deltoide_post: { mv: 4, mev: 6,  mavMin: 8,  mavMax: 15, mrv: 20 },
  biceps:        { mv: 4, mev: 6,  mavMin: 8,  mavMax: 14, mrv: 20 },
  triceps:       { mv: 4, mev: 6,  mavMin: 8,  mavMax: 14, mrv: 18 },
  antebrazo:     { mv: 0, mev: 0,  mavMin: 0,  mavMax: 6,  mrv: 10 },
  cuadriceps:    { mv: 6, mev: 8,  mavMin: 10, mavMax: 15, mrv: 20 },
  isquios:       { mv: 4, mev: 6,  mavMin: 8,  mavMax: 12, mrv: 16 },
  gluteo:        { mv: 4, mev: 6,  mavMin: 10, mavMax: 16, mrv: 18 },
  aductores:     { mv: 0, mev: 4,  mavMin: 6,  mavMax: 12, mrv: 14 },
  gemelo:        { mv: 4, mev: 6,  mavMin: 8,  mavMax: 15, mrv: 20 },
  core:          { mv: 0, mev: 4,  mavMin: 4,  mavMax: 10, mrv: 16 },
  lumbares:      { mv: 0, mev: 4,  mavMin: 4,  mavMax: 8,  mrv: 12 },
  rotadores:     { mv: 0, mev: 4,  mavMin: 4,  mavMax: 9,  mrv: 12 },
};

/** true si todos los 17 grupos tienen valores válidos y ordenados mv<=mev<=mavMin<=mavMax<=mrv. */
export function isValidLandmark(l: VolumeLandmark): boolean {
  return (
    Number.isInteger(l.mv) && Number.isInteger(l.mev) &&
    Number.isInteger(l.mavMin) && Number.isInteger(l.mavMax) && Number.isInteger(l.mrv) &&
    l.mv >= 0 && l.mv <= l.mev && l.mev <= l.mavMin &&
    l.mavMin <= l.mavMax && l.mavMax <= l.mrv && l.mrv <= 25
  );
}

export function isValidLandmarksTable(table: Record<MuscleGroup, VolumeLandmark>): boolean {
  return MUSCLE_ORDER.every(g => table[g] && isValidLandmark(table[g]));
}
