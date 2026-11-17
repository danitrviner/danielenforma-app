import type { WorkoutLog } from '../types.js';
import { mejorSerieValida } from './marcaDeSesion.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que se celebra al cerrar un ejercicio en plena sesión (28-10-2026)

   Dani: que el atleta vea en el momento que va mejorando —«he mejorado tal»,
   «es la primera vez que muevo tanto», «sigo progresando»—, al terminar el
   ejercicio y no al final de los cinco. Mismo criterio de récord que el resto
   de la app: mejor 1RM estimado contra el mejor histórico ANTES de la fecha, y
   sin historial no hay récord (un primer registro no es una mejora).

   Desde el 17-11-2026 (D2) la marca es la de la mejor serie VÁLIDA
   (`marcaDeSesion.ts`: 3-15 repeticiones, RIR 2 o menos, RIR apuntado por el
   atleta, sin bajadas ni miniseries), igual que el récord contra el que se
   compara (`allTimeBestBefore`). Una serie de 20 a RIR 4 ya no es «tu mejor
   marca». El tonelaje sigue contando todo lo levantado.
   ═══════════════════════════════════════════════════════════════════════════ */

interface SerieHecha {
  weight: number | string; repsDone: number | string; rir?: string | number; alFallo?: boolean;
  /** Bajada o miniserie: cuenta en el tonelaje, no puede ser la marca. */
  segmento?: boolean;
  /** `false` = se guardó con el RIR pautado sin tocar: tampoco vale de marca. */
  rirApuntado?: boolean;
}

export type TipoDeLogro = 'record' | 'tonelaje' | 'progreso';

export interface Logro {
  tipo: TipoDeLogro;
  titulo: string;
  detalle: string;
}

const num = (v: number | string) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const kg = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}\u00a0kg`;
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Tonelaje más alto de cada ejercicio en una sola sesión, antes de `fecha`.
 *  Las series hechas fuera de su gimnasio no suman (utils/sesionFuera.ts). */
export function tonelajeMaximoAntesDe(logs: readonly WorkoutLog[], fecha: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of logs) {
    if (log.date >= fecha) continue;
    for (const e of log.entries) {
      const t = e.sets.reduce((s, x) => s + (x.fuera ? 0 : num(x.weight) * num(x.repsDone)), 0);
      if (t > (out.get(e.exerciseId) ?? 0)) out.set(e.exerciseId, t);
    }
  }
  return out;
}

/** La marca de la sesión: su mejor serie válida. Sin ninguna, no hay marca que celebrar. */
const mejorSerie = <T extends SerieHecha>(sets: readonly T[]) => mejorSerieValida(sets);

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
  // Sin ninguna serie válida no hay marca: ni récord ni «sigues progresando».
  // El tonelaje sí se puede celebrar, cuenta todo lo levantado.
  const mejor = mejorSerie(hechas);
  const peso = mejor ? num(mejor.serie.weight) : 0;
  const reps = mejor ? num(mejor.serie.repsDone) : 0;

  if (mejor && mejorRmAntes != null && mejor.rm > mejorRmAntes) {
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
  if (mejor && antes && mejor.rm > antes.rm && !logros.some(l => l.tipo === 'record')) {
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
