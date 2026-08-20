import { MuscleGroup } from '../types';

// Catálogo de repartos de entrenamiento estándar (torso/pierna, push/pull,
// full body...) — Dani los definió como la forma "correcta" de repartir los
// días según cuántos entrena el atleta a la semana. El número de días de
// cada reparto es simplemente la longitud de `dayTypes`, así que un reparto
// siempre encaja exacto con `daysPerWeek` sin tener que declararlo aparte.
export interface TrainingSplit {
  id: string;
  label: string;       // texto corto para el selector, p.ej. "Torso - Pierna - Full body"
  dayTypes: string[];  // una entrada por día de entrenamiento, en orden
}

export const TRAINING_SPLITS: TrainingSplit[] = [
  // 3 días
  { id: '3-torso-pierna-full',   label: 'Torso - Pierna - Full body', dayTypes: ['Torso', 'Pierna', 'Full body'] },
  { id: '3-full',                label: 'Full body',                  dayTypes: ['Full body', 'Full body', 'Full body'] },
  { id: '3-push-pull-full',      label: 'Push - Pull - Full body',    dayTypes: ['Push', 'Pull', 'Full body'] },
  { id: '3-push-pull-legs',      label: 'Push - Pull - Legs',         dayTypes: ['Push', 'Pull', 'Legs'] },

  // 4 días
  { id: '4-torso-pierna-x2',     label: 'Torso - Pierna - Torso - Pierna',           dayTypes: ['Torso', 'Pierna', 'Torso', 'Pierna'] },
  { id: '4-push-pull-x2',        label: 'Push - Pull - Push - Pull',                 dayTypes: ['Push', 'Pull', 'Push', 'Pull'] },
  { id: '4-push-pull-legs-torso',label: 'Push - Pull - Legs - Torso',                dayTypes: ['Push', 'Pull', 'Legs', 'Torso'] },
  { id: '4-torso-pierna-brazo-full', label: 'Torso - Pierna - Brazo/Hombro - Full body', dayTypes: ['Torso', 'Pierna', 'Brazo/Hombro', 'Full body'] },

  // 5 días
  { id: '5-torso-pierna-x2-brazo', label: 'Torso - Pierna - Torso - Pierna - Brazo/Hombro', dayTypes: ['Torso', 'Pierna', 'Torso', 'Pierna', 'Brazo/Hombro'] },
  { id: '5-push-pull-leg-brazo-full', label: 'Push - Pull - Leg - Brazo - Full body', dayTypes: ['Push', 'Pull', 'Leg', 'Brazo', 'Full body'] },
  { id: '5-empujes-tirones-pierna-hombro', label: 'Empujes torso - Tirones torso - Pierna/Hombro - Torso - Pierna/Hombro', dayTypes: ['Empujes torso', 'Tirones torso', 'Pierna/Hombro', 'Torso', 'Pierna/Hombro'] },
  { id: '5-push-pull-cuad-torso-gluteo', label: 'Push - Pull - Cuádriceps - Torso - Glúteo/Isquios', dayTypes: ['Push', 'Pull', 'Cuádriceps', 'Torso', 'Glúteo/Isquios'] },

  // 6 días
  { id: '6-torso-pierna-brazo-x2', label: 'Torso - Pierna - Brazo/Hombro x2', dayTypes: ['Torso', 'Pierna', 'Brazo/Hombro', 'Torso', 'Pierna', 'Brazo/Hombro'] },
  { id: '6-empujes-tiron-pierna-hombro-x2', label: 'Empujes torso - Tirón torso - Pierna/Hombro x2', dayTypes: ['Empujes torso', 'Tirón torso', 'Pierna/Hombro', 'Empujes torso', 'Tirón torso', 'Pierna/Hombro'] },
];

export function getSplitsForDays(daysPerWeek: number): TrainingSplit[] {
  return TRAINING_SPLITS.filter(s => s.dayTypes.length === daysPerWeek);
}

// Qué grupos musculares entran en cada tipo de día. 'core' se puede colocar
// cualquier día (no tiene un día propio en ningún reparto).
export const DAY_TYPE_MUSCLES: Record<string, MuscleGroup[]> = {
  'Torso':           ['pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'biceps', 'triceps', 'antebrazo', 'core'],
  'Pierna':          ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core'],
  'Full body':       ['pecho', 'dorsal', 'trapecio', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'biceps', 'triceps', 'antebrazo', 'cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core'],
  'Push':            ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps', 'core'],
  'Pull':            ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo', 'core'],
  'Legs':            ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core'],
  'Leg':             ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'core'],
  'Brazo/Hombro':    ['biceps', 'triceps', 'antebrazo', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'core'],
  'Brazo':           ['biceps', 'triceps', 'antebrazo', 'core'],
  'Empujes torso':   ['pecho', 'deltoide_ant', 'deltoide_lat', 'triceps', 'core'],
  'Tirones torso':   ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo', 'core'],
  'Tirón torso':     ['dorsal', 'trapecio', 'deltoide_post', 'biceps', 'antebrazo', 'core'],
  'Pierna/Hombro':   ['cuadriceps', 'isquios', 'gluteo', 'aductores', 'gemelo', 'deltoide_ant', 'deltoide_lat', 'deltoide_post', 'core'],
  'Cuádriceps':      ['cuadriceps', 'aductores', 'gemelo', 'core'],
  'Glúteo/Isquios':  ['gluteo', 'isquios', 'gemelo', 'core'],
};
