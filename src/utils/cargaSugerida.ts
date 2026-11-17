import { WorkoutExercise, WorkoutEntryLog, WorkoutLog } from '../types.js';
import { expandSetGroups } from './setGroups.js';
import { seriesPrincipales } from './tecnicaDeSerie.js';
import type { TipoDeSemana } from './tipoDeSemana.js';

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

/** Una serie ya hecha, en lo que importa para decidir la carga. */
export interface SerieHecha { weight: number; repsDone: number; rir: number; alFallo?: boolean }

/** Lo que toca con una serie que llegó al tope del rango con margen. */
export type Veredicto =
  /** Sube: `peso` es la carga nueva y `reps` el mínimo del rango. */
  | { que: 'subir'; peso: number; reps: number }
  /** El salto es grande: antes de subir, `reps` repeticiones con el mismo `peso`. */
  | { que: 'esperar'; peso: number; reps: number; paso: number };

/**
 * EL criterio de «toca subir», uno solo para toda la app (F7c, 17-11-2026):
 * llegó al tope del rango, con el RIR pautado o más y sin ir al fallo; y si el
 * salto de carga es grande, además con las repeticiones de margen que pide.
 * `null` = se repite la carga.
 *
 * Lo usan la tarjeta de la sesión (`sugerirCarga`) y el reto «toca subir»
 * (retosDeRendimiento). Antes el reto solo miraba las repeticiones: al atleta
 * que llegó al tope yendo al fallo el reto le decía «sube» y la tarjeta, el
 * mismo día, le dejaba el peso de siempre.
 */
export function veredictoDeSerie(
  prev: SerieHecha | undefined, pauta: { reps: string; rir: number }, salto?: number | null,
): Veredicto | null {
  const rango = rangoDeReps(pauta.reps);
  if (!prev || !rango || prev.weight <= 0 || prev.alFallo) return null;
  if (prev.repsDone < rango.max || prev.rir < pauta.rir) return null;
  const paso = salto ?? incrementoDe(prev.weight);
  const extra = repsExtraAntesDeSubir(prev.weight, paso, rango);
  if (prev.repsDone < rango.max + extra) return { que: 'esperar', peso: prev.weight, reps: rango.max + extra, paso };
  return { que: 'subir', peso: Math.round((prev.weight + paso) * 100) / 100, reps: rango.min };
}

/**
 * La serie de la última vez con la que se compara la fila `i` de hoy (F19).
 * Normalmente es la misma serie. Si la última vez hubo menos series que las
 * pautadas hoy (sesión cortada, o venir de una descarga con la mitad), las
 * filas de más toman la última serie con repeticiones en vez de llegar en
 * blanco; lo mismo si esa serie se guardó sin repeticiones. Sin ninguna serie
 * con repeticiones, lo que hubiera en esa posición.
 */
export function serieDeReferencia<T extends { repsDone: number }>(previas: readonly T[], i: number): T | undefined {
  const suya = previas[i];
  if (suya && suya.repsDone > 0) return suya;
  for (let k = previas.length - 1; k >= 0; k--) if (previas[k].repsDone > 0) return previas[k];
  return suya;
}

export function sugerirCarga(
  we: WorkoutExercise, previa: WorkoutEntryLog | undefined,
  /** Salto real del ejercicio (`saltoReal`). Sin él, +1 / +2,5 kg. */
  salto?: number | null,
  /** Semana de descarga, puente o vuelta de parón (`tipoDeSemana`), si lo es. */
  semana?: TipoDeSemana | null,
): CargaSugerida {
  const filas = expandSetGroups(we);
  // F7a: en descarga, puente y vuelta de parón no se sube. La semana es para
  // recuperar o readaptarse, y una frase de «hoy prueba con más» iba justo en
  // contra de lo que el coach ha programado: se repite lo de la última vez.
  if (!previa || semana) return { series: filas.map(() => null), resumen: null };
  const previas = seriesPrincipales(previa.sets);
  // Series que llegaron al tope con margen pero no suben porque el salto es grande.
  let esperando: { peso: number; reps: number; paso: number } | null = null;
  const series = filas.map((fila, i) => {
    const v = veredictoDeSerie(serieDeReferencia(previas, i), fila, salto);
    if (v?.que === 'esperar') esperando ??= { peso: v.peso, reps: v.reps, paso: v.paso };
    return v?.que === 'subir' ? { peso: v.peso, reps: v.reps } : null;
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
  /** Semana de descarga, puente o vuelta de parón (`tipoDeSemana`), si lo es. */
  semana?: TipoDeSemana | null,
): ConsejoEnVivo | null {
  // F7a: en las semanas de aflojar tampoco se pide más peso a mitad de sesión.
  if (semana) return null;
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
    // «Si te sobraba», no «aún te sobraba» (F20b): el RIR llega prerrellenado
    // con el pautado y puede que el atleta ni lo haya tocado. No se afirma algo
    // que quizá no ha dicho.
    texto: `Te has pasado del rango (${reps} reps en ${rangoTxt}). Si te sobraba, sube a ${kg(nuevo)} en la siguiente serie y vemos cómo va.`,
  };
}
