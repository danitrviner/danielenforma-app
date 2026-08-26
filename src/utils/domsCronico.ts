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
// Sin límite superior de fecha — usado por domsCronicoDeGrupo para reusar la
// variante "En" sin duplicar la lógica de la media de las últimas N lecturas.
const SIN_LIMITE_FECHA = '9999-12-31';

/** Como domsCronicoDeGrupo pero solo con lecturas hasta `fecha` (inclusive) — para construir una serie histórica sin mirar al futuro. */
export function domsCronicoDeGrupoEn(
  fecha: string,
  group: MuscleGroup,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): number | null {
  const serie = historialDeSeñal(`doms.${group}`, responses, questionnaires).filter(p => p.date <= fecha);
  if (serie.length < DOMS_CRONICO_N_LECTURAS) return null;
  const ultimas = serie.slice(-DOMS_CRONICO_N_LECTURAS);
  return round1(ultimas.reduce((s, p) => s + p.value, 0) / ultimas.length);
}

export function domsCronicoDeGrupo(
  group: MuscleGroup,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): number | null {
  return domsCronicoDeGrupoEn(SIN_LIMITE_FECHA, group, responses, questionnaires);
}

export function esDomsCronico(mediaCronica: number | null): boolean {
  return mediaCronica != null && mediaCronica >= DOMS_CRONICO_UMBRAL;
}

/** Como domsCronicoGlobal pero solo con lecturas hasta `fecha` (inclusive) — para construir una serie histórica de IRP sin mirar al futuro. */
export function domsCronicoGlobalEn(
  fecha: string,
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): number | null {
  const medias = MUSCLE_ORDER
    .map(g => domsCronicoDeGrupoEn(fecha, g, responses, questionnaires))
    .filter((v): v is number => v != null);
  if (medias.length === 0) return null;
  return round1(medias.reduce((s, v) => s + v, 0) / medias.length);
}

/** Escalar único (media sobre los grupos con datos suficientes) para alimentar IRP — null si ningún grupo tiene aún N lecturas. */
export function domsCronicoGlobal(
  responses: QuestionnaireResponse[],
  questionnaires: Questionnaire[],
): number | null {
  return domsCronicoGlobalEn(SIN_LIMITE_FECHA, responses, questionnaires);
}
