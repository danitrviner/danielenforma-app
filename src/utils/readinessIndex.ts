import { Questionnaire, QuestionnaireResponse } from '../types';
import { ewmaDeSeñal } from './wellnessTrend';
import { domsCronicoGlobal } from './domsCronico';

// IRP — Índice de Readiness Psicofisiológico. Sueño × (10 − estrés −
// DOMS_crónico) / 10. Usa el valor EWMA más reciente de sueño/estrés (no el
// crudo, para no leer un mal día suelto como una caída real de readiness).
// Si falta cualquier componente, el resultado es null — nunca se sustituye
// por 0 ni por una media poblacional, un IRP con un componente inventado
// engaña más que no mostrar nada. No se clampa a 0 si sale negativo: un IRP
// negativo es información (alerta), no un caso inválido.
export interface IRPResult {
  valor: number | null;
  horasSueño: number | null;
  estres: number | null;
  domsCronico: number | null;
}

function ultimoValor(puntos: { value: number }[]): number | null {
  return puntos.length > 0 ? puntos[puntos.length - 1].value : null;
}

export function computeIRP(params: {
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
}): IRPResult {
  const { responses, questionnaires } = params;
  const horasSueño = ultimoValor(ewmaDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires));
  const estres = ultimoValor(ewmaDeSeñal('wellness.stress_weekly', responses, questionnaires));
  const domsCronico = domsCronicoGlobal(responses, questionnaires);

  if (horasSueño == null || estres == null || domsCronico == null) {
    return { valor: null, horasSueño, estres, domsCronico };
  }
  const valor = Math.round(horasSueño * ((10 - estres - domsCronico) / 10) * 10) / 10;
  return { valor, horasSueño, estres, domsCronico };
}
