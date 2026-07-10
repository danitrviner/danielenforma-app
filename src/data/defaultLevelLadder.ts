// Escalera de niveles por defecto — metodología del coach ("escalera de
// evaluación vertical con nombres motivadores"). Se usa cuando el doc
// roadmaps/{email} no tiene levelLadder propio; el coach puede personalizarla
// por cliente desde su editor (la copia editada se guarda en el doc del atleta).

import { LevelLadder } from '../types';

export const DEFAULT_LEVEL_LADDER: LevelLadder = {
  levels: [
    {
      id: 'lvl-club',
      order: 0,
      name: 'Club',
      icon: 'group',
      criteria: [
        { id: 'club-peso', kind: 'peso_perdido_kg', label: 'Perder tus primeros 5 kg', targetValue: 5 },
      ],
    },
    {
      id: 'lvl-hombre-sano',
      order: 1,
      name: 'Hombre Sano',
      icon: 'favorite',
      criteria: [
        { id: 'sano-peso', kind: 'peso_perdido_kg', label: 'Perder 10 kg', targetValue: 10 },
        { id: 'sano-flex', kind: 'manual', label: '20 flexiones seguidas' },
      ],
    },
    {
      id: 'lvl-hombre-fuerte',
      order: 2,
      name: 'Hombre Fuerte',
      icon: 'fitness_center',
      criteria: [
        { id: 'fuerte-dom', kind: 'manual', label: '10 dominadas estrictas' },
        { id: 'fuerte-flex', kind: 'manual', label: '30 flexiones seguidas' },
        { id: 'fuerte-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 1.5x tu peso corporal', targetValue: 1.5, exerciseNameMatch: 'sentadilla' },
      ],
    },
    {
      id: 'lvl-camion',
      order: 3,
      name: 'Camión de Prosegur',
      icon: 'local_shipping',
      criteria: [
        { id: 'camion-dom', kind: 'manual', label: '20 dominadas estrictas' },
        { id: 'camion-flex', kind: 'manual', label: '50 flexiones seguidas' },
        { id: 'camion-squat', kind: 'sentadilla_xbw', label: 'Sentadilla a 2x tu peso corporal', targetValue: 2, exerciseNameMatch: 'sentadilla' },
      ],
    },
  ],
};
