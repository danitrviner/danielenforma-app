import { Questionnaire, QuestionnaireResponse } from '../types';
import { DataPoint } from './seriesCorrelation';
import { ewmaDeSeñal } from './wellnessTrend';
import { domsCronicoGlobal, domsCronicoGlobalEn } from './domsCronico';

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

/**
 * Serie histórica de IRP, para correlacionarlo con otras variables — un
 * punto por cada fecha donde coinciden sueño y estrés EWMA, usando solo DOMS
 * crónico calculado hasta esa fecha (nunca con lecturas posteriores).
 */
export function historialIRP(params: {
  responses: QuestionnaireResponse[];
  questionnaires: Questionnaire[];
}): DataPoint[] {
  const { responses, questionnaires } = params;
  const sueñoEwma = ewmaDeSeñal('wellness.sleep_hours_weekly', responses, questionnaires);
  const estresEwma = ewmaDeSeñal('wellness.stress_weekly', responses, questionnaires);
  const puntos: DataPoint[] = [];
  for (const s of sueñoEwma) {
    const e = estresEwma.find(p => p.date === s.date);
    if (e === undefined) continue;
    const doms = domsCronicoGlobalEn(s.date, responses, questionnaires);
    if (doms == null) continue;
    puntos.push({ date: s.date, value: Math.round(s.value * ((10 - e.value - doms) / 10) * 10) / 10 });
  }
  return puntos;
}
