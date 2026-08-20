import { WorkoutTechnique } from '../types';

// Emoji instead of material-symbols so la insignia siempre se ve, sin
// depender de que la fuente de iconos haya cargado ya (mismo patrón que la
// gamificación de ProfileScreen.tsx) — 💀 es lo que pidió Dani para AMRAP.
export const TECHNIQUE_EMOJI: Record<WorkoutTechnique, string> = {
  amrap:     '💀',
  dropset:   '⬇️',
  myoreps:   '🔄',
  restpause: '⏸️',
  fallo:     '🔥',
};

export const TECHNIQUE_LABEL: Record<WorkoutTechnique, string> = {
  amrap:     'AMRAP',
  dropset:   'Drop-set',
  myoreps:   'Myo-reps',
  restpause: 'Rest-pause',
  fallo:     'Al fallo',
};

/**
 * Fase 3: tokens del DS en vez de los colores de Tailwind sueltos (red-400,
 * orange-400, violet-400, blue-400) que llevaba antes — la escala de estado
 * del sistema no tiene un tono por técnica, así que se reparten los cuatro
 * disponibles. AMRAP y FALLO comparten `danger`: son la misma familia de
 * intensidad ("hasta que no puedas más"), el emoji y la etiqueta ya los
 * distinguen. `restpause` usaba `data` (cian) como quinto tono de necesidad
 * — el handoff de Fase 3 lo reserva a zonas de frecuencia cardíaca y no
 * fuera de ahí (`src/index.css`), así que pasa a `neutral`: encaja incluso
 * mejor con lo que es la técnica (pausas cortas controladas, no un extremo
 * de intensidad como las otras cuatro).
 */
export const TECHNIQUE_COLOR: Record<WorkoutTechnique, string> = {
  amrap:     'text-danger border-danger/30 bg-danger/10',
  dropset:   'text-warning border-warning/30 bg-warning/10',
  myoreps:   'text-info border-info/30 bg-info/10',
  restpause: 'text-ink-2 border-hairline bg-raised',
  fallo:     'text-danger border-danger/30 bg-danger/10',
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
  fallo:
    'Serie a fallo real: sigue hasta que la técnica se rompa, no hasta un número de repeticiones prefijado.',
};

export const TECHNIQUES: WorkoutTechnique[] = ['amrap', 'dropset', 'myoreps', 'restpause', 'fallo'];
