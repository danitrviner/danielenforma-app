import type { MuscleGroup, Questionnaire, QuestionnaireQuestion, QuestionnaireResponse } from '../types';
import { MUSCLE_ORDER } from '../types';
import { esSeñalDoms, grupoDesdeEtiqueta } from '../data/questionnaireSignals';

/* ═══════════════════════════════════════════════════════════════════════════
   Agujetas de todos los grupos en una sola gráfica

   Las series se unen por GRUPO MUSCULAR (`doms.<grupo>`), no por `questionId`.
   El id es aleatorio y cambia cada vez que un cuestionario se recrea desde su
   preset, así que unir por id partía la historia en tramos sueltos: la gráfica
   enseñaba «solo una semana» aunque el atleta llevase meses respondiendo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Una serie de agujetas: por `signalKey` (`doms.<grupo>`) en los
 *  cuestionarios nuevos, y por el título en los que se crearon antes de que
 *  existieran las señales. */
export function esSerieDeAgujetas(question: QuestionnaireQuestion, qTitle: string): boolean {
  if (question.signalKey?.startsWith('doms.')) return true;
  // Con `\b`: sin los límites de palabra, "dom's" casaba dentro de cualquier
  // palabra que lo contuviera y habría escondido de las gráficas un
  // cuestionario que no tiene nada que ver con las agujetas.
  return /\bagujetas\b|\bdom['’]?s\b/i.test(qTitle);
}

export interface PuntoDeAgujetas { date: string; value: number }
export interface SerieDeAgujetas {
  grupo: MuscleGroup;
  puntos: PuntoDeAgujetas[];
  /** Último valor registrado. */
  ultimo: number;
}

function grupoDePregunta(question: QuestionnaireQuestion, qTitle: string): MuscleGroup | null {
  if (question.type !== 'scale' && question.type !== 'numeric') return null;
  if (question.signalKey) {
    const porSeñal = esSeñalDoms(question.signalKey);
    if (porSeñal) return porSeñal;
  }
  if (!esSerieDeAgujetas(question, qTitle)) return null;
  return grupoDesdeEtiqueta(question.label);
}

/**
 * Todas las series de agujetas del atleta, una por grupo, en el orden del
 * enum. Dos respuestas del mismo día se promedian.
 */
export function agujetasPorGrupo(
  questionnaires: Questionnaire[],
  responses: QuestionnaireResponse[],
): SerieDeAgujetas[] {
  const grupoPorPregunta = new Map<string, MuscleGroup>();
  for (const q of questionnaires) {
    for (const question of q.questions) {
      const g = grupoDePregunta(question, q.title);
      if (g) grupoPorPregunta.set(question.id, g);
    }
  }
  if (grupoPorPregunta.size === 0) return [];

  const acumulado = new Map<MuscleGroup, Map<string, { suma: number; n: number }>>();
  for (const r of responses) {
    const date = r.submittedAt.slice(0, 10);
    for (const a of r.answers) {
      const g = grupoPorPregunta.get(a.questionId);
      if (!g || typeof a.value !== 'number' || Number.isNaN(a.value)) continue;
      const porDia = acumulado.get(g) ?? new Map<string, { suma: number; n: number }>();
      const previo = porDia.get(date) ?? { suma: 0, n: 0 };
      porDia.set(date, { suma: previo.suma + a.value, n: previo.n + 1 });
      acumulado.set(g, porDia);
    }
  }

  return MUSCLE_ORDER.flatMap(grupo => {
    const porDia = acumulado.get(grupo);
    if (!porDia) return [];
    const puntos = [...porDia.entries()]
      .map(([date, { suma, n }]) => ({ date, value: Math.round((suma / n) * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return puntos.length ? [{ grupo, puntos, ultimo: puntos[puntos.length - 1].value }] : [];
  });
}

/** Fechas distintas con alguna medición, de la más antigua a la más reciente. */
export function fechasDeMedicion(series: SerieDeAgujetas[]): string[] {
  return [...new Set(series.flatMap(s => s.puntos.map(p => p.date)))].sort();
}

/**
 * Se queda con las últimas `n` mediciones (fechas en las que se respondió) de
 * TODAS las series a la vez, para que el eje X sea común. `0` = todas.
 */
export function ultimasMediciones(series: SerieDeAgujetas[], n: number): SerieDeAgujetas[] {
  if (n <= 0) return series;
  const fechas = fechasDeMedicion(series);
  const desde = fechas[Math.max(0, fechas.length - n)];
  if (!desde) return series;
  return series.map(s => {
    const puntos = s.puntos.filter(p => p.date >= desde);
    return { ...s, puntos, ultimo: puntos.length ? puntos[puntos.length - 1].value : s.ultimo };
  });
}

/** Los `k` grupos con más agujetas ahora: los que merece la pena ver al abrir. */
export function gruposMasCargados(series: SerieDeAgujetas[], k: number): MuscleGroup[] {
  return [...series]
    .sort((a, b) => b.ultimo - a.ultimo || MUSCLE_ORDER.indexOf(a.grupo) - MUSCLE_ORDER.indexOf(b.grupo))
    .slice(0, k)
    .map(s => s.grupo);
}
