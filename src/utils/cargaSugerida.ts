import { WorkoutExercise, WorkoutEntryLog, WorkoutLog } from '../types.js';
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

/* ── El salto REAL de carga (P12, 11-11-2026) ────────────────────────────────
   +1 / +2,5 kg es una suposición. En una máquina de placas de 5 en 5, o con
   mancuernas de 2 en 2, el salto de verdad es otro, y se ve en los pesos que
   el atleta ha ido usando en ese ejercicio. Cuando el salto es grande frente a
   lo que mueve (laterales de 8 a 10 kg son un 25 %), subir al llegar al tope
   del rango es pedirle un imposible: primero se abre el rango (dos
   repeticiones más con el mismo peso) y luego se sube. Doctrina §10. */

/**
 * Margen de repeticiones que pide cada salto (doctrina §10): 2-4 % → 2 reps ·
 * 5-9 % → 4 · 9-14 % → 6 · 15 % o más → 8. Si el rango pautado ya es así de
 * ancho, se sube al llegar al tope, como siempre; si es más estrecho, faltan
 * repeticiones por encima del tope antes de subir.
 */
export function repsExtraAntesDeSubir(peso: number, paso: number, rango: { min: number; max: number }): number {
  const pct = paso / peso;
  const margen = pct >= 0.15 ? 8 : pct >= 0.09 ? 6 : pct >= 0.05 ? 4 : 2;
  return Math.max(0, margen - (rango.max - rango.min));
}

/**
 * El salto de carga que el atleta usa de verdad en un ejercicio: la diferencia
 * más repetida entre pesos consecutivos de su historial (a igualdad, la menor).
 * `null` si solo ha usado un peso: no hay con qué saberlo.
 */
export function saltoReal(logs: readonly Pick<WorkoutLog, 'entries'>[], exerciseId: string): number | null {
  const pesos = new Set<number>();
  for (const log of logs) {
    for (const e of log.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of seriesPrincipales(e.sets)) if (s.weight > 0) pesos.add(s.weight);
    }
  }
  const orden = [...pesos].sort((a, b) => a - b);
  const veces = new Map<number, number>();
  for (let i = 1; i < orden.length; i++) {
    const d = Math.round((orden[i] - orden[i - 1]) * 100) / 100;
    if (d >= 0.5) veces.set(d, (veces.get(d) ?? 0) + 1);
  }
  if (veces.size === 0) return null;
  return [...veces.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export interface SerieSugerida { peso: number; reps: number }

export interface CargaSugerida {
  /** Por serie (mismo orden que `expandSetGroups`): la carga a usar hoy, o null si se repite. */
  series: (SerieSugerida | null)[];
  /** Frase para el atleta, o null si no hay nada que subir. */
  resumen: string | null;
}

const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`;

export function sugerirCarga(
  we: WorkoutExercise, previa: WorkoutEntryLog | undefined,
  /** Salto real del ejercicio (`saltoReal`). Sin él, +1 / +2,5 kg. */
  salto?: number | null,
): CargaSugerida {
  const filas = expandSetGroups(we);
  if (!previa) return { series: filas.map(() => null), resumen: null };
  const previas = seriesPrincipales(previa.sets);
  // Series que llegaron al tope con margen pero no suben porque el salto es grande.
  let esperando: { peso: number; reps: number; paso: number } | null = null;
  const series = filas.map((fila, i) => {
    const prev = previas[i];
    const rango = rangoDeReps(fila.reps);
    if (!prev || !rango || prev.weight <= 0 || prev.alFallo) return null;
    if (prev.repsDone < rango.max || prev.rir < fila.rir) return null;
    const paso = salto ?? incrementoDe(prev.weight);
    const extra = repsExtraAntesDeSubir(prev.weight, paso, rango);
    if (prev.repsDone < rango.max + extra) {
      esperando ??= { peso: prev.weight, reps: rango.max + extra, paso };
      return null;
    }
    return { peso: Math.round((prev.weight + paso) * 100) / 100, reps: rango.min };
  });
  const suben = series.filter((s): s is SerieSugerida => s !== null);
  if (suben.length === 0) {
    const e = esperando as { peso: number; reps: number; paso: number } | null;
    return {
      series,
      resumen: e
        ? `Llegaste al tope con margen, pero el siguiente peso son ${kg(e.paso)} más de golpe. Antes de subir, llega a ${e.reps} repeticiones con ${kg(e.peso)}.`
        : null,
    };
  }
  const pesos = [...new Set(suben.map(s => s.peso))];
  // En la voz del coach, no de la app (Dani, 28-10-2026): el atleta lo lee
  // como un consejo suyo, y por eso se hace más caso.
  const resumen = suben.length === filas.length && pesos.length === 1
    ? `La última vez llegaste al tope de repeticiones con margen. Hoy quiero que pruebes con ${kg(pesos[0])} y vemos cómo va. Es normal que salgan menos repeticiones que la última vez.`
    : `En ${suben.length} de ${filas.length} series llegaste al tope con margen. Ahí te he subido el peso: pruébalo y vemos cómo va. Es normal que salgan menos repeticiones.`;
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
  salto?: number | null,
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
  const paso = salto ?? incrementoDe(peso);
  // Con un salto grande, pasarse por poco del rango no basta para subir.
  if (reps < rango.max + repsExtraAntesDeSubir(peso, paso, rango)) return null;
  const nuevo = Math.round((peso + paso) * 100) / 100;
  if ((parseFloat(proxima.s.weight) || 0) >= nuevo) return null;
  const rangoTxt = rango.min === rango.max ? `${rango.max}` : `${rango.min}-${rango.max}`;
  return {
    serie: proxima.i,
    peso: nuevo,
    texto: `Te has pasado del rango (${reps} reps en ${rangoTxt}) y aún te sobraba. Sube a ${kg(nuevo)} en la siguiente serie y vemos cómo va.`,
  };
}
