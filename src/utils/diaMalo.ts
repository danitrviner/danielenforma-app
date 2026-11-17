import type { WorkoutEntryLog, WorkoutLog, WorkoutSetLog } from '../types.js';
import { seriesPrincipales } from './seriesPrincipales.js';
import { incrementoDe } from './cargaSugerida.js';
import { sinSesionesFuera } from './sesionFuera.js';

/* ═══════════════════════════════════════════════════════════════════════════
   El día malo (F1, 11-11-2026)

   Si la primera serie del ejercicio sale con 2 repeticiones menos que la
   última vez —mismo peso, esfuerzo parecido—, hoy el atleta viene más justo.
   Forzar el plan tal cual solo consigue series peores. Se le propone el ajuste
   más pequeño: un poco menos de peso (o una repetición más de margen) y quitar
   la última serie. Mañana, el plan de siempre.

   Una sesión así no significa nada. Dos seguidas en el mismo ejercicio ya son
   un patrón, y eso es cosa del coach (`diasMalosSeguidos`).

   Los umbrales (2 repeticiones, 2 sesiones) son criterio práctico, no una
   frontera medida en ningún estudio.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Repeticiones de menos en la primera serie a partir de las cuales se habla de día malo. */
export const REPS_DE_MENOS = 2;
/** Sesiones seguidas empezando peor a partir de las cuales se avisa al coach. */
export const DIAS_MALOS_PARA_AVISAR = 2;
/** Bajada de peso que se propone, en fracción (entre el 5 y el 10 %). */
const BAJADA = 0.075;

type Serie = Pick<WorkoutSetLog, 'weight' | 'repsDone' | 'rir' | 'alFallo'>;

/** ¿La primera serie de hoy es claramente peor que la de la última vez, en lo mismo? */
export function esPeorQueLaUltimaVez(hoy: Serie | undefined, antes: Serie | undefined): boolean {
  if (!hoy || !antes) return false;
  if (!(hoy.weight > 0) || hoy.weight !== antes.weight) return false;
  // Si hoy ha parado con MÁS margen que la otra vez, hacer menos reps no es rendir peor.
  const rirHoy = hoy.alFallo ? 0 : hoy.rir;
  const rirAntes = antes.alFallo ? 0 : antes.rir;
  if (rirHoy > rirAntes) return false;
  return hoy.repsDone > 0 && hoy.repsDone <= antes.repsDone - REPS_DE_MENOS;
}

/** Redondea al salto real de carga: 1 kg por debajo de 20 kg, 2,5 kg por encima. */
function redondear(kg: number): number {
  const paso = incrementoDe(kg);
  return Math.max(paso, Math.round(kg / paso) * paso);
}

export interface ConsejoDeDiaMalo {
  /** Peso propuesto para las series que quedan. */
  peso: number;
  /** Índices (en la tabla del player) de las series principales que quedan por hacer. */
  seriesPendientes: number[];
  texto: string;
}

/**
 * Consejo en plena sesión tras la PRIMERA serie. `null` si no toca: no hay
 * sesión anterior, no es comparable, ya se ha hecho más de una serie o no
 * queda ninguna por hacer.
 */
export function consejoDeDiaMalo(
  sets: readonly { weight: string; repsDone: string; rir: string; done: boolean; segmento?: boolean }[],
  previa: Pick<WorkoutEntryLog, 'sets'> | undefined,
): ConsejoDeDiaMalo | null {
  if (!previa) return null;
  const principales = sets.map((s, i) => ({ s, i })).filter(x => !x.s.segmento);
  const hechas = principales.filter(x => x.s.done);
  // Solo justo después de la primera: con dos series hechas ya se ve solo.
  if (hechas.length !== 1 || hechas[0].i !== principales[0]?.i) return null;
  const pendientes = principales.filter(x => !x.s.done);
  if (pendientes.length === 0) return null;

  const hoy: Serie = {
    weight: parseFloat(hechas[0].s.weight) || 0,
    repsDone: parseInt(hechas[0].s.repsDone, 10) || 0,
    rir: hechas[0].s.rir === 'fallo' ? 0 : Number(hechas[0].s.rir) || 0,
    alFallo: hechas[0].s.rir === 'fallo',
  };
  const antes = seriesPrincipales(previa.sets)[0];
  if (!esPeorQueLaUltimaVez(hoy, antes)) return null;

  const peso = redondear(hoy.weight * (1 - BAJADA));
  const kg = peso.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const quitar = pendientes.length >= 2 ? ' y te quitas la última serie' : '';
  return {
    peso,
    seriesPendientes: pendientes.map(x => x.i),
    texto: `Hoy vienes más justo: ${hoy.repsDone} reps donde la última vez hiciste ${antes.repsDone}. No pasa nada, es un día. `
      + `Baja a ${kg} kg en lo que queda${quitar}. La próxima vez, el plan de siempre.`,
  };
}

/**
 * Sesiones SEGUIDAS (las más recientes) en las que la primera serie del
 * ejercicio salió claramente peor que la de la sesión anterior. 2 o más es un
 * patrón que merece que el coach lo mire. Las sesiones fuera de su gimnasio no
 * cuentan: con otras máquinas, sacar menos no es un día malo.
 */
export function diasMalosSeguidos(logs: readonly WorkoutLog[], exerciseId: string): number {
  const primeras = sinSesionesFuera(logs)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(l => l.entries.find(e => e.exerciseId === exerciseId))
    .filter((e): e is WorkoutEntryLog => !!e)
    .map(e => seriesPrincipales(e.sets)[0])
    .filter((s): s is WorkoutSetLog => !!s);
  let n = 0;
  for (let i = 0; i + 1 < primeras.length; i++) {
    if (!esPeorQueLaUltimaVez(primeras[i], primeras[i + 1])) break;
    n++;
  }
  return n;
}
