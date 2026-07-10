import { WorkoutTechnique } from '../types';

// Emoji instead of material-symbols so the badge always renders regardless of
// icon-font glyph coverage (the app already does this for gamification badges,
// see ProfileScreen.tsx) — and 💀 is what was explicitly asked for on AMRAP.
export const TECHNIQUE_EMOJI: Record<WorkoutTechnique, string> = {
  amrap:     '💀',
  dropset:   '⬇️',
  myoreps:   '🔄',
  restpause: '⏸️',
};

export const TECHNIQUE_LABEL: Record<WorkoutTechnique, string> = {
  amrap:     'AMRAP',
  dropset:   'Drop-set',
  myoreps:   'Myo-reps',
  restpause: 'Rest-pause',
};

export const TECHNIQUE_COLOR: Record<WorkoutTechnique, string> = {
  amrap:     'text-red-400 border-red-500/30 bg-red-500/10',
  dropset:   'text-orange-400 border-orange-500/30 bg-orange-500/10',
  myoreps:   'text-violet-400 border-violet-500/30 bg-violet-500/10',
  restpause: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
};

export const TECHNIQUE_DESCRIPTION: Record<WorkoutTechnique, string> = {
  amrap:
    '"As Many Reps As Possible". En esta serie, haz todas las repeticiones que puedas con buena técnica hasta el fallo (o muy cerca de él).',
  dropset:
    'Al llegar al fallo (o casi), baja el peso un 20-30% sin descansar y sigue hasta el fallo de nuevo. Se puede repetir 1-2 veces más bajando el peso cada vez.',
  myoreps:
    'Haz una serie de activación hasta cerca del fallo, descansa 15-20s, y encadena varias mini-series de 3-5 repeticiones con el mismo peso hasta que no puedas completar el mínimo.',
  restpause:
    'Al llegar al fallo, descansa 10-15s respirando (sin soltar el peso si es posible) y haz unas repeticiones más. Repite 1-2 veces más.',
};

export const TECHNIQUES: WorkoutTechnique[] = ['amrap', 'dropset', 'myoreps', 'restpause'];
