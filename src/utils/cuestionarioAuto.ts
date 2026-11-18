import type {
  AutoRelleno, BodyweightLog, Exercise, Mesocycle, StepLog, WorkoutAssignment, WorkoutLog,
} from '../types.js';
import { ZONAS_IEM, type ZonaIem } from './cdg/zonas.js';
import { addDays } from './trainingWeek.js';
import type { EjercicioDelBloque } from './cierrePorEjercicio.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Lo que la app ya sabe antes de preguntar (cuestionarios, 27-10)

   «No preguntar lo que la app ya sabe»: las preguntas con `autoRelleno` salen
   ya contestadas con el dato real de la semana y el atleta solo lo confirma o
   lo corrige. Y el módulo de agujetas solo pregunta por las zonas que entrenó.

   Puro: recibe los datos ya leídos. La ventana es la semana que se revisa:
   los 7 días que acaban hoy.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DatosSemana {
  hoy: string;
  steps?: Pick<StepLog, 'date' | 'steps'>[];
  pesos?: Pick<BodyweightLog, 'date' | 'weight'>[];
  logs?: Pick<WorkoutLog, 'date' | 'entries' | 'workoutId'>[];
  /** Sesiones programadas (para el cumplimiento). */
  programadas?: Pick<WorkoutAssignment, 'date'>[];
  exercises?: Pick<Exercise, 'id' | 'muscleGroup' | 'secondaryMuscleGroups'>[];
}

const media = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** Primer día de la ventana (incluido): hoy − 6. */
export const desdeDeLaSemana = (hoy: string) => addDays(hoy, -6);

/** Cumplimiento 1–5 a partir de sesiones hechas / programadas. */
export function cumplimientoDeSesiones(hechas: number, programadas: number): number | null {
  if (programadas <= 0) return null;
  const r = hechas / programadas;
  return r >= 0.95 ? 5 : r >= 0.75 ? 4 : r >= 0.5 ? 3 : r >= 0.25 ? 2 : 1;
}

/** Valores propuestos para cada `autoRelleno` que se puede saber. */
export function calcularAutoRellenos(d: DatosSemana): Partial<Record<AutoRelleno, number>> {
  const desde = desdeDeLaSemana(d.hoy);
  const enSemana = <T extends { date: string }>(xs?: T[]) => (xs ?? []).filter(x => x.date >= desde && x.date <= d.hoy);
  const out: Partial<Record<AutoRelleno, number>> = {};

  const pasos = media(enSemana(d.steps).map(s => s.steps).filter(n => n > 0));
  if (pasos != null) out.pasos_media = Math.round(pasos);

  const peso = media(enSemana(d.pesos).map(p => p.weight).filter(n => n > 0));
  if (peso != null) out.peso_medio = Math.round(peso * 10) / 10;

  const programadas = enSemana(d.programadas).length;
  const hechas = new Set(enSemana(d.logs).map(l => `${l.date}|${l.workoutId}`)).size;
  const cumplimiento = cumplimientoDeSesiones(hechas, programadas);
  if (cumplimiento != null) out.cumplimiento_entrenos = cumplimiento;

  return out;
}

export interface ZonaEntrenada { zona: ZonaIem; fecha: string }

/** Zonas del IEM que el atleta entrenó en la semana (grupo principal de cada
 *  ejercicio registrado), con la última fecha en que las trabajó. */
export function zonasEntrenadas(d: DatosSemana): ZonaEntrenada[] {
  const desde = desdeDeLaSemana(d.hoy);
  const porId = new Map((d.exercises ?? []).map(e => [e.id, e]));
  const ultima = new Map<ZonaIem, string>();
  for (const log of d.logs ?? []) {
    if (log.date < desde || log.date > d.hoy) continue;
    for (const entry of log.entries) {
      const grupo = porId.get(entry.exerciseId)?.muscleGroup;
      if (!grupo) continue;
      const zona = ZONAS_IEM.find(z => (z.grupos as readonly string[]).includes(grupo));
      if (!zona) continue;
      const antes = ultima.get(zona.clave);
      if (!antes || log.date > antes) ultima.set(zona.clave, log.date);
    }
  }
  return ZONAS_IEM.filter(z => ultima.has(z.clave)).map(z => ({ zona: z.clave, fecha: ultima.get(z.clave)! }));
}

/** «martes» a partir de una fecha ISO. */
export function diaDeLaSemana(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' });
}

/* ── Cierre de bloque: los ejercicios que ha hecho (17-11-2026) ──────────────
   Mismo criterio que las agujetas: no se le pregunta por una lista fija, sino
   por lo que de verdad ha entrenado. Aquí, los ejercicios del bloque que se
   cierra, para que diga cuáles se quedan y cuáles quitaría en un toque. */

export interface DatosBloque {
  hoy: string;
  mesocycles?: Pick<Mesocycle, 'id' | 'startDate' | 'weeks'>[];
  logs?: Pick<WorkoutLog, 'date' | 'entries' | 'mesocycleId'>[];
  exercises?: Pick<Exercise, 'id' | 'name' | 'muscleGroup'>[];
}

/** El cierre se contesta la última semana del bloque o unos días después. */
export const MARGEN_TRAS_EL_BLOQUE_DIAS = 14;
/** Sin bloque que cerrar (cuestionario puesto a mano), lo de las últimas 6 semanas. */
const VENTANA_SIN_BLOQUE_DIAS = 42;

const finDeBloque = (m: Pick<Mesocycle, 'startDate' | 'weeks'>) => addDays(m.startDate, Math.max(1, m.weeks) * 7 - 1);

/**
 * El bloque que se está cerrando: el que está en curso hoy o, si ya acabó, el
 * último que terminó hace poco. Si el siguiente acaba de empezar (primera
 * semana) y el anterior terminó hace nada, el cierre sigue siendo del
 * anterior: es el que el atleta contesta con unos días de retraso. `null` si
 * no hay ninguno a mano.
 */
export function bloqueQueSeCierra<M extends Pick<Mesocycle, 'id' | 'startDate' | 'weeks'>>(mesocycles: M[] | undefined, hoy: string): M | null {
  const empezados = (mesocycles ?? [])
    .filter(m => !!m.startDate && m.startDate <= hoy)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const enCurso = empezados.find(m => hoy <= finDeBloque(m));
  const terminado = empezados.find(m => finDeBloque(m) < hoy);
  const recienTerminado = terminado && hoy <= addDays(finDeBloque(terminado), MARGEN_TRAS_EL_BLOQUE_DIAS) ? terminado : null;
  if (!enCurso) return recienTerminado;
  const recienEmpezado = hoy < addDays(enCurso.startDate, 7);
  return recienEmpezado && recienTerminado ? recienTerminado : enCurso;
}

/**
 * Los ejercicios que el atleta ha HECHO en el bloque que se cierra (al menos
 * una serie apuntada), en el orden en que aparecieron. Uno saltado todas las
 * veces no sale: no puede opinar de lo que no ha hecho. Sin nombre en el
 * catálogo tampoco, porque no habría qué enseñarle.
 */
export function ejerciciosDelBloque(d: DatosBloque): EjercicioDelBloque[] {
  const meso = bloqueQueSeCierra(d.mesocycles, d.hoy);
  const desde = meso ? meso.startDate : addDays(d.hoy, -VENTANA_SIN_BLOQUE_DIAS);
  const hasta = meso ? finDeBloque(meso) : d.hoy;
  // Por `mesocycleId` cuando el registro lo trae; por fechas para los antiguos
  // (mismo criterio que el cierre: utils/cierreMesociclo.ts).
  const delBloque = (d.logs ?? [])
    .filter(l => (meso && l.mesocycleId ? l.mesocycleId === meso.id : l.date >= desde && l.date <= hasta) && l.date <= d.hoy)
    .sort((a, b) => a.date.localeCompare(b.date));

  const porId = new Map((d.exercises ?? []).map(e => [e.id, e]));
  const dias = new Map<string, Set<string>>();
  for (const log of delBloque) {
    for (const entry of log.entries) {
      if (!(entry.sets?.length > 0) || !porId.get(entry.exerciseId)?.name) continue;
      if (!dias.has(entry.exerciseId)) dias.set(entry.exerciseId, new Set());
      dias.get(entry.exerciseId)!.add(log.date);
    }
  }
  return [...dias].map(([id, fechas]) => {
    const ex = porId.get(id)!;
    return { id, nombre: ex.name, grupo: ex.muscleGroup, sesiones: fechas.size };
  });
}
