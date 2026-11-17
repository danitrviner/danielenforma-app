import type { Exercise, WeeklyProgressionRule, WorkoutExercise, WorkoutLog } from '../types.js';
import { rangoDeReps } from './cargaSugerida.js';
import { addDays } from './trainingWeek.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Ejercicio nuevo: tres semanas de entrada con más repeticiones (17-11-2026)

   Norma de Dani al programar: un ejercicio que el atleta no conoce se pauta
   primero con un rango de repeticiones más alto —10-12 en los multiarticulares
   y 12-14 en los de aislamiento— y desde la semana 4 pasa, de golpe, al rango
   que el coach pautó para ese ejercicio (su 8-9 o 7-9). Así aprende el
   recorrido con cargas manejables antes de apretar.

   Decisiones de Dani (17-11):
    · «Nuevo» = no lo ha hecho nunca, o no lo hace desde hace más de 8 semanas.
    · Semanas 1-3 en el rango de entrada; desde la 4, el pautado. No escalonado.
    · Aislamiento empieza en 12-14; multiarticular en 10-12.

   Aquí solo está la lógica pura. Las reglas salen como cambios por semana
   (`WeeklyProgressionRule.cambios`), en VUELTAS DE CICLO (la S de la barra de
   semanas), y solo tocan el rango de repeticiones: ni series ni RIR. Así se
   ven en la barra de semanas y el coach las puede tocar como cualquier otra.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Días sin hacerlo a partir de los cuales vuelve a contar como nuevo (8 semanas). */
export const DIAS_PARA_VOLVER_A_SER_NUEVO = 56;
/** Semanas (vueltas de ciclo) con el rango de entrada. */
export const SEMANAS_DE_ENTRADA = 3;
export const RANGO_ENTRADA_MULTIARTICULAR = '10-12';
export const RANGO_ENTRADA_AISLAMIENTO = '12-14';

/** Lo que hace falta del registro para saber si un ejercicio se ha hecho. */
type RegistroParaNuevo = Pick<WorkoutLog, 'date' | 'entries'>;

/** Última fecha (AAAA-MM-DD) en que hizo el ejercicio con alguna repetición, antes de `antesDe`. */
export function ultimaVezQueLoHizo(exerciseId: string, logs: readonly RegistroParaNuevo[], antesDe: string): string | null {
  let ultima: string | null = null;
  for (const log of logs) {
    if (!log.date || log.date >= antesDe) continue;
    const hecho = log.entries?.some(e => e.exerciseId === exerciseId && e.sets?.some(s => (s.repsDone ?? 0) > 0));
    if (hecho && (!ultima || log.date > ultima)) ultima = log.date;
  }
  return ultima;
}

/**
 * ¿Es nuevo para el atleta en un bloque que empieza el `inicio`? Sí si no lo ha
 * hecho nunca o si la última vez fue hace más de 8 semanas.
 */
export function esEjercicioNuevo(exerciseId: string, logs: readonly RegistroParaNuevo[], inicio: string): boolean {
  const ultima = ultimaVezQueLoHizo(exerciseId, logs, inicio);
  return !ultima || ultima < addDays(inicio, -DIAS_PARA_VOLVER_A_SER_NUEVO);
}

/** Los ids de un bloque que son nuevos para el atleta (sin repetir, en el orden en que aparecen). */
export function ejerciciosNuevosDelBloque(
  exerciseIds: readonly string[], logs: readonly RegistroParaNuevo[], inicio: string,
): string[] {
  return [...new Set(exerciseIds)].filter(id => esEjercicioNuevo(id, logs, inicio));
}

// ── Aislamiento o multiarticular ─────────────────────────────────────────────
// El catálogo no lo dice: sale del nombre. Ante la duda, multiarticular (10-12),
// que es el rango de entrada más prudente para un ejercicio pesado.

type DatosDeEjercicio = Pick<Exercise, 'name'> & Partial<Pick<Exercise, 'muscleGroup'>>;

const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Palabras que delatan un movimiento de una sola articulación.
const AISLAMIENTO = /\b(curl|extension(es)?|elevacion(es)?|raises?|aperturas?|pajaros?|vuelos?|fly|flyes|flys|cruces?|crossovers?|patadas?|kick ?backs?|frances|rompecraneos|skull\w*|push ?downs?|press ?down|pull ?overs?|encogimientos?|shrugs?|gemelos?|talones|calf|calves|abduccion(es)?|aduccion(es)?|abductor(es)?|aductor(es)?|crunch(es)?|encogimiento abdominal|face ?pulls?|y raises?)\b/;
// Pero estos son multiarticulares aunque lleven una de esas palabras: el
// curl nórdico y el peso muerto con extensión de cadera siguen siendo pesados.
const MULTIARTICULAR = /\b(peso muerto|deadlifts?|sentadillas?|squats?|prensa|leg press|zancadas?|lunges?|bulgaras?|hip thrusts?|press (banca|militar|inclinado|declinado|plano)|remos?|rows?|dominadas?|pull ?ups?|chin ?ups?|jalon(es)? (al pecho|tras nuca)|fondos?|dips?|curl nordico)\b/;
// Grupos que, sin más dato, son de aislamiento.
const GRUPOS_DE_AISLAMIENTO = new Set(['biceps', 'antebrazo', 'gemelo', 'deltoide_lat', 'core']);

/** ¿Ejercicio de aislamiento? Por el nombre y, si el nombre no dice nada, por el grupo. */
export function esAislamiento(ex: DatosDeEjercicio | null | undefined): boolean {
  if (!ex) return false;
  const n = normalizar(ex.name ?? '');
  // El gemelo es aislamiento aunque se haga en la prensa o en la máquina de sentadilla.
  if (/\b(gemelos?|talones|calf|calves|soleo)\b/.test(n)) return true;
  if (MULTIARTICULAR.test(n)) return false;
  if (AISLAMIENTO.test(n)) return true;
  return !!ex.muscleGroup && GRUPOS_DE_AISLAMIENTO.has(ex.muscleGroup);
}

/** El rango de entrada de un ejercicio nuevo. */
export function rangoDeEntrada(ex: DatosDeEjercicio | null | undefined): string {
  return esAislamiento(ex) ? RANGO_ENTRADA_AISLAMIENTO : RANGO_ENTRADA_MULTIARTICULAR;
}

// ── Las reglas ───────────────────────────────────────────────────────────────

export type SinRampa =
  /** El ejercicio pautado lleva varios bloques de series (`setGroups`): cada uno
   *  tiene su rango y una regla de un solo rango los aplastaría. */
  | 'bloques_de_series'
  /** Las repeticiones no son un número ni un rango («AMRAP», vacío). */
  | 'reps_sin_rango'
  /** El rango pautado ya es igual de alto o más que el de entrada. */
  | 'ya_es_alto'
  /** Ya tiene cambios de repeticiones programados en las semanas de entrada:
   *  manda lo que puso el coach. */
  | 'ya_programado';

export interface RampaDeEntrada {
  reglas: WeeklyProgressionRule[];
  /** Rango de entrada (semanas 1-3) y el que vuelve a mandar desde la 4. */
  entrada: string;
  pautado: string;
}

/**
 * Las dos reglas de la entrada de un ejercicio nuevo: desde la semana 1, el
 * rango de entrada; desde la 4, el rango pautado. `null` (con el motivo) si no
 * toca: ver `SinRampa`.
 *
 * El rango pautado es el de la BASE del ejercicio (`we.reps`), no el de una
 * semana resuelta: es lo que el coach eligió para él.
 */
export function reglasDeEntrada(
  we: Pick<WorkoutExercise, 'reps' | 'setGroups' | 'weeklyProgression'>,
  ex: DatosDeEjercicio | null | undefined,
): RampaDeEntrada | { sinRampa: SinRampa } {
  if (we.setGroups && we.setGroups.length > 1) return { sinRampa: 'bloques_de_series' };
  const pautado = rangoDeReps(we.reps ?? '');
  if (!pautado) return { sinRampa: 'reps_sin_rango' };
  const entrada = rangoDeEntrada(ex);
  const rangoEntrada = rangoDeReps(entrada)!;
  if (pautado.min >= rangoEntrada.min) return { sinRampa: 'ya_es_alto' };
  const yaProgramado = (we.weeklyProgression ?? []).some(r =>
    r.atWeek <= SEMANAS_DE_ENTRADA + 1 && (r.cambios?.reps !== undefined || r.addReps !== undefined));
  if (yaProgramado) return { sinRampa: 'ya_programado' };
  return {
    entrada,
    pautado: we.reps,
    reglas: [
      { atWeek: 1, cambios: { reps: entrada } },
      { atWeek: SEMANAS_DE_ENTRADA + 1, cambios: { reps: we.reps } },
    ],
  };
}

/** ¿Lleva ya la entrada de ejercicio nuevo? (Para no ponerla dos veces.) */
export function tieneRampaDeEntrada(we: Pick<WorkoutExercise, 'weeklyProgression'>): boolean {
  const reglas = we.weeklyProgression ?? [];
  const primera = reglas.find(r => r.atWeek === 1 && r.cambios?.reps !== undefined);
  return !!primera && [RANGO_ENTRADA_MULTIARTICULAR, RANGO_ENTRADA_AISLAMIENTO].includes(primera.cambios!.reps!)
    && reglas.some(r => r.atWeek === SEMANAS_DE_ENTRADA + 1 && r.cambios?.reps !== undefined);
}

/**
 * El ejercicio con la entrada puesta si es nuevo y le toca; si no, tal cual.
 * Las reglas nuevas se añaden a las que ya tuviera, ordenadas por semana.
 */
export function conRampaDeEntrada<T extends Pick<WorkoutExercise, 'reps' | 'setGroups' | 'weeklyProgression'>>(
  we: T, ex: DatosDeEjercicio | null | undefined, esNuevo: boolean,
): T {
  if (!esNuevo || tieneRampaDeEntrada(we)) return we;
  const r = reglasDeEntrada(we, ex);
  if ('sinRampa' in r) return we;
  const weeklyProgression = [...(we.weeklyProgression ?? []), ...r.reglas].sort((a, b) => a.atWeek - b.atWeek);
  return { ...we, weeklyProgression };
}
