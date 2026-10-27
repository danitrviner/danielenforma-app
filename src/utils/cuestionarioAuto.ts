import type {
  AutoRelleno, BodyweightLog, Exercise, StepLog, WorkoutAssignment, WorkoutLog,
} from '../types';
import { ZONAS_IEM, type ZonaIem } from './cdg/zonas';
import { addDays } from './trainingWeek';

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
