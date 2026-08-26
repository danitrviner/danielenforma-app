import { MuscleGroup, Questionnaire, QuestionnaireResponse, MUSCLE_ORDER } from '../types';
import { historialDeSeñal } from './signalReading';

// DOMS crónico — sin cartas de control (no hay historial suficiente para
// I-MR), una media simple de las últimas N lecturas por zona. Constantes
// ajustables por Dani con datos reales, no vienen de literatura.
export const DOMS_CRONICO_N_LECTURAS = 3; // ~6 semanas al ritmo quincenal del cuestionario DOM's
export const DOMS_CRONICO_UMBRAL = 6;     // media >= 6/10 sostenida en las N lecturas = crónico

function round1(n: number): number { return Math.round(n * 10) / 10; }

/**
 * Media de las últimas N lecturas de DOMS de un grupo — null si hay menos de
 * N lecturas (dato insuficiente, nunca se rellena con 0 ni se estima con
 * menos datos: etiquetar "crónico" a un atleta nuevo con una sola lectura
 * alta sería un falso positivo).
 */
export function domsCronicoDeGrupo(
  group: MuscleGroup,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): number | null {
  const serie = historialDeSeñal(`doms.${group}`, responses, questionnaires);
  if (serie.length < DOMS_CRONICO_N_LECTURAS) return null;
  const ultimas = serie.slice(-DOMS_CRONICO_N_LECTURAS);
  return round1(ultimas.reduce((s, p) => s + p.value, 0) / ultimas.length);
}

export function esDomsCronico(mediaCronica: number | null): boolean {
  return mediaCronica != null && mediaCronica >= DOMS_CRONICO_UMBRAL;
}

/** Escalar único (media sobre los grupos con datos suficientes) para alimentar IRP — null si ningún grupo tiene aún N lecturas. */
export function domsCronicoGlobal(
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): number | null {
  const medias = MUSCLE_ORDER
    .map(g => domsCronicoDeGrupo(g, responses, questionnaires))
    .filter((v): v is number => v != null);
  if (medias.length === 0) return null;
  return round1(medias.reduce((s, v) => s + v, 0) / medias.length);
}
