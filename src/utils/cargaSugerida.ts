import { WorkoutExercise, WorkoutEntryLog } from '../types';
import { expandSetGroups } from './setGroups';

/* Doble progresión: se sube la carga cuando el atleta llegó al TOPE del rango
   de repeticiones con el esfuerzo pautado (su RIR igual o mayor que el del
   coach, sin fallo). Si no llegó, se repite la carga y se busca una rep más.
   Es lo que el coach haría mirando la sesión anterior; aquí la tabla ya llega
   con ese peso puesto y una frase que dice por qué. */

export function rangoDeReps(reps: string): { min: number; max: number } | null {
  const nums = (reps.match(/\d+/g) ?? []).map(Number).filter(n => n > 0);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** +1 kg en cargas pequeñas (mancuernas ligeras, poleas), +2,5 kg a partir de 20 kg. */
export function incrementoDe(peso: number): number {
  return peso < 20 ? 1 : 2.5;
}

export interface SerieSugerida { peso: number; reps: number }

export interface CargaSugerida {
  /** Por serie (mismo orden que `expandSetGroups`): la carga a usar hoy, o null si se repite. */
  series: (SerieSugerida | null)[];
  /** Frase para el atleta, o null si no hay nada que subir. */
  resumen: string | null;
}

const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;

export function sugerirCarga(we: WorkoutExercise, previa: WorkoutEntryLog | undefined): CargaSugerida {
  const filas = expandSetGroups(we);
  if (!previa) return { series: filas.map(() => null), resumen: null };
  const series = filas.map((fila, i) => {
    const prev = previa.sets[i];
    const rango = rangoDeReps(fila.reps);
    if (!prev || !rango || prev.weight <= 0 || prev.alFallo) return null;
    if (prev.repsDone < rango.max || prev.rir < fila.rir) return null;
    return { peso: Math.round((prev.weight + incrementoDe(prev.weight)) * 100) / 100, reps: rango.min };
  });
  const suben = series.filter((s): s is SerieSugerida => s !== null);
  if (suben.length === 0) return { series, resumen: null };
  const pesos = [...new Set(suben.map(s => s.peso))];
  const resumen = suben.length === filas.length && pesos.length === 1
    ? `Sube a ${kg(pesos[0])}: la última vez llegaste al tope de repeticiones con margen.`
    : `Sube la carga en ${suben.length} de ${filas.length} series: ahí llegaste al tope de repeticiones con margen.`;
  return { series, resumen };
}
