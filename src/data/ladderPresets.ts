// Plantillas de escalera de niveles según el punto de partida del cliente.
// "Principiante" es la escalera por defecto (metodología del coach); Intermedio
// y Avanzado desplazan el foco de los kg perdidos hacia fuerza relativa y
// habilidades (dominadas lastradas, muscle-up...). El coach carga una plantilla
// en LevelLadderEditor y la ajusta por cliente.

import { LevelLadder } from '../types';
import { DEFAULT_LEVEL_LADDER } from './defaultLevelLadder';

export interface LadderPreset {
  id: 'principiante' | 'intermedio' | 'avanzado';
  name: string;
  description: string;
  ladder: LevelLadder;
}

const INTERMEDIATE_LADDER: LevelLadder = {
  levels: [
    {
      id: 'int-lvl-0',
      order: 0,
      name: 'En Marcha',
      icon: 'directions_run',
      criteria: [
        { id: 'int-0-pasos', kind: 'pasos_media_diaria', label: 'Media de 8.000 pasos al día', targetValue: 8000 },
        { id: 'int-0-tecnica', kind: 'manual', label: 'Técnica sólida en sentadilla, banca y peso muerto (validada por tu coach)' },
      ],
    },
    {
      id: 'int-lvl-1',
      order: 1,
      name: 'Sólido',
      icon: 'foundation',
      criteria: [
        { id: 'int-1-peso', kind: 'peso_perdido_kg', label: 'Perder 5 kg', targetValue: 5 },
        { id: 'int-1-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 1x tu peso corporal', targetValue: 1, exerciseNameMatch: 'sentadilla' },
        { id: 'int-1-dom', kind: 'manual', label: '10 dominadas estrictas' },
      ],
    },
    {
      id: 'int-lvl-2',
      order: 2,
      name: 'Hombre de Hierro',
      icon: 'fitness_center',
      criteria: [
        { id: 'int-2-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 1.5x tu peso corporal', targetValue: 1.5, exerciseNameMatch: 'sentadilla' },
        { id: 'int-2-pasos', kind: 'pasos_media_diaria', label: 'Media de 10.000 pasos al día', targetValue: 10000 },
        { id: 'int-2-dom', kind: 'manual', label: '15 dominadas estrictas' },
        { id: 'int-2-flex', kind: 'manual', label: '40 flexiones seguidas' },
      ],
    },
    {
      id: 'int-lvl-3',
      order: 3,
      name: 'Máquina Imparable',
      icon: 'bolt',
      criteria: [
        { id: 'int-3-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 1.75x tu peso corporal', targetValue: 1.75, exerciseNameMatch: 'sentadilla' },
        { id: 'int-3-dom', kind: 'manual', label: '5 dominadas lastradas con +10 kg' },
        { id: 'int-3-flex', kind: 'manual', label: '60 flexiones seguidas' },
      ],
    },
  ],
};

const ADVANCED_LADDER: LevelLadder = {
  levels: [
    {
      id: 'adv-lvl-0',
      order: 0,
      name: 'Base de Granito',
      icon: 'shield',
      criteria: [
        { id: 'adv-0-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 1.5x tu peso corporal', targetValue: 1.5, exerciseNameMatch: 'sentadilla' },
        { id: 'adv-0-pasos', kind: 'pasos_media_diaria', label: 'Media de 10.000 pasos al día', targetValue: 10000 },
      ],
    },
    {
      id: 'adv-lvl-1',
      order: 1,
      name: 'Fuerza Visible',
      icon: 'bolt',
      criteria: [
        { id: 'adv-1-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 1.75x tu peso corporal', targetValue: 1.75, exerciseNameMatch: 'sentadilla' },
        { id: 'adv-1-dom', kind: 'manual', label: '5 dominadas lastradas con +15 kg' },
        { id: 'adv-1-fondos', kind: 'manual', label: '8 fondos lastrados con +20 kg' },
      ],
    },
    {
      id: 'adv-lvl-2',
      order: 2,
      name: 'Imparable',
      icon: 'rocket_launch',
      criteria: [
        { id: 'adv-2-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 2x tu peso corporal', targetValue: 2, exerciseNameMatch: 'sentadilla' },
        { id: 'adv-2-dom', kind: 'manual', label: '3 dominadas lastradas con +25 kg' },
        { id: 'adv-2-flex', kind: 'manual', label: '20 flexiones con palmada' },
      ],
    },
    {
      id: 'adv-lvl-3',
      order: 3,
      name: 'Leyenda del Club',
      icon: 'military_tech',
      criteria: [
        { id: 'adv-3-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 2.25x tu peso corporal', targetValue: 2.25, exerciseNameMatch: 'sentadilla' },
        { id: 'adv-3-flex', kind: 'manual', label: '1 flexión a una mano con cada brazo' },
        { id: 'adv-3-muscle', kind: 'manual', label: 'Muscle-up estricto' },
      ],
    },
  ],
};

export const LADDER_PRESETS: LadderPreset[] = [
  {
    id: 'principiante',
    name: 'Principiante',
    description: 'Acaba de empezar: los primeros kg perdidos son el motor.',
    ladder: DEFAULT_LEVEL_LADDER,
  },
  {
    id: 'intermedio',
    name: 'Intermedio',
    description: 'Ya entrena: consolidar técnica, fuerza relativa y hábitos.',
    ladder: INTERMEDIATE_LADDER,
  },
  {
    id: 'avanzado',
    name: 'Avanzado',
    description: 'Fuerza relativa y habilidades — los kg perdidos ya no son lo central.',
    ladder: ADVANCED_LADDER,
  },
];
