// El despachador: la única puerta por la que el bucle de agente ejecuta una
// tool. Aquí se comprueba el consentimiento del atleta ANTES de leer o
// proponer nada sobre él, y se traduce cada tool a su ejecutor.
import { getAllUserProfiles, getOnboarding } from './datos.js';
import { estadoConsentimiento, motivoParaElCoach, aliasDeAtleta } from '../consentimientoIA.js';
import type { RoadmapItem } from '../../types.js';
import { DietUpdatePayload, MesocycleProposalPayload, WorkoutDayInput, WorkoutExerciseInput, LadderLevelInput } from '../validators.js';
import { DossierPatch } from '../../types.js';
import { calcularRepartoTool, getChallengeOptions, getCheckinsInfo, getClientBrief, getClientOverview, getCoachAdjustments, getDietInfo, getExerciseLibrary, getExerciseUsage, getFoodLibrary, getNutritionAnalysis, getOnboardingCompleto, getProgressMetrics, getProposalFeedback, getQuestionnaireTrends, getRevisionEngine, getSetupStatus, getTrainingHistory, getVolumeSuggestion, leerContextoDelPlan, leerFicha, listClients, listMisRepartos, searchKnowledge } from './lectores.js';
import { SEMANAS_POR_DEFECTO } from '../validators.js';
import { getCdgSemana, proposeProgresionIem, getAlternativasEjercicio } from './cdg.js';
import { getResultadoEsperado } from './lectores.js';
import { cerrarEsperado } from './propuestas.js';
import { addCoachTask, apuntarHecho, draftCheckinFeedback, proposeRespuestaRevision, proposeMensajeAtleta, generateReportDraft, leerExpediente, proposeDietUpdate, proposeDossierUpdate, proposeLevelLadder, proposeMesocycle, proposeMesocycleTemplate, proposeNutritionProgram, proposePeriodizationBlock, proposePublishBlock, proposeRoadmapItems, proposeSetupConfig, proposeSpecialDay, proposeWeekPlan, proposeWeeklyChallenge, proposeWorkoutDays, proposeWorkoutTemplate } from './propuestas.js';
/* ── Consentimiento: UNA puerta, no una lista ────────────────────────────────
   Hasta el 28-10-2026 aquí había una lista blanca de diez tools «con datos de
   atleta» y el resto pasaba sin mirar: `get_client_brief` —que trae el alta
   entera, la ficha, los check-ins y la dieta en una sola llamada—,
   `get_athlete_dossier`, `get_revision_engine`, `propose_workout_days`… no
   estaban. La lista se quedó corta en cuanto se añadieron tools, que es lo que
   le pasa a toda lista blanca.

   Ahora la regla es la contraria: toda tool que reciba `athlete_email` se
   comprueba, salvo las que se declaren aquí porque el email NO identifica
   datos que se lean o escriban. Las dos plantillas son del coach; el email
   solo agrupa la tarjeta en Propuestas. Una tool nueva con `athlete_email`
   nace comprobada sin que nadie tenga que acordarse. */
export const TOOLS_SIN_DATOS_DE_ATLETA = new Set(['propose_workout_template', 'propose_mesocycle_template']);

export function requiereConsentimiento(name: string, input: Record<string, unknown>): boolean {
  const email = typeof input.athlete_email === 'string' ? input.athlete_email.trim() : '';
  return !!email && !TOOLS_SIN_DATOS_DE_ATLETA.has(name);
}

async function comprobarConsentimiento(email: string): Promise<string | null> {
  const [onboarding, profiles] = await Promise.all([getOnboarding(email), getAllUserProfiles()]);
  const estado = estadoConsentimiento(onboarding);
  if (estado === 'aceptado') return null;

  const perfil = profiles.find(p => p.email.toLowerCase() === email.toLowerCase());
  return motivoParaElCoach(estado, aliasDeAtleta(perfil?.displayName, email));
}

export async function executeTool(
  name: string, input: Record<string, unknown>, chatId: string,
): Promise<{ content: string; isError: boolean }> {
  try {
    const email = typeof input.athlete_email === 'string' ? input.athlete_email.trim() : '';

    if (requiereConsentimiento(name, input)) {
      const bloqueo = await comprobarConsentimiento(email);
      // `isError: false` a propósito: no ha fallado nada. Marcarlo como error
      // empuja al modelo a reintentar, y aquí reintentar es justo lo que no
      // debe hacer — el mensaje ya le dice que no insista.
      if (bloqueo) return { content: bloqueo, isError: false };
    }

    switch (name) {
      case 'get_client_brief':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getClientBrief(email, typeof input.tarea === 'string' ? input.tarea : 'renovar_mes'), isError: false };
      case 'list_clients':
        return { content: await listClients(), isError: false };
      case 'get_client_overview':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getClientOverview(email), isError: false };
      case 'get_onboarding':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getOnboardingCompleto(email), isError: false };
      case 'get_training_history':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getTrainingHistory(email, Number(input.weeks)), isError: false };
      case 'get_revision_engine':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return {
          content: await getRevisionEngine(email, typeof input.periodo === 'string' ? input.periodo : 'bloque'),
          isError: false,
        };
      case 'get_volume_suggestion':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getVolumeSuggestion(email, input), isError: false };
      case 'get_diet':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getDietInfo(email), isError: false };
      case 'get_checkins':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getCheckinsInfo(email, Number(input.limit)), isError: false };
      case 'get_questionnaire_trends': {
        if (!email) return { content: 'Falta athlete_email', isError: true };
        const questionIds = Array.isArray(input.question_ids)
          ? input.question_ids.filter((x): x is string => typeof x === 'string')
          : undefined;
        return { content: await getQuestionnaireTrends(email, questionIds, Number(input.weeks)), isError: false };
      }
      case 'generate_report_draft':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await generateReportDraft(email, Number(input.period_days), typeof input.intro === 'string' ? input.intro : undefined), isError: false };
      case 'draft_checkin_feedback':
        if (!email || typeof input.check_in_id !== 'string' || typeof input.feedback !== 'string') {
          return { content: 'Faltan check_in_id, athlete_email o feedback', isError: true };
        }
        return {
          content: await draftCheckinFeedback(input.check_in_id, email, input.feedback, typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input)),
          isError: false,
        };
      case 'propose_respuesta_revision':
        if (!email || typeof input.response_id !== 'string' || typeof input.texto !== 'string') {
          return { content: 'Faltan athlete_email, response_id o texto', isError: true };
        }
        {
          const content = await proposeRespuestaRevision(email, input.response_id, input.texto, typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input));
          const parsed = JSON.parse(content) as { valid?: boolean };
          return { content, isError: parsed.valid === false };
        }
      case 'propose_mensaje_atleta':
        if (!email || typeof input.texto !== 'string' || typeof input.motivo !== 'string') {
          return { content: 'Faltan athlete_email, texto o motivo', isError: true };
        }
        {
          const content = await proposeMensajeAtleta(email, input.texto, input.motivo, typeof input.semana === 'number' ? input.semana : undefined, typeof input.rationale === 'string' ? input.rationale : '', chatId);
          const parsed = JSON.parse(content) as { valid?: boolean };
          return { content, isError: parsed.valid === false };
        }
      case 'get_cdg_semana':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getCdgSemana(email, typeof input.mesocycle_id === 'string' ? input.mesocycle_id : undefined), isError: false };
      case 'propose_progresion_iem': {
        if (!email) return { content: 'Falta athlete_email', isError: true };
        const content = await proposeProgresionIem(email, input, typeof input.rationale === 'string' ? input.rationale : '', chatId);
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'get_alternativas_ejercicio':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getAlternativasEjercicio(email, input), isError: false };
      case 'get_resultado_esperado':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getResultadoEsperado(email), isError: false };
      case 'cerrar_esperado': {
        if (!email || typeof input.proposal_id !== 'string' || typeof input.nota !== 'string' || !(typeof input.cumplio === 'boolean' || input.cumplio === null)) {
          return { content: 'Faltan athlete_email, proposal_id, cumplio (true/false/null) o nota', isError: true };
        }
        const content = await cerrarEsperado(email, input.proposal_id, input.cumplio as boolean | null, input.nota);
        const parsed = JSON.parse(content) as { ok?: boolean };
        return { content, isError: parsed.ok === false };
      }
      case 'get_food_library':
        return {
          content: getFoodLibrary(typeof input.mode === 'string' ? input.mode : undefined, typeof input.grupo === 'string' ? input.grupo : undefined),
          isError: false,
        };
      case 'propose_diet_update': {
        if (!email || typeof input.name !== 'string' || (!input.objetivo && !input.budget)) {
          return { content: 'Faltan athlete_email, name u objetivo', isError: true };
        }
        const content = await proposeDietUpdate(
          email,
          typeof input.base_diet_id === 'string' ? input.base_diet_id : undefined,
          input.name,
          {
            ...(input.objetivo ? { objetivo: input.objetivo as DietUpdatePayload['objetivo'] } : {}),
            // Un chat empezado antes de pasar a kcal aún puede mandar intercambios.
            ...(input.budget ? { budget: input.budget as DietUpdatePayload['budget'] } : {}),
            // Sin meals no se manda lista vacía: sobre una dieta base, vacía
            // significaría borrar las comidas que Dani tiene colocadas (A3).
            ...(Array.isArray(input.meals) ? { meals: input.meals as NonNullable<DietUpdatePayload['meals']> } : {}),
          },
          typeof input.rationale === 'string' ? input.rationale : '',
          chatId,
          leerExpediente(input),
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'search_knowledge':
        if (typeof input.query !== 'string' || !input.query.trim()) return { content: 'Falta query', isError: true };
        return { content: await searchKnowledge(input.query, typeof input.folder === 'string' ? input.folder : undefined), isError: false };
      case 'get_exercise_library':
        return { content: await getExerciseLibrary(typeof input.muscle_group === 'string' ? input.muscle_group : undefined), isError: false };
      case 'get_coach_adjustments':
        return { content: await getCoachAdjustments(typeof input.athlete_email === 'string' ? input.athlete_email : undefined), isError: false };
      case 'get_exercise_usage':
        return {
          content: await getExerciseUsage(
            typeof input.muscle_group === 'string' ? input.muscle_group : undefined,
            typeof input.athlete_email === 'string' ? input.athlete_email : undefined,
          ),
          isError: false,
        };
      case 'calcular_reparto':
        return { content: await calcularRepartoTool(email || undefined, input), isError: false };
      case 'list_mis_repartos':
        return { content: await listMisRepartos(), isError: false };
      case 'propose_mesocycle': {
        if (!email || typeof input.objective !== 'string' || !input.groups) {
          return { content: 'Faltan athlete_email, objective o groups', isError: true };
        }
        const content = await proposeMesocycle(
          email,
          // Sin semanas, el bloque estándar de Dani (doctrina §11). En septiembre
          // el asistente proponía 4-8 y Dani alargaba a 12 en 6 de 12 bloques.
          input.weeks === undefined ? SEMANAS_POR_DEFECTO : Number(input.weeks),
          Number(input.days_per_week),
          input.objective,
          input.groups as MesocycleProposalPayload['groups'],
          typeof input.start_date === 'string' ? input.start_date : undefined,
          typeof input.rationale === 'string' ? input.rationale : '',
          chatId,
          leerExpediente(input),
          input.reparto,
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'propose_workout_days': {
        if (!email || !Array.isArray(input.days)) {
          return { content: 'Faltan athlete_email o days', isError: true };
        }
        const content = await proposeWorkoutDays(
          email,
          typeof input.mesocycle_id === 'string' ? input.mesocycle_id : undefined,
          input.days as WorkoutDayInput[],
          typeof input.rationale === 'string' ? input.rationale : '',
          chatId,
          leerExpediente(input),
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'propose_periodization_block': {
        if (!email || typeof input.objective !== 'string' || !input.groups || typeof input.review_cadence_weeks !== 'number' || typeof input.review_type !== 'string') {
          return { content: 'Faltan athlete_email, objective, groups, review_cadence_weeks o review_type', isError: true };
        }
        const content = await proposePeriodizationBlock(
          email,
          Number(input.weeks),
          Number(input.days_per_week),
          input.objective,
          input.groups as MesocycleProposalPayload['groups'],
          typeof input.start_date === 'string' ? input.start_date : undefined,
          typeof input.deload_week === 'number' ? input.deload_week : undefined,
          input.review_cadence_weeks,
          input.review_type as 'revision' | 'cuestionario' | 'foto',
          typeof input.rationale === 'string' ? input.rationale : '',
          chatId,
          leerExpediente(input),
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'get_setup_status':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getSetupStatus(email), isError: false };
      case 'get_plan_context':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await leerContextoDelPlan(email), isError: false };
      case 'propose_level_ladder': {
        if (!email || !Array.isArray(input.levels)) {
          return { content: 'Faltan athlete_email o levels', isError: true };
        }
        const content = await proposeLevelLadder(
          email, input.levels as LadderLevelInput[],
          typeof input.rationale === 'string' ? input.rationale : '', chatId,
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'propose_roadmap_items': {
        if (!email || !Array.isArray(input.items)) {
          return { content: 'Faltan athlete_email o items', isError: true };
        }
        return {
          content: await proposeRoadmapItems(
            email, input.items as Partial<RoadmapItem>[],
            typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input),
          ),
          isError: false,
        };
      }
      case 'propose_nutrition_program': {
        if (!email || !Array.isArray(input.phases)) {
          return { content: 'Faltan athlete_email o phases', isError: true };
        }
        return {
          content: await proposeNutritionProgram(
            email,
            typeof input.start_date === 'string' ? input.start_date : undefined,
            input.phases as Record<string, unknown>[],
            Array.isArray(input.refeed_days) ? input.refeed_days as Record<string, unknown>[] : [],
            typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input),
          ),
          isError: false,
        };
      }
      case 'propose_week_plan': {
        if (!email) return { content: 'Falta athlete_email', isError: true };
        const content = await proposeWeekPlan(email, input, typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input));
        const parsed = JSON.parse(content) as { error?: string };
        return { content, isError: !!parsed.error };
      }
      case 'propose_special_day': {
        if (!email || typeof input.date !== 'string' || typeof input.title !== 'string' || typeof input.athlete_note !== 'string') {
          return { content: 'Faltan athlete_email, date, title o athlete_note', isError: true };
        }
        return {
          content: await proposeSpecialDay(
            email, input.date, typeof input.kind === 'string' ? input.kind : 'otro',
            input.title, input.athlete_note,
            typeof input.description === 'string' ? input.description : undefined,
            typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input),
          ),
          isError: false,
        };
      }
      case 'get_athlete_dossier':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await leerFicha(email), isError: false };
      case 'log_dossier_fact': {
        if (!email || typeof input.text !== 'string' || !input.text.trim()) {
          return { content: 'Faltan athlete_email o text', isError: true };
        }
        const kind = typeof input.kind === 'string' ? input.kind : 'observacion';
        return { content: await apuntarHecho(email, kind, input.text, chatId), isError: false };
      }
      case 'propose_setup_config':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        {
          const content = await proposeSetupConfig(email, input, typeof input.rationale === 'string' ? input.rationale : '', chatId, leerExpediente(input));
          const parsed = JSON.parse(content) as { valid?: boolean };
          return { content, isError: parsed.valid === false };
        }
      case 'propose_publish_block':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        {
          const content = await proposePublishBlock(email, typeof input.mesocycle_id === 'string' ? input.mesocycle_id : undefined, typeof input.rationale === 'string' ? input.rationale : '', chatId);
          const parsed = JSON.parse(content) as { valid?: boolean };
          return { content, isError: parsed.valid === false };
        }
      case 'get_challenge_options':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getChallengeOptions(email), isError: false };
      case 'propose_weekly_challenge':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        {
          const content = await proposeWeeklyChallenge(email, input, typeof input.rationale === 'string' ? input.rationale : '', chatId);
          const parsed = JSON.parse(content) as { valid?: boolean };
          return { content, isError: parsed.valid === false };
        }
      case 'propose_workout_template': {
        if (!email || typeof input.name !== 'string' || !Array.isArray(input.exercises)) {
          return { content: 'Faltan athlete_email, name o exercises', isError: true };
        }
        const content = await proposeWorkoutTemplate(email, input.name, input.exercises as WorkoutExerciseInput[], typeof input.rationale === 'string' ? input.rationale : '', chatId);
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'propose_mesocycle_template': {
        if (!email || typeof input.name !== 'string' || !Array.isArray(input.stages)) {
          return { content: 'Faltan athlete_email, name o stages', isError: true };
        }
        const content = await proposeMesocycleTemplate(email, input.name, typeof input.description === 'string' ? input.description : undefined, input.stages as Record<string, unknown>[], typeof input.rationale === 'string' ? input.rationale : '', chatId);
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'add_coach_task':
        if (!email || typeof input.title !== 'string' || !input.title.trim()) {
          return { content: 'Faltan athlete_email o title', isError: true };
        }
        return {
          content: await addCoachTask(email, input.title, typeof input.phase === 'string' ? input.phase : undefined, typeof input.due_date === 'string' ? input.due_date : undefined, chatId),
          isError: false,
        };
      case 'get_nutrition_analysis':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getNutritionAnalysis(email), isError: false };
      case 'get_progress_metrics':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getProgressMetrics(email), isError: false };
      case 'get_proposal_feedback':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getProposalFeedback(email), isError: false };
      case 'propose_dossier_update': {
        if (!email) return { content: 'Falta athlete_email', isError: true };
        const patch: DossierPatch = {};
        if (typeof input.objetivos === 'string') patch.objetivos = input.objetivos.trim();
        if (typeof input.evaluacion === 'string') patch.evaluacion = input.evaluacion.trim();
        if (typeof input.esperado === 'string') patch.esperado = input.esperado.trim();
        if (typeof input.foco === 'string') patch.foco = input.foco.trim();
        if (Array.isArray(input.preguntas_abiertas)) {
          patch.preguntasAbiertas = input.preguntas_abiertas.filter((x): x is string => typeof x === 'string');
        }
        return {
          content: await proposeDossierUpdate(email, patch, typeof input.rationale === 'string' ? input.rationale : '', chatId),
          isError: false,
        };
      }
      default:
        return { content: `Tool desconocida: ${name}`, isError: true };
    }
  } catch (err) {
    console.error(`Tool ${name} falló:`, err);
    return { content: `Error ejecutando ${name}: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

