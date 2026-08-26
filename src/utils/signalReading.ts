import { Questionnaire, QuestionnaireResponse } from '../types';
import { DataPoint } from './seriesCorrelation';

// ═══════════════════════════════════════════════════════════════════════════
// LECTURA GENÉRICA DE SEÑALES — complementa a volumeHistory.ts::leerFeedback,
// que solo da la ÚLTIMA respuesta de las señales de fin de mesociclo/DOM's
// (con su regla propia de "manda la peor" en solapes). Aquí no hay reglas de
// dominio: dos funciones puras que sirven para CUALQUIER signalKey —
// perfil.*, wellness.* — sin tocar leerFeedback ni su camino crítico
// (sugeridor de volumen, ya en producción).
// ═══════════════════════════════════════════════════════════════════════════

/** questionId → signalKey, across TODOS los cuestionarios del coach (una pregunta con signalKey
 *  puede vivir en cualquiera de ellos, no solo en el que se está leyendo). */
function indicePorPregunta(questionnaires: Questionnaire[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const q of questionnaires) {
    for (const pregunta of q.questions) {
      if (pregunta.signalKey) idx.set(pregunta.id, pregunta.signalKey);
    }
  }
  return idx;
}

/**
 * Serie histórica ascendente por fecha de todas las respuestas de una señal.
 * `date` es `submittedAt` recortado a YYYY-MM-DD. Valores no numéricos
 * (choice de texto, booleanos) se descartan — esta función es solo para
 * señales numéricas/scale, para las que valen EWMA y correlaciones.
 */
export function historialDeSeñal(
  signalKey: string,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): DataPoint[] {
  const señalPorPregunta = indicePorPregunta(questionnaires);
  const puntos: DataPoint[] = [];
  for (const r of responses) {
    for (const a of r.answers) {
      if (señalPorPregunta.get(a.questionId) !== signalKey) continue;
      const n = Number(a.value);
      if (Number.isNaN(n)) continue;
      puntos.push({ date: r.submittedAt.slice(0, 10), value: n });
    }
  }
  return puntos.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Última respuesta CRUDA (no forzada a número) de una señal cualquiera —
 * para señales categóricas (p.ej. sexo biológico) que historialDeSeñal no
 * puede representar como serie numérica.
 */
export function ultimoValorDeSeñal(
  signalKey: string,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): string | number | boolean | undefined {
  const señalPorPregunta = indicePorPregunta(questionnaires);
  const ordenadas = [...responses].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  for (const r of ordenadas) {
    for (const a of r.answers) {
      if (señalPorPregunta.get(a.questionId) === signalKey) return a.value;
    }
  }
  return undefined;
}
