import { WorkoutExercise, WorkoutEntryLog } from '../types.js';
import { expandSetGroups } from './setGroups.js';
import { seriesPrincipales } from './tecnicaDeSerie.js';

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
  const previas = seriesPrincipales(previa.sets);
  const series = filas.map((fila, i) => {
    const prev = previas[i];
    const rango = rangoDeReps(fila.reps);
    if (!prev || !rango || prev.weight <= 0 || prev.alFallo) return null;
    if (prev.repsDone < rango.max || prev.rir < fila.rir) return null;
    return { peso: Math.round((prev.weight + incrementoDe(prev.weight)) * 100) / 100, reps: rango.min };
  });
  const suben = series.filter((s): s is SerieSugerida => s !== null);
  if (suben.length === 0) return { series, resumen: null };
  const pesos = [...new Set(suben.map(s => s.peso))];
  // En la voz del coach, no de la app (Dani, 28-10-2026): el atleta lo lee
  // como un consejo suyo, y por eso se hace más caso.
  const resumen = suben.length === filas.length && pesos.length === 1
    ? `La última vez llegaste al tope de repeticiones con margen. Hoy quiero que pruebes con ${kg(pesos[0])} y vemos cómo va.`
    : `En ${suben.length} de ${filas.length} series llegaste al tope con margen. Ahí te he subido el peso: pruébalo y vemos cómo va.`;
  return { series, resumen };
}

export interface ConsejoEnVivo {
  /** Índice de la serie a la que se refiere (la siguiente sin hacer). */
  serie: number;
  peso: number;
  texto: string;
}

/**
 * Consejo en plena sesión: si la última serie marcada pasó del tope del rango
 * con el esfuerzo pautado (su RIR igual o mayor que el del coach, sin fallo),
 * la siguiente pide más peso. Es lo que diría el coach al lado del banco, en
 * vez de esperar a la semana que viene. `null` si no toca decir nada o si la
 * siguiente ya lleva ese peso o más.
 */
export function consejoEnVivo(
  we: Pick<WorkoutExercise, 'sets' | 'reps' | 'rir' | 'setGroups'>,
  sets: readonly { weight: string; repsDone: string; rir: string; done: boolean; segmento?: boolean }[],
): ConsejoEnVivo | null {
  const filas = expandSetGroups(we);
  const principales = sets.map((s, i) => ({ s, i })).filter(x => !x.s.segmento);
  const siguiente = principales.findIndex(x => !x.s.done);
  if (siguiente <= 0) return null;
  const hecha = principales[siguiente - 1].s;
  const proxima = principales[siguiente];
  const rango = rangoDeReps(filas[siguiente - 1]?.reps ?? '');
  const peso = parseFloat(hecha.weight);
  const reps = parseInt(hecha.repsDone, 10);
  if (!rango || !(peso > 0) || !(reps > rango.max) || hecha.rir === 'fallo') return null;
  if (Number(hecha.rir) < (filas[siguiente - 1]?.rir ?? 0)) return null;
  const nuevo = Math.round((peso + incrementoDe(peso)) * 100) / 100;
  if ((parseFloat(proxima.s.weight) || 0) >= nuevo) return null;
  const rangoTxt = rango.min === rango.max ? `${rango.max}` : `${rango.min}-${rango.max}`;
  return {
    serie: proxima.i,
    peso: nuevo,
    texto: `Te has pasado del rango (${reps} reps en ${rangoTxt}) y aún te sobraba. Sube a ${kg(nuevo)} en la siguiente serie y vemos cómo va.`,
  };
}
