import { Questionnaire, QuestionnaireResponse } from '../types';
import { ultimoValorDeSeñal } from './signalReading';

// Sexo biológico y antigüedad de entrenamiento — señales de la anamnesis
// ("Entrenamiento", questionnairePresets.ts), leídas por signalKey igual que
// meso_end.*/doms.*. NO son campos de UserProfile: un cliente dado de alta
// antes de que existieran estas preguntas simplemente no las tiene todavía
// (null), hasta que reasigne/edite la anamnesis — nunca se infiere un valor.

export type Sexo = 'hombre' | 'mujer';
export type NivelExperiencia = 'novato' | 'intermedio' | 'avanzado';

export function leerSexo(responses: QuestionnaireResponse[], questionnaires: Questionnaire[]): Sexo | null {
  const v = ultimoValorDeSeñal('perfil.sexo_biologico', responses, questionnaires);
  if (v === 'Hombre') return 'hombre';
  if (v === 'Mujer') return 'mujer';
  return null;
}

export function leerAntiguedadAnios(responses: QuestionnaireResponse[], questionnaires: Questionnaire[]): number | null {
  const v = ultimoValorDeSeñal('perfil.antiguedad_entrenamiento_anios', responses, questionnaires);
  const n = Number(v);
  return v !== undefined && !Number.isNaN(n) ? n : null;
}

/**
 * Umbrales de progreso esperado, ajustables — no vienen de una tabla
 * externa, son la mejor estimación de Dani a validar con datos reales:
 * novato <1 año (progresión neural rápida), intermedio 1-3 años, avanzado
 * >3 años (cerca del techo genético, cualquier % ya es un éxito notable).
 */
export function nivelExperienciaDe(antiguedadAnios: number): NivelExperiencia {
  if (antiguedadAnios < 1) return 'novato';
  if (antiguedadAnios <= 3) return 'intermedio';
  return 'avanzado';
}

const UMBRAL_PROGRESO_PCT: Record<NivelExperiencia, number> = {
  novato: 5,
  intermedio: 2.5,
  avanzado: 1,
};

/** % de mejora en e1RM por bloque a partir del cual se considera un progreso destacado para ese nivel. */
export function umbralProgresoEsperadoPct(nivel: NivelExperiencia): number {
  return UMBRAL_PROGRESO_PCT[nivel];
}
