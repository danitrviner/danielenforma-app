import type { Exercise, Workout, WorkoutExercise, WorkoutLog } from '../types.js';
import { rangoDeReps } from './cargaSugerida.js';
import { addDays } from './trainingWeek.js';
import {
  RANGO_ENTRADA_AISLAMIENTO, RANGO_ENTRADA_MULTIARTICULAR, SEMANAS_DE_ENTRADA,
  conRampaDeEntrada, esEjercicioNuevo, tieneRampaDeEntrada,
} from './rampaDeEjercicioNuevo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   La norma de ejercicio nuevo, enchufada a las rutinas (17-11-2026)

   La norma y sus reglas viven en `rampaDeEjercicioNuevo.ts`. Aquí está lo que
   necesitan quienes ESCRIBEN rutinas —el editor del mesociclo y el asistente—
   para aplicarla igual en todas partes:

    · ponerla a los ejercicios de una rutina con los registros del atleta;
    · quitarla de un ejercicio (el coach decide que no la quiere) y el texto de
      la marca que la enseña en la fila;
    · mantenerla al día cuando el coach cambia el rango de la base;
    · dejar anotado que una rutina se creó SIN poder mirar los registros (el
      asistente al aprobar una propuesta), para que el editor se la ponga al
      abrir el bloque.

   Sin registros no se decide nada: «no he podido leerlos» no es «no ha hecho
   nunca el ejercicio», y tratarlo igual pondría la entrada a toda la rutina.

   Y con el bloque ya pasado de su semana 3 tampoco se pone: las reglas de la
   entrada van en las semanas 1-3 DEL BLOQUE, así que en un ejercicio que entra
   en la semana 6 no cambiarían nada y la fila diría «Nuevo · 10-12 hasta la
   semana 3» de algo que nunca fue así (`entradaYaPasada`).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Lo que hace falta del registro para saber si un ejercicio se ha hecho. */
export type RegistroParaRampa = Pick<WorkoutLog, 'date' | 'entries'>;
type DatosDeEjercicio = Pick<Exercise, 'name'> & Partial<Pick<Exercise, 'muscleGroup'>>;
type EjercicioPautado = Pick<WorkoutExercise, 'exerciseId' | 'reps' | 'setGroups' | 'weeklyProgression'>;

export interface DatosParaRampa {
  /** Registros del atleta. `null`/`undefined` = no se han podido leer: no se toca nada. */
  registros: readonly RegistroParaRampa[] | null | undefined;
  /** Inicio del bloque (AAAA-MM-DD): «nuevo» se mide contra esa fecha. */
  inicio: string;
  /** El ejercicio del catálogo (su nombre decide 10-12 o 12-14). */
  ejercicio: (exerciseId: string) => DatosDeEjercicio | null | undefined;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ¿Han pasado ya las semanas de entrada del bloque? `cicloDias` es lo que dura
 * una vuelta del ciclo (las reglas van por vueltas, no por semanas de
 * calendario). Un bloque que aún no ha empezado, no.
 */
export function entradaYaPasada(inicio: string, cicloDias: number, hoy: string): boolean {
  if (!ES_FECHA.test(inicio ?? '')) return false;
  return hoy >= addDays(inicio, SEMANAS_DE_ENTRADA * Math.max(1, cicloDias));
}

/** El ejercicio con la entrada puesta si es nuevo para el atleta; si no (o sin registros), tal cual. */
export function conRampaSiEsNuevo<T extends EjercicioPautado>(we: T, o: DatosParaRampa): T {
  if (!o.registros || !ES_FECHA.test(o.inicio ?? '')) return we;
  return conRampaDeEntrada(we, o.ejercicio(we.exerciseId), esEjercicioNuevo(we.exerciseId, o.registros, o.inicio));
}

/** Los ejercicios de una rutina, cada uno con su entrada si le toca. */
export function rutinaConRampa<T extends EjercicioPautado>(exercises: readonly T[], o: DatosParaRampa): T[] {
  return exercises.map(we => conRampaSiEsNuevo(we, o));
}

/**
 * Qué ejercicios de una lista entrarían con la rampa, sin tocar nada: para
 * contárselo al coach ANTES de guardar (la propuesta del asistente). Sin
 * repetir ejercicio.
 */
export function entradasPrevistas<T extends EjercicioPautado>(
  exercises: readonly T[], o: DatosParaRampa,
): { exerciseId: string; entrada: string; pautado: string }[] {
  const vistos = new Set<string>();
  const out: { exerciseId: string; entrada: string; pautado: string }[] = [];
  for (const we of exercises) {
    if (vistos.has(we.exerciseId)) continue;
    vistos.add(we.exerciseId);
    const con = conRampaSiEsNuevo(we, o);
    const entrada = con === we ? null : rangoDeLaRampa(con);
    if (entrada) out.push({ exerciseId: we.exerciseId, entrada, pautado: we.reps });
  }
  return out;
}

/**
 * Registros «previstos»: lo que el atleta HABRÁ hecho en una fecha que todavía
 * no ha llegado. Al aplicar una plantilla de varias etapas se crean todas a la
 * vez, y un ejercicio que repite en la etapa 2 no es nuevo aunque hoy no tenga
 * ni un registro: lo estará haciendo hasta el día anterior. Se suman a los
 * registros reales con la fecha del último día de la etapa anterior.
 */
export function registrosPrevistos(exerciseIds: readonly string[], fecha: string): RegistroParaRampa[] {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return [];
  return [{ date: fecha, entries: ids.map(exerciseId => ({ exerciseId, sets: [{ weight: 0, repsDone: 1, rir: 0 }] })) }];
}

// ── Quitarla y enseñarla ─────────────────────────────────────────────────────

const RANGOS_DE_ENTRADA = [RANGO_ENTRADA_MULTIARTICULAR, RANGO_ENTRADA_AISLAMIENTO];
const SEMANA_DE_VUELTA = SEMANAS_DE_ENTRADA + 1;

/** El rango de entrada que lleva puesto («10-12»), o `null` si no lleva la entrada. */
export function rangoDeLaRampa(we: Pick<WorkoutExercise, 'weeklyProgression'>): string | null {
  if (!tieneRampaDeEntrada(we)) return null;
  return (we.weeklyProgression ?? []).find(r => r.atWeek === 1 && r.cambios?.reps !== undefined)?.cambios?.reps ?? null;
}

/** La marca de la fila del editor: «Nuevo · 10-12 hasta la semana 3». `null` sin entrada. */
export function etiquetaDeRampa(we: Pick<WorkoutExercise, 'weeklyProgression'>): string | null {
  const rango = rangoDeLaRampa(we);
  return rango ? `Nuevo · ${rango} hasta la semana ${SEMANAS_DE_ENTRADA}` : null;
}

/**
 * El ejercicio SIN la entrada de ejercicio nuevo: va con su rango desde la
 * semana 1. Solo se quitan las repeticiones de las dos reglas de la entrada;
 * si el coach programó algo más en esas semanas (series, RIR, técnica), se
 * queda. Y si en la semana 4 puso OTRO rango (ya no es la vuelta al pautado),
 * ese rango es suyo y tampoco se toca.
 */
export function quitarRampaDeEntrada<T extends Pick<WorkoutExercise, 'reps' | 'weeklyProgression'>>(we: T): T {
  if (!tieneRampaDeEntrada(we)) return we;
  let entrada = false;
  let vuelta = false;
  const reglas = (we.weeklyProgression ?? []).flatMap(r => {
    const reps = r.cambios?.reps;
    if (reps === undefined) return [r];
    const esEntrada = !entrada && r.atWeek === 1 && RANGOS_DE_ENTRADA.includes(reps);
    const esVuelta = !esEntrada && !vuelta && r.atWeek === SEMANA_DE_VUELTA && reps === we.reps;
    if (!esEntrada && !esVuelta) return [r];
    if (esEntrada) entrada = true; else vuelta = true;
    const { reps: _reps, ...otros } = r.cambios!;
    const { cambios: _cambios, ...resto } = r;
    if (Object.keys(otros).length > 0) return [{ ...resto, cambios: otros }];
    // Sin más cambios, la regla solo sobrevive si era también un escalón clásico.
    return Object.keys(resto).length > 1 ? [resto] : [];
  });
  const { weeklyProgression: _reglas, ...sin } = we;
  return (reglas.length > 0 ? { ...sin, weeklyProgression: reglas } : sin) as T;
}

/**
 * Lo que hay que guardar cuando el coach edita la BASE de un ejercicio que
 * lleva la entrada. La regla de la semana 4 es una copia del rango pautado: si
 * el rango de la base cambia y la regla no, el cambio no se vería en ninguna
 * semana (1-3 mandaría la entrada y desde la 4, el rango viejo).
 *
 *  · Rango nuevo por debajo del de entrada → la semana 4 pasa al rango nuevo.
 *  · Rango nuevo igual de alto o más, sin rango («AMRAP») o varios bloques de
 *    series → la entrada ya no tiene sentido y se quita.
 *
 * Devuelve el parche tal cual si no hay nada que ajustar.
 */
export function parcheConRampaAlDia(we: WorkoutExercise, patch: Partial<WorkoutExercise>): Partial<WorkoutExercise> {
  if ('weeklyProgression' in patch || !tieneRampaDeEntrada(we)) return patch;
  const despues = { ...we, ...patch };
  const variosBloques = (despues.setGroups?.length ?? 0) > 1;
  if (!variosBloques && despues.reps === we.reps) return patch;
  const nuevo = rangoDeReps(despues.reps ?? '');
  const entrada = rangoDeReps(rangoDeLaRampa(we) ?? '');
  if (variosBloques || !nuevo || !entrada || nuevo.min >= entrada.min) {
    return { ...patch, weeklyProgression: quitarRampaDeEntrada(we).weeklyProgression };
  }
  return {
    ...patch,
    weeklyProgression: (we.weeklyProgression ?? []).map(r => (
      r.atWeek === SEMANA_DE_VUELTA && r.cambios?.reps === we.reps
        ? { ...r, cambios: { ...r.cambios, reps: despues.reps } }
        : r
    )),
  };
}

// ── Rutinas creadas sin poder mirar los registros ────────────────────────────
// El asistente, al aprobar una propuesta, no siempre puede leer los registros
// del atleta. Deja la rutina marcada (una etiqueta en `Workout.tags`, que las
// rutinas de un bloque no usan para nada más) y el editor le pone la entrada
// la primera vez que el coach abre el bloque. Una sola vez: después la marca
// desaparece, y si el coach quita la entrada de un ejercicio no vuelve.

export const ETIQUETA_RAMPA_PENDIENTE = 'rampa-pendiente';

export function tieneRampaPendiente(w: Pick<Workout, 'tags'>): boolean {
  return !!w.tags?.includes(ETIQUETA_RAMPA_PENDIENTE);
}

export function conRampaPendiente(tags: readonly string[] | undefined): string[] {
  return [...new Set([...(tags ?? []), ETIQUETA_RAMPA_PENDIENTE])];
}

export function sinRampaPendiente(tags: readonly string[] | undefined): string[] {
  return (tags ?? []).filter(t => t !== ETIQUETA_RAMPA_PENDIENTE);
}
