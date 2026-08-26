import { Questionnaire, QuestionnaireResponse } from '../types';
import { DataPoint } from './seriesCorrelation';
import { historialDeSeñal } from './signalReading';
import { computeEWMA } from './ewma';

/** Curva EWMA de cualquier señal semanal (sueño, estrés) — amortigua un mal día/semana suelta sin el retraso de una media móvil simple. */
export function ewmaDeSeñal(
  signalKey: string,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
  lambda = 0.3,
): DataPoint[] {
  return computeEWMA(historialDeSeñal(signalKey, responses, questionnaires), lambda);
}
