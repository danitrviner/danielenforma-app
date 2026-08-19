import { Workout, WorkoutEntryLog } from '../types';
import { expandSetGroups } from './setGroups';

/** Fila de entrada del editor de series — mismo shape que `SetInput` en
 * TrainingScreen.tsx, extraído aquí para poder testear el prerelleno sin
 * montar el componente completo. */
export interface SetPrefill {
  weight: string;
  repsDone: string;
  rir: string; // '0'-'5' o 'fallo'
  done: boolean;
}

/**
 * Fase 3 (decisión de Dani, 2026-08-07 — "Registro editable en la sesión"):
 * la tabla llega PRERRELLENADA con lo del último día, no vacía con el dato
 * anterior solo como referencia. Regla de prerelleno (Contrato-de-datos.md):
 * los valores por defecto salen de la última sesión del mismo `exerciseId`
 * con el mismo número de serie; si no hay histórico, se usa `reps`/`rir` de
 * la prescripción y la carga queda vacía (no hay peso previo que sugerir).
 */
export function prefillWorkoutSets(workout: Workout, prevEntries: WorkoutEntryLog[]): SetPrefill[][] {
  return workout.exercises
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(we => {
      const prevEntry = prevEntries.find(e => e.exerciseId === we.exerciseId);
      return expandSetGroups(we).map((row, sIdx) => {
        const prev = prevEntry?.sets[sIdx];
        return {
          weight: prev && prev.weight > 0 ? String(prev.weight) : '',
          repsDone: prev && prev.repsDone > 0 ? String(prev.repsDone) : '',
          rir: prev ? (prev.alFallo ? 'fallo' : String(prev.rir)) : String(row.rir),
          done: false,
        };
      });
    });
}
