import { Questionnaire, QuestionnaireAssignment, QuestionnaireQuestion } from '../types';

// Aplica los overrides de personalización de una asignación sobre la plantilla
// maestra de un cuestionario: oculta, reformula, cambia obligatoriedad, añade
// preguntas exclusivas del atleta y reordena. El questionId de cada pregunta
// de la plantilla se conserva siempre (solo se pueden ocultar/reformular, no
// duplicar con un id distinto) — así gráficas, correlaciones y reportes
// pueden seguir comparando la misma pregunta entre atletas y en el tiempo
// aunque cada uno tenga su propia versión.
//
// Fuente única de verdad: la consumen el formulario del atleta
// (QuestionnaireWizard), las gráficas (QuestionnaireChartsPanel), las
// correlaciones (CorrelationPanel) y el visor de respuestas del coach.
export function resolveQuestions(
  q: Questionnaire,
  a: Pick<QuestionnaireAssignment, 'overrides'>,
): QuestionnaireQuestion[] {
  const o = a.overrides;
  if (!o) return q.questions;

  const hidden = new Set(o.hidden ?? []);
  const relabeled = o.relabeled ?? {};
  const required = o.required ?? {};

  const base = q.questions
    .filter(question => !hidden.has(question.id))
    .map(question => ({
      ...question,
      label: relabeled[question.id] ?? question.label,
      required: required[question.id] ?? question.required,
    }));

  const extra = o.extra ?? [];
  const combined = [...base, ...extra];

  if (!o.order || o.order.length === 0) return combined;

  const byId = new Map(combined.map(question => [question.id, question]));
  const ordered: QuestionnaireQuestion[] = [];
  for (const id of o.order) {
    const question = byId.get(id);
    if (question) { ordered.push(question); byId.delete(id); }
  }
  // Cualquier pregunta no mencionada en `order` (p.ej. añadida a la plantilla
  // después de fijar el orden personalizado) se añade al final, no se pierde.
  ordered.push(...byId.values());
  return ordered;
}
