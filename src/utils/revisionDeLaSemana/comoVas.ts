import type { BodyMeasurement, Exercise, Mesocycle, ProgressPhoto, WorkoutLog } from '../../types.js';
import { buildTrainingReport, type ExercisePerf } from '../trainingReport.js';
import { mejoresYPeores } from '../revisionCoach.js';
import { enRango, num, type SemanaDeRevision } from './ventana.js';

/* ═══════════════════════════════════════════════════════════════════════════
   «Cómo vas» — la semana contra la anterior, en palabras de atleta (18-11-2026)

   La comparación fija que pidió Dani: lo que sube y lo que baja ESTA semana
   frente a la anterior, con los mismos filtros que la lista del bloque
   (`mejoresYPeores`: ruido de medida, mínimo de series, nada que se estrene).
   Se cuenta en porcentaje y en su idioma («mueves un 4 % más»), sin RM
   estimado ni índices.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface EjerciciosDeLaSemana {
  suben: ExercisePerf[];
  bajan: ExercisePerf[];
  /** Récords de esta semana (mejor marca de su historial). */
  records: number;
}

export function ejerciciosDeLaSemana(o: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  mesocycles: Mesocycle[];
  semana: SemanaDeRevision;
  pesoCorporalKg?: number | null;
}): EjerciciosDeLaSemana {
  const informe = buildTrainingReport({
    logs: o.logs, exercises: o.exercises, mesocycles: o.mesocycles,
    periodStart: o.semana.desde, periodEnd: o.semana.hasta,
    comparison: { mode: 'weeks', n: 1 },
    pesoCorporalKg: o.pesoCorporalKg,
  });
  const { suben, bajan } = mejoresYPeores(informe.perExercise, { n: 4 });
  return { suben, bajan, records: informe.perExercise.filter(e => e.isPR).length };
}

/** «mueves un 4,2 % más» / «mueves un 3 % menos». */
export function fraseDeCambio(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return null;
  return `mueves un ${num(Math.abs(pct))} % ${pct > 0 ? 'más' : 'menos'}`;
}

/** ¿Hay medida o foto nueva esta semana? Solo entonces salen arriba. */
export function hayMedidaNueva(o: {
  medidas?: readonly Pick<BodyMeasurement, 'date' | 'metricKey'>[];
  fotos?: readonly Pick<ProgressPhoto, 'date'>[];
  semana: Pick<SemanaDeRevision, 'desde' | 'hasta'>;
}): { medidas: boolean; fotos: boolean } {
  const { desde, hasta } = o.semana;
  return {
    // El peso no cuenta como medida: ya tiene su sitio.
    medidas: (o.medidas ?? []).some(m => m.metricKey !== 'bodyweight' && enRango(m.date, desde, hasta)),
    fotos: (o.fotos ?? []).some(f => enRango(f.date, desde, hasta)),
  };
}
