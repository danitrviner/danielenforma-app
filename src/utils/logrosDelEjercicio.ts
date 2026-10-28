import type { WorkoutLog } from '../types';
import { rmDeSerie } from './oneRepMax';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que se celebra al cerrar un ejercicio en plena sesión (28-10-2026)

   Dani: que el atleta vea en el momento que va mejorando —«he mejorado tal»,
   «es la primera vez que muevo tanto», «sigo progresando»—, al terminar el
   ejercicio y no al final de los cinco. Mismo criterio de récord que el resto
   de la app: mejor 1RM estimado contra el mejor histórico ANTES de la fecha, y
   sin historial no hay récord (un primer registro no es una mejora).
   ═══════════════════════════════════════════════════════════════════════════ */

interface SerieHecha { weight: number | string; repsDone: number | string; rir?: string | number; alFallo?: boolean }

export type TipoDeLogro = 'record' | 'tonelaje' | 'progreso';

export interface Logro {
  tipo: TipoDeLogro;
  titulo: string;
  detalle: string;
}

const num = (v: number | string) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}\u00a0kg`;
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Tonelaje más alto de cada ejercicio en una sola sesión, antes de `fecha`. */
export function tonelajeMaximoAntesDe(logs: readonly WorkoutLog[], fecha: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of logs) {
    if (log.date >= fecha) continue;
    for (const e of log.entries) {
      const t = e.sets.reduce((s, x) => s + num(x.weight) * num(x.repsDone), 0);
      if (t > (out.get(e.exerciseId) ?? 0)) out.set(e.exerciseId, t);
    }
  }
  return out;
}

function mejorSerie<T extends SerieHecha>(sets: readonly T[]): { serie: T; rm: number } | null {
  let mejor: { serie: T; rm: number } | null = null;
  for (const s of sets) {
    const rm = rmDeSerie(s);
    if (rm > 0 && (!mejor || rm > mejor.rm)) mejor = { serie: s, rm };
  }
  return mejor;
}

/**
 * Lo conseguido en el ejercicio, de más a menos importante. Vacío si no hay
 * nada que celebrar — no se celebra por celebrar.
 */
export function logrosDelEjercicio(params: {
  nombre: string;
  /** Solo las filas marcadas como hechas (bajadas y miniseries incluidas: ese peso se levantó). */
  hechas: readonly SerieHecha[];
  mejorRmAntes: number | undefined;
  tonelajeMaxAntes: number | undefined;
  /** Las series de la última vez que hizo este ejercicio. */
  ultimaVez: readonly SerieHecha[] | undefined;
}): Logro[] {
  const { nombre, hechas, mejorRmAntes, tonelajeMaxAntes, ultimaVez } = params;
  const logros: Logro[] = [];
  const mejor = mejorSerie(hechas);
  if (!mejor) return logros;
  const peso = num(mejor.serie.weight);
  const reps = num(mejor.serie.repsDone);

  if (mejorRmAntes != null && mejor.rm > mejorRmAntes) {
    logros.push({ tipo: 'record', titulo: '¡Récord personal!', detalle: `${kg(peso)} × ${reps} — tu mejor marca en ${nombre}` });
  }

  const tonelaje = hechas.reduce((s, x) => s + num(x.weight) * num(x.repsDone), 0);
  if (tonelajeMaxAntes != null && tonelajeMaxAntes > 0 && tonelaje > tonelajeMaxAntes) {
    logros.push({
      tipo: 'tonelaje',
      titulo: 'Nunca habías movido tanto',
      detalle: `${miles(tonelaje)}\u00a0kg en ${nombre} (tu máximo era ${miles(tonelajeMaxAntes)})`,
    });
  }

  const antes = ultimaVez ? mejorSerie(ultimaVez) : null;
  if (antes && mejor.rm > antes.rm && !logros.some(l => l.tipo === 'record')) {
    const pesoAntes = num(antes.serie.weight);
    const repsAntes = num(antes.serie.repsDone);
    const detalle = peso > pesoAntes
      ? `+${kg(peso - pesoAntes)} en tu mejor serie respecto a la última vez`
      : peso === pesoAntes && reps > repsAntes
        ? `+${reps - repsAntes} ${reps - repsAntes === 1 ? 'rep' : 'reps'} con ${kg(peso)} respecto a la última vez`
        : 'Tu mejor serie supera a la de la última vez';
    logros.push({ tipo: 'progreso', titulo: 'Sigues progresando', detalle });
  }

  return logros;
}
