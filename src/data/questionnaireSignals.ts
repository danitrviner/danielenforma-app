import { MuscleGroup, MUSCLE_LABELS, MUSCLE_ORDER, QuestionnaireQuestion } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// SEÑALES DE CUESTIONARIO — las pocas respuestas que un motor lee de verdad.
//
// El `id` de una pregunta se genera aleatorio al instanciar una plantilla
// (`buildQuestionnaireFromPreset`), así que no hay forma de preguntar «¿cuál
// es la respuesta de qué grupo quiere priorizar?». `signalKey` es esa clave
// estable, y esta lista es su vocabulario cerrado.
//
// Nada de esto cambia cómo se responden o se pintan los cuestionarios: una
// pregunta con señal se sigue viendo y guardando exactamente igual.
// ═══════════════════════════════════════════════════════════════════════════

export type VolumeSignalKey =
  | 'meso_end.rating'
  | 'meso_end.recovery'
  | 'meso_end.effort'
  | 'meso_end.priority_groups'
  | 'meso_end.overload_groups'
  | `doms.${MuscleGroup}`;

// Señales de perfil del atleta (anamnesis, se responden una vez) y de
// bienestar semanal (Revisión Semanal) — motor de analítica, ver
// src/utils/athleteProfileSignals.ts, src/utils/wellnessTrend.ts.
export type PerfilSignalKey = 'perfil.sexo_biologico' | 'perfil.antiguedad_entrenamiento_anios';
export type WellnessSignalKey = 'wellness.sleep_hours_weekly' | 'wellness.stress_weekly';

/** Unión de TODAS las señales que puede llevar una pregunta, para tipar los helpers de preset. */
export type SignalKey = VolumeSignalKey | PerfilSignalKey | WellnessSignalKey;

/** Señales sueltas (no las 17 de DOM's) que el selector del editor ofrece. */
export const SEÑALES_FIN_MESOCICLO: { key: VolumeSignalKey; label: string; tipos: string[] }[] = [
  { key: 'meso_end.rating',          label: 'Valoración del bloque (1-10)',        tipos: ['scale', 'numeric'] },
  { key: 'meso_end.recovery',        label: 'Recuperación entre sesiones (1-10)',  tipos: ['scale', 'numeric'] },
  { key: 'meso_end.effort',          label: 'Exigencia de las series (1-10)',      tipos: ['scale', 'numeric'] },
  { key: 'meso_end.priority_groups', label: 'Grupos a priorizar (multi)',          tipos: ['choice'] },
  { key: 'meso_end.overload_groups', label: 'Grupos con demasiado volumen (multi)', tipos: ['choice'] },
];

export const SEÑALES_DOMS: { key: VolumeSignalKey; label: string; tipos: string[] }[] =
  MUSCLE_ORDER.map(g => ({ key: `doms.${g}` as VolumeSignalKey, label: `Agujetas · ${MUSCLE_LABELS[g]}`, tipos: ['scale', 'numeric'] }));

export const SEÑALES_PERFIL: { key: PerfilSignalKey; label: string; tipos: string[] }[] = [
  { key: 'perfil.sexo_biologico',                 label: 'Sexo biológico',                     tipos: ['choice'] },
  { key: 'perfil.antiguedad_entrenamiento_anios',  label: 'Antigüedad de entrenamiento (años)', tipos: ['numeric'] },
];

export const SEÑALES_WELLNESS: { key: WellnessSignalKey; label: string; tipos: string[] }[] = [
  { key: 'wellness.sleep_hours_weekly', label: 'Horas de sueño (semanal)', tipos: ['numeric'] },
  { key: 'wellness.stress_weekly',      label: 'Estrés de la semana (1-10)', tipos: ['scale', 'numeric'] },
];

/** Todas las señales que el editor puede asignar a una pregunta. */
export const SEÑALES_DISPONIBLES = [...SEÑALES_FIN_MESOCICLO, ...SEÑALES_DOMS, ...SEÑALES_PERFIL, ...SEÑALES_WELLNESS];

export function esSeñalDoms(key: string): MuscleGroup | null {
  if (!key.startsWith('doms.')) return null;
  const g = key.slice(5) as MuscleGroup;
  return MUSCLE_ORDER.includes(g) ? g : null;
}

/**
 * Etiqueta visible → clave de grupo muscular.
 *
 * Las preguntas de opción múltiple guardan la RESPUESTA como el texto de la
 * opción («Deltoides lat.»), no como la clave (`deltoide_lat`) — ver
 * QuestionnaireWizard. Este mapa es el camino de vuelta, y se genera desde
 * MUSCLE_LABELS para que no se pueda desincronizar del enum.
 */
const POR_ETIQUETA = new Map<string, MuscleGroup>(
  MUSCLE_ORDER.map(g => [MUSCLE_LABELS[g].toLowerCase(), g]),
);

export function grupoDesdeEtiqueta(etiqueta: string): MuscleGroup | null {
  return POR_ETIQUETA.get(etiqueta.trim().toLowerCase()) ?? null;
}

/** Las 17 opciones de una pregunta «elige grupos musculares», en el orden del enum. */
export const OPCIONES_GRUPOS: string[] = MUSCLE_ORDER.map(g => MUSCLE_LABELS[g]);

/** Índice questionId → signalKey de un cuestionario, para leer sus respuestas. */
export function indiceDeSeñales(questions: QuestionnaireQuestion[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const q of questions) {
    if (q.signalKey) idx.set(q.id, q.signalKey);
  }
  return idx;
}
