import type { QSchedule, Questionnaire, QuestionnaireAssignment, QuestionnairePack, QuestionnairePackItem } from '../types';
import { PAQUETE_OFICIAL, presetPorTitulo, buildQuestionnaireFromPreset } from '../data/questionnairePresets';

/* Paquete oficial (27-10): lo crea con un toque a partir de las plantillas
   oficiales. Reutiliza los cuestionarios del coach que ya tengan ese título y
   crea los que falten. */

/** Misma plantilla y mismo calendario: Mediciones va dos veces (fin y mitad de
 *  bloque) y no son duplicados. */
export function claveDeItem(i: { questionnaireId: string; schedule: QSchedule }): string {
  const s = i.schedule ?? { type: 'once' };
  return `${i.questionnaireId}|${s.type}|${s.semanaDelBloque ?? ''}|${s.planWeek ?? ''}|${s.intervalDays ?? ''}|${s.minSemanasBloque ?? ''}`;
}

/** Lo que falta por aplicar de un paquete: con plantilla viva y que el atleta
 *  no tenga ya con ese calendario. */
export function itemsPendientes(
  pack: Pick<QuestionnairePack, 'items'>,
  activas: Pick<QuestionnaireAssignment, 'questionnaireId' | 'schedule'>[],
  plantillas: Pick<Questionnaire, 'id'>[],
): QuestionnairePackItem[] {
  const vivas = new Set(plantillas.map(q => q.id));
  const puestas = new Set(activas.map(claveDeItem));
  return pack.items.filter(i => vivas.has(i.questionnaireId) && !puestas.has(claveDeItem(i)));
}

export async function crearPaqueteOficial(
  coachId: string,
  existentes: Questionnaire[],
  db: {
    createQuestionnaire: (d: Omit<Questionnaire, 'id'>) => Promise<Questionnaire>;
    createQuestionnairePack: (d: Omit<QuestionnairePack, 'id'>) => Promise<QuestionnairePack>;
  },
): Promise<{ pack: QuestionnairePack; creadas: Questionnaire[] }> {
  const porTitulo = new Map(existentes.map(q => [q.title, q]));
  const creadas: Questionnaire[] = [];
  for (const titulo of [...new Set(PAQUETE_OFICIAL.items.map(i => i.titulo))]) {
    if (porTitulo.has(titulo)) continue;
    const preset = presetPorTitulo(titulo);
    if (!preset) continue;
    const q = await db.createQuestionnaire(buildQuestionnaireFromPreset(preset, coachId));
    porTitulo.set(titulo, q);
    creadas.push(q);
  }
  const items = PAQUETE_OFICIAL.items
    .filter(i => porTitulo.has(i.titulo))
    .map(i => ({ questionnaireId: porTitulo.get(i.titulo)!.id, schedule: i.schedule }));
  const pack = await db.createQuestionnairePack({ ownerId: coachId, name: PAQUETE_OFICIAL.nombre, items, createdAt: new Date().toISOString() });
  return { pack, creadas };
}
