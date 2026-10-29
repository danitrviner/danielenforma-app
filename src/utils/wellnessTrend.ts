import { Questionnaire, QuestionnaireResponse } from '../types.js';
import { DataPoint } from './seriesCorrelation.js';
import { historialDeSeñal } from './signalReading.js';
import { computeEWMA } from './ewma.js';

/** Curva EWMA de cualquier señal semanal (sueño, estrés) — amortigua un mal día/semana suelta sin el retraso de una media móvil simple. */
export function ewmaDeSeñal(
  signalKey: string,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
  lambda = 0.3,
): DataPoint[] {
  return computeEWMA(historialDeSeñal(signalKey, responses, questionnaires), lambda);
}
