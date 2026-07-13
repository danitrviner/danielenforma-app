// Tools del asistente IA: definiciones (JSON Schema para la Messages API) y el
// ejecutor que corre EN EL NAVEGADOR bajo la sesión autenticada del coach.
// Este módulo es el ÚNICO efector del agente. En Fase 1 todas las tools son de
// solo lectura; los datos numéricos salen de los motores deterministas de
// src/utils (la IA narra sobre ellos, no los recalcula).
import { auth } from '../firebase';
import {
  getAllUserProfiles,
  getCheckIns,
  getWorkoutAssignments,
  getWorkoutLogs,
  getExercises,
  getMesocycles,
  getDietsForAthlete,
  getDietCompletionLogsForAthlete,
  getAthleteNutritionConfig,
  getNutritionProgram,
  getBodyweightForAthlete,
  getWeeklyChallengesForAthlete,
  getOnboarding,
  getResponsesForAthlete,
  getQuestionnairesByCoach,
  saveCoachReport,
  createAiProposal,
  getKnowledgeNotes,
  isLocalBypassActive,
} from '../dbService';
import { computeAdherenceScore } from '../utils/adherence';
import { computeWeightTrend } from '../utils/nutritionAnalysis';
import { estimateMaintenanceKcal } from '../utils/energyCalc';
import { buildTrainingReport } from '../utils/trainingReport';
import { buildTrainingReportDraft } from '../utils/reportBuilder';
import { computeDietPlaced, parseBaseGrams } from '../utils/exchangeHelpers';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { buildPhaseEnergyPlans } from '../utils/nutritionPeriodization';
import { addDays } from '../utils/trainingWeek';
import { SYSTEM_FOODS } from '../nutricion_seed_en_forma';
import { validateDietPayload, DietUpdatePayload, validateMesocyclePayload, MesocycleProposalPayload } from './validators';
import { UserProfile, WeightCheckIn, Diet, FoodCategory, Mesocycle, MuscleGroup, MuscleGroupConfig, MUSCLE_LABELS } from '../types';

// Definiciones que se envían a la API en cada petición. Mantener el orden y el
// contenido estables: forman parte del prefijo cacheado del prompt.
export const TOOL_DEFINITIONS = [
  {
    name: 'list_clients',
    description:
      'Lista todos los clientes con su estado de un vistazo: último check-in, check-ins pendientes de feedback, peso actual/objetivo y % de setup. Úsala para preguntas tipo "¿qué clientes necesitan atención?" o para resolver un nombre a su email.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_client_overview',
    description:
      'Resumen completo de un cliente: perfil, onboarding relevante, tendencia de peso (28 días), kcal de mantenimiento estimadas, adherencia (entrenos + check-ins, 4 semanas), dietas activas y mesociclo actual. Punto de partida antes de analizar o proponer nada.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string', description: 'Email del cliente (resuélvelo antes con list_clients si solo tienes el nombre)' },
      },
      required: ['athlete_email'],
    },
  },
  {
    name: 'get_training_history',
    description:
      'Métricas de entrenamiento de un cliente calculadas por el motor determinista: sesiones, tonelaje vs ventana anterior, rendimiento por grupo muscular y por ejercicio (e1RM Epley, PRs). Ventana en semanas terminando hoy.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
        weeks: { type: 'number', description: 'Semanas hacia atrás (por defecto 4, máx 16)' },
      },
      required: ['athlete_email'],
    },
  },
  {
    name: 'get_diet',
    description:
      'Dietas del cliente con presupuesto de intercambios, intercambios colocados por comida, kcal estimadas (1 int ≈ 100 kcal) y la periodización nutricional (fases) si existe.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
      },
      required: ['athlete_email'],
    },
  },
  {
    name: 'get_checkins',
    description:
      'Últimos check-ins de un cliente (id, peso, ánimo, adherencia autodeclarada, notas y si ya tienen feedback del coach) más sus respuestas recientes de cuestionarios. Usa el id devuelto aquí para draft_checkin_feedback.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
        limit: { type: 'number', description: 'Cuántos check-ins devolver (por defecto 8, máx 20)' },
      },
      required: ['athlete_email'],
    },
  },
  {
    name: 'generate_report_draft',
    description:
      'Genera un borrador de reporte de entrenamiento con el motor determinista de la app (mismos números que "Análisis > Reportes") y lo guarda como draft — el atleta NUNCA lo ve hasta que Dani lo revise y lo envíe manualmente desde esa pantalla. Aporta SIEMPRE un `intro` personalizado y humano para ESE atleta (mira antes get_client_overview / get_training_history / get_checkins para anclarlo en su semana, su objetivo y algo concreto suyo; sigue las reglas de "Cómo escribir"). El resto de datos vienen del motor.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
        period_days: { type: 'number', description: 'Ventana del reporte: 7 o 14 días (por defecto 7)' },
        intro: { type: 'string', description: 'Texto de introducción en español para el reporte (opcional; si se omite se usa el narrativo automático de la app)' },
      },
      required: ['athlete_email'],
    },
  },
  {
    name: 'get_food_library',
    description:
      'Lista los alimentos válidos del sistema de intercambios (etiqueta exacta, categoría y modo). Úsala SIEMPRE antes de construir los items de una dieta — foodLabel debe coincidir EXACTO con una de estas etiquetas.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['OMNIVORO', 'VEGANO', 'SIN_PESAR'], description: 'Filtra por modo de dieta' },
        category: { type: 'string', enum: ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'], description: 'Filtra por categoría' },
      },
      required: [],
    },
  },
  {
    name: 'propose_diet_update',
    description:
      'Crea una PROPUESTA de dieta (nueva o ajuste de una existente). Se valida automáticamente (categorías, múltiplos de 0.25, alimentos reconocidos, presupuesto vs colocado); si hay errores los recibes de vuelta para corregir antes de reintentar. NUNCA se guarda como dieta real: Dani la aprueba o rechaza desde el panel.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
        base_diet_id: { type: 'string', description: 'Id de la dieta que se ajusta (opcional; omítelo si es una dieta nueva)' },
        name: { type: 'string', description: 'Nombre de la dieta' },
        budget: {
          type: 'object',
          description: 'Intercambios/día por categoría, ej. {"HC":8,"PROT":6,"GRASA":4} ≈ 1800 kcal',
          properties: { HC: { type: 'number' }, PROT: { type: 'number' }, GRASA: { type: 'number' } },
          required: ['HC', 'PROT', 'GRASA'],
        },
        meals: {
          type: 'array',
          description: 'Comidas con sus items. La suma de items por categoría debe cuadrar con budget.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: { type: 'string', enum: ['HC', 'PROT', 'GRASA', 'MIX_HC', 'MIX_GRASA'] },
                    foodLabel: { type: 'string', description: 'Etiqueta EXACTA de get_food_library' },
                    quantity: { type: 'number', description: 'Múltiplo de 0.25' },
                  },
                  required: ['category', 'foodLabel', 'quantity'],
                },
              },
            },
            required: ['name', 'items'],
          },
        },
        rationale: { type: 'string', description: 'Justificación breve para Dani (no la ve el atleta)' },
      },
      required: ['athlete_email', 'name', 'budget', 'meals'],
    },
  },
  {
    name: 'search_knowledge',
    description:
      'Busca en la bóveda de metodología del coach (apuntes internos de entrenamiento y nutrición basados en evidencia) por palabras clave. Consúltala para fundamentar decisiones de entrenamiento/nutrición con el criterio propio de Dani antes de proponer dietas, mesociclos o escribir reportes. IMPORTANTE: los apuntes son material interno de cursos — PARAFRASEA y aplica los principios, nunca copies el texto literal ni lo cites hacia el atleta.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Términos de búsqueda, ej. "descanso entre series hipertrofia" o "proteína recomposición"' },
        folder: { type: 'string', enum: ['entrenamiento', 'nutricion'], description: 'Limita a un área (opcional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_exercise_library',
    description:
      'Lista los ejercicios disponibles (nombre, grupo muscular, tipo, material). Úsala como referencia al planificar el reparto de volumen; el mesociclo se define por SERIES por grupo muscular, no por ejercicios concretos.',
    input_schema: {
      type: 'object',
      properties: {
        muscle_group: { type: 'string', description: 'Filtra por grupo muscular (ej. pecho, dorsal, cuadriceps…)' },
      },
      required: [],
    },
  },
  {
    name: 'propose_mesocycle',
    description:
      'Crea una PROPUESTA de mesociclo (bloque de entrenamiento) con series semanales objetivo por grupo muscular. Se valida automáticamente (grupos válidos, series 0–25, volumen razonable para los días). NUNCA se crea el mesociclo real: Dani lo aprueba o rechaza desde el panel. Antes conviene mirar get_training_history para respetar la progresión de volumen del bloque anterior. Solo defines el reparto de volumen; los entrenamientos concretos (ejercicios por día) los materializa Dani después en la app.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
        weeks: { type: 'number', description: 'Duración en semanas (1–12)' },
        days_per_week: { type: 'number', description: 'Días de entrenamiento por semana (1–7)' },
        objective: { type: 'string', description: 'Objetivo del bloque, ej. "Hipertrofia — énfasis espalda"' },
        start_date: { type: 'string', description: 'Fecha de inicio YYYY-MM-DD (opcional; por defecto hoy)' },
        groups: {
          type: 'object',
          description: 'Series semanales objetivo por grupo muscular. Solo incluye los grupos que se entrenan. Ej: {"pecho":{"series":12,"priority":"alta"},"dorsal":{"series":16,"priority":"alta"}}. Grupos válidos: pecho, dorsal, trapecio, deltoide_ant, deltoide_lat, deltoide_post, biceps, triceps, antebrazo, cuadriceps, isquios, gluteo, gemelo, core.',
          additionalProperties: {
            type: 'object',
            properties: {
              series: { type: 'number' },
              priority: { type: 'string', enum: ['alta', 'media', 'baja'] },
            },
            required: ['series'],
          },
        },
        rationale: { type: 'string', description: 'Justificación breve para Dani (no la ve el atleta)' },
      },
      required: ['athlete_email', 'weeks', 'days_per_week', 'objective', 'groups'],
    },
  },
  {
    name: 'draft_checkin_feedback',
    description:
      'Crea una PROPUESTA de feedback para un check-in concreto. NO se envía al atleta directamente: queda pendiente de aprobación de Dani en el panel del asistente. Usa get_checkins primero para obtener el check_in_id exacto.',
    input_schema: {
      type: 'object',
      properties: {
        check_in_id: { type: 'string', description: 'Id exacto del check-in (de get_checkins)' },
        athlete_email: { type: 'string' },
        feedback: { type: 'string', description: 'Texto del feedback dirigido al atleta, en español, tono cercano y profesional' },
        rationale: { type: 'string', description: 'Justificación breve para Dani (no la ve el atleta)' },
      },
      required: ['check_in_id', 'athlete_email', 'feedback'],
    },
  },
];

// Etiqueta que el panel muestra mientras corre cada tool.
export function toolStatusLabel(name: string, input: Record<string, unknown>): string {
  const who = typeof input.athlete_email === 'string' ? ` de ${input.athlete_email}` : '';
  switch (name) {
    case 'list_clients': return 'Consultando la lista de clientes…';
    case 'get_client_overview': return `Consultando la ficha${who}…`;
    case 'get_training_history': return `Analizando entrenamientos${who}…`;
    case 'get_diet': return `Consultando dietas${who}…`;
    case 'get_checkins': return `Consultando check-ins${who}…`;
    case 'generate_report_draft': return `Generando borrador de reporte${who}…`;
    case 'draft_checkin_feedback': return `Redactando propuesta de feedback${who}…`;
    case 'get_food_library': return 'Consultando la librería de alimentos…';
    case 'propose_diet_update': return `Preparando propuesta de dieta${who}…`;
    case 'search_knowledge': return `Consultando la bóveda${typeof input.query === 'string' ? `: "${input.query}"` : ''}…`;
    case 'get_exercise_library': return 'Consultando la librería de ejercicios…';
    case 'propose_mesocycle': return `Preparando propuesta de mesociclo${who}…`;
    default: return `Ejecutando ${name}…`;
  }
}

const MAX_RESULT_CHARS = 15000;

function toResult(data: unknown): string {
  let text = JSON.stringify(data);
  if (text.length > MAX_RESULT_CHARS) text = text.slice(0, MAX_RESULT_CHARS) + '…(truncado)';
  if (isLocalBypassActive()) text += '\n(datos locales, sin conexión a Firestore)';
  return text;
}

function isoDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? String(d) : date.toISOString().slice(0, 10);
}

async function findProfile(email: string): Promise<UserProfile | null> {
  const profiles = await getAllUserProfiles();
  return profiles.find(p => p.email.toLowerCase() === email.toLowerCase()) ?? null;
}

function checkinsOf(all: WeightCheckIn[], email: string): WeightCheckIn[] {
  return all
    .filter(c => c.email.toLowerCase() === email.toLowerCase())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ── Ejecutores ────────────────────────────────────────────────────────────────

async function listClients(): Promise<string> {
  const [profiles, allCheckins] = await Promise.all([getAllUserProfiles(), getCheckIns()]);
  const clients = profiles.filter(p => p.role === 'client');
  const rows = clients.map(p => {
    const checks = checkinsOf(allCheckins, p.email);
    const last = checks[0];
    const pending = checks.filter(c => !c.coachFeedback && !c.approved).length;
    return {
      name: p.displayName,
      email: p.email,
      lastCheckin: last ? isoDate(last.timestamp) : null,
      pendingCheckins: pending,
      latestWeight: last?.weight ?? p.actualWeight ?? null,
      targetWeight: p.targetWeight || null,
      setupPct: p.setupSummary?.pct ?? null,
      planStartDate: p.planStartDate ?? null,
      planDurationMonths: p.planDurationMonths ?? null,
    };
  });
  return toResult({ totalClients: rows.length, clients: rows });
}

async function getClientOverview(email: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });

  const [onboarding, bwLogs, allCheckins, assignments, diets, mesos, program, nutriConfig] = await Promise.all([
    getOnboarding(email),
    getBodyweightForAthlete(email),
    getCheckIns(),
    getWorkoutAssignments(profile.userId),
    getDietsForAthlete(email),
    getMesocycles(email),
    getNutritionProgram(email),
    getAthleteNutritionConfig(email),
  ]);

  const checks = checkinsOf(allCheckins, email);
  const weightTrend = computeWeightTrend(bwLogs, profile.targetWeight || undefined);
  const latestWeight = weightTrend.latestWeight ?? checks[0]?.weight ?? onboarding?.weightKg;
  const maintenanceKcal = onboarding ? estimateMaintenanceKcal(onboarding, latestWeight ?? undefined) : null;
  const adherence = computeAdherenceScore(assignments, checks);
  const activeMeso = [...mesos].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;

  return toResult({
    profile: {
      name: profile.displayName,
      email: profile.email,
      actualWeight: latestWeight ?? null,
      targetWeight: profile.targetWeight || null,
      planStartDate: profile.planStartDate ?? null,
      planDurationMonths: profile.planDurationMonths ?? null,
    },
    onboarding: onboarding ? {
      sex: onboarding.sex ?? null,
      birthDate: onboarding.birthDate ?? null,
      heightCm: onboarding.heightCm ?? null,
      activityLevel: onboarding.activityLevel ?? null,
      goalBody: onboarding.goalBody ?? null,
      goalCapacity: onboarding.goalCapacity ?? null,
      experienceLevel: onboarding.experienceLevel,
      dietType: onboarding.dietType,
      targetCalories: onboarding.targetCalories,
      injuries: onboarding.injuries || onboarding.currentInjuryLocation || null,
      allergies: onboarding.allergies,
      dislikedFoods: onboarding.dislikedFoods,
    } : null,
    weightTrend28d: weightTrend,
    maintenanceKcalEstimated: maintenanceKcal,
    adherence4w: adherence,
    diets: diets.map(d => ({
      id: d.id, name: d.name, isDraft: !!d.isDraft, selfManaged: !!d.selfManaged,
      budget: d.budget, kcalApprox: exchangeToKcal(d.budget),
    })),
    nutritionModes: nutriConfig.enabledModes,
    stepGoal: nutriConfig.stepGoal ?? null,
    activeMesocycle: activeMeso ? {
      id: activeMeso.id, number: activeMeso.number, weeks: activeMeso.weeks,
      startDate: activeMeso.startDate, objective: activeMeso.objective,
      daysPerWeek: activeMeso.daysPerWeek,
    } : null,
    nutritionProgram: program ? {
      startDate: program.startDate,
      phases: program.phases.map(ph => ({ id: ph.id, name: ph.name, weeks: ph.weeks, targetKcal: ph.targetKcal ?? null, targetWeight: ph.targetWeight ?? null })),
    } : null,
    lastCheckin: checks[0] ? { date: isoDate(checks[0].timestamp), weight: checks[0].weight, adherence: checks[0].adherence } : null,
    pendingCheckins: checks.filter(c => !c.coachFeedback && !c.approved).length,
  });
}

async function getTrainingHistory(email: string, weeks: number): Promise<string> {
  const w = Math.min(Math.max(1, Math.round(weeks || 4)), 16);
  const [logs, exercises, mesos] = await Promise.all([
    getWorkoutLogs(email),
    getExercises(),
    getMesocycles(email),
  ]);
  if (logs.length === 0) return toResult({ error: 'Este cliente no tiene entrenamientos registrados' });

  const today = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() - w * 7 + 1);
  const periodStart = start.toISOString().slice(0, 10);

  const report = buildTrainingReport({
    logs, exercises, mesocycles: mesos,
    periodStart, periodEnd: today,
    comparison: { mode: 'weeks', n: w },
  });

  return toResult({
    window: { periodStart, periodEnd: today, comparison: report.comparisonLabel },
    sessions: report.sessions,
    tonnage: report.tonnage,
    muscleGroups: report.muscleGroups.map(g => ({
      group: g.label, tonnage: g.tonnage, tonnageDeltaPct: g.tonnageDeltaPct, ormDeltaPct: g.ormDeltaPct,
    })),
    topExercises: report.perExercise
      .sort((a, b) => b.tonnage - a.tonnage)
      .slice(0, 12)
      .map(e => ({ name: e.name, sets: e.sets, tonnage: e.tonnage, bestOrm: e.bestOrm, deltaOrmPct: e.deltaOrmPct, isPR: e.isPR })),
    highlights: report.highlights,
  });
}

async function getDietInfo(email: string): Promise<string> {
  const [diets, config, program] = await Promise.all([
    getDietsForAthlete(email),
    getAthleteNutritionConfig(email),
    getNutritionProgram(email),
  ]);
  return toResult({
    enabledModes: config.enabledModes,
    stepGoal: config.stepGoal ?? null,
    vegServingsPerDay: config.vegServingsPerDay ?? null,
    diets: diets.map(d => ({
      id: d.id,
      name: d.name,
      isDraft: !!d.isDraft,
      selfManaged: !!d.selfManaged,
      budget: d.budget,
      kcalApprox: exchangeToKcal(d.budget),
      placed: computeDietPlaced(d.meals),
      coachNote: d.coachNote ?? null,
      meals: d.meals.map(m => ({
        name: m.name,
        items: m.items.map(i => ({ food: i.foodLabel, category: i.category, qty: i.quantity })),
      })),
    })),
    nutritionProgram: program ? {
      startDate: program.startDate,
      phases: buildPhaseEnergyPlans(program, diets),
    } : null,
  });
}

async function getCheckinsInfo(email: string, limitN: number): Promise<string> {
  const n = Math.min(Math.max(1, Math.round(limitN || 8)), 20);
  const coachUid = auth.currentUser?.uid;
  const [allCheckins, responses, questionnaires] = await Promise.all([
    getCheckIns(),
    getResponsesForAthlete(email),
    coachUid ? getQuestionnairesByCoach(coachUid) : Promise.resolve([]),
  ]);
  const labelOf = new Map<string, string>();
  for (const q of questionnaires) for (const question of q.questions) labelOf.set(question.id, question.label);

  const checks = checkinsOf(allCheckins, email).slice(0, n);
  const recentResponses = [...responses]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, 5);

  return toResult({
    checkins: checks.map(c => ({
      id: c.id,
      date: isoDate(c.timestamp),
      weight: c.weight,
      mood: c.mood,
      adherence: c.adherence,
      notes: c.notes || null,
      coachFeedback: c.coachFeedback || null,
      pendingFeedback: !c.coachFeedback && !c.approved,
    })),
    questionnaireResponses: recentResponses.map(r => ({
      submittedAt: r.submittedAt.slice(0, 10),
      answers: r.answers.map(a => ({ question: labelOf.get(a.questionId) ?? a.questionId, value: a.value })),
    })),
  });
}

async function generateReportDraft(email: string, periodDaysInput: number, introOverride?: string): Promise<string> {
  const profile = await findProfile(email);
  if (!profile) return toResult({ error: `No existe ningún cliente con email ${email}` });
  const coachId = auth.currentUser?.uid;
  if (!coachId) return toResult({ error: 'Sesión de coach no disponible' });

  const [logs, exercises, mesos, assignments, bwLogs, dietLogs, diets, challenges] = await Promise.all([
    getWorkoutLogs(email),
    getExercises(),
    getMesocycles(email),
    getWorkoutAssignments(profile.userId),
    getBodyweightForAthlete(email),
    getDietCompletionLogsForAthlete(email),
    getDietsForAthlete(email),
    getWeeklyChallengesForAthlete(email),
  ]);
  if (logs.length === 0) {
    return toResult({ error: 'Este cliente no tiene entrenamientos registrados; no se puede generar un reporte.' });
  }

  const periodDays = periodDaysInput === 14 ? 14 : 7;
  const periodEnd = new Date().toISOString().slice(0, 10);
  const periodStart = addDays(periodEnd, -(periodDays - 1));
  const comparisonWeeks = periodDays === 14 ? 2 : 1;

  const draft = buildTrainingReportDraft({
    athleteEmail: email,
    coachId,
    logs, exercises, mesocycles: mesos,
    periodStart, periodEnd,
    comparison: { mode: 'weeks', n: comparisonWeeks },
    extras: {
      athleteName: profile.displayName,
      assignments, bodyweightLogs: bwLogs, dietLogs, diets, challenges,
      targetWeight: profile.targetWeight || undefined,
    },
  });
  if (introOverride?.trim()) draft.intro = introOverride.trim();
  draft.status = 'draft'; // defensivo: nunca lo marca como enviado

  await saveCoachReport(draft);
  return toResult({
    reportId: draft.id,
    title: draft.title,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    sectionsIncluded: draft.sections.filter(s => s.included).map(s => s.id),
    introUsed: draft.intro,
    note: 'Borrador guardado (draft). El atleta no lo ve hasta que Dani lo revise y lo envíe desde Análisis > Reportes.',
  });
}

async function draftCheckinFeedback(
  checkInId: string, athleteEmail: string, feedback: string, rationale: string, chatId: string,
): Promise<string> {
  if (!checkInId || !athleteEmail || !feedback.trim()) {
    return toResult({ error: 'Faltan check_in_id, athlete_email o feedback' });
  }
  const summary = feedback.length > 90 ? `${feedback.slice(0, 87)}…` : feedback;
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'checkinFeedback',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload: { checkInId, feedback: feedback.trim() },
    baseEntityId: checkInId,
    createdAt: new Date().toISOString(),
  });
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    note: 'Propuesta creada. Dani la revisa y aprueba desde el panel del asistente antes de que el atleta la vea.',
  });
}

function getFoodLibrary(mode?: string, category?: string): string {
  let foods = SYSTEM_FOODS;
  if (mode) foods = foods.filter(f => f.mode === mode);
  if (category) foods = foods.filter(f => f.category === category);
  return toResult({ count: foods.length, foods: foods.map(f => ({ mode: f.mode, category: f.category, label: f.label })) });
}

async function proposeDietUpdate(
  athleteEmail: string,
  baseDietId: string | undefined,
  name: string,
  budget: Record<FoodCategory, number>,
  meals: DietUpdatePayload['meals'],
  rationale: string,
  chatId: string,
): Promise<string> {
  const payload: DietUpdatePayload = { budget, meals };
  const issues = validateDietPayload(payload);
  if (issues.length > 0) {
    return toResult({ valid: false, issues, note: 'Corrige estos problemas y vuelve a llamar a propose_diet_update.' });
  }

  const dietMeals = meals.map((m, i) => ({
    id: `meal_${Date.now()}_${i}`,
    name: m.name,
    items: m.items.map(it => ({
      category: it.category,
      foodLabel: it.foodLabel,
      quantity: it.quantity,
      grams: parseBaseGrams(it.foodLabel) != null ? Math.round((parseBaseGrams(it.foodLabel) as number) * it.quantity * 10) / 10 : undefined,
    })),
  }));

  const dietPayload: Omit<Diet, 'id'> = { athleteId: athleteEmail, name, budget, meals: dietMeals };
  const kcal = exchangeToKcal(budget);

  let baseSummary = '';
  if (baseDietId) {
    const existing = (await getDietsForAthlete(athleteEmail)).find(d => d.id === baseDietId);
    if (existing) {
      const prevKcal = exchangeToKcal(existing.budget);
      baseSummary = ` (ajuste de "${existing.name}": ${prevKcal} → ${kcal} kcal)`;
    }
  }

  const summary = `Dieta "${name}"${baseSummary || ' (nueva)'} · HC ${budget.HC} / PROT ${budget.PROT} / GRASA ${budget.GRASA} ≈ ${kcal} kcal`;
  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'diet',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload: dietPayload,
    baseEntityId: baseDietId,
    createdAt: new Date().toISOString(),
  });
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    kcalApprox: kcal,
    note: 'Propuesta creada. Dani la revisa y aprueba desde el panel del asistente antes de que el atleta la vea.',
  });
}

// Búsqueda por palabras clave sobre la bóveda. Sin embeddings: puntúa por
// coincidencias de términos en título (peso 5) + tags (3) + cuerpo (1); devuelve
// un extracto de las mejores notas para que el modelo parafrasee sobre ellas.
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function searchKnowledge(queryText: string, folder?: string): Promise<string> {
  let notes = await getKnowledgeNotes();
  if (notes.length === 0) {
    return toResult({ results: [], note: 'La bóveda está vacía — Dani aún no la ha sincronizado desde el panel del asistente.' });
  }
  if (folder) notes = notes.filter(n => n.folder === folder);

  const terms = [...new Set(normalize(queryText).split(/\s+/).filter(t => t.length >= 3))];
  if (terms.length === 0) return toResult({ results: [], note: 'Consulta demasiado corta.' });

  const scored = notes.map(n => {
    const title = normalize(n.title);
    const tags = normalize(n.tags.join(' '));
    const body = normalize(n.text);
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 5;
      if (tags.includes(t)) score += 3;
      const m = body.split(t).length - 1;
      score += Math.min(m, 5); // cap por término para no premiar notas largas
    }
    return { n, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return toResult({
    query: queryText,
    results: scored.map(({ n }) => ({
      title: n.title,
      folder: n.folder,
      tags: n.tags,
      excerpt: n.text.length > 1200 ? n.text.slice(0, 1200) + '…' : n.text,
    })),
    reminder: 'Parafrasea y aplica estos principios; no cites el texto literal al atleta.',
  });
}

async function getExerciseLibrary(muscleGroup?: string): Promise<string> {
  const exercises = await getExercises();
  const filtered = muscleGroup ? exercises.filter(e => e.muscleGroup === muscleGroup) : exercises;
  return toResult({
    count: filtered.length,
    exercises: filtered.map(e => ({
      name: e.name,
      muscleGroup: e.muscleGroup ?? null,
      primaryFocus: e.primaryFocus,
      type: e.type,
      equipment: e.equipment ?? [],
    })),
  });
}

async function proposeMesocycle(
  athleteEmail: string,
  weeks: number,
  daysPerWeek: number,
  objective: string,
  groupsInput: MesocycleProposalPayload['groups'],
  startDate: string | undefined,
  rationale: string,
  chatId: string,
): Promise<string> {
  const issues = validateMesocyclePayload({ weeks, daysPerWeek, objective, groups: groupsInput });
  if (issues.length > 0) {
    return toResult({ valid: false, issues, note: 'Corrige estos problemas y vuelve a llamar a propose_mesocycle.' });
  }

  const profile = await findProfile(athleteEmail);
  if (!profile) return toResult({ valid: false, issues: [{ field: 'athlete_email', message: `No existe ningún cliente con email ${athleteEmail}` }] });

  // Numeración secuencial como en MesocycleManager (mesocycles.length + 1).
  const existing = await getMesocycles(athleteEmail);
  const number = existing.length + 1;

  // Rellena todos los grupos: los omitidos van a 0 series (shape completo que
  // espera el editor de la app).
  const groups = Object.fromEntries(
    (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).map(g => {
      const cfg = groupsInput[g];
      return [g, { series: cfg?.series ?? 0, priority: cfg?.priority ?? 'media' }];
    })
  ) as Record<MuscleGroup, MuscleGroupConfig>;

  const payload: Omit<Mesocycle, 'id'> = {
    athleteId: athleteEmail,
    number,
    weeks,
    startDate: startDate?.trim() || new Date().toISOString().slice(0, 10),
    objective,
    daysPerWeek,
    groups,
  };

  const trained = (Object.keys(MUSCLE_LABELS) as MuscleGroup[])
    .filter(g => groups[g].series > 0)
    .map(g => `${MUSCLE_LABELS[g]} ${groups[g].series}`);
  const totalSeries = trained.length > 0
    ? (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).reduce((s, g) => s + groups[g].series, 0)
    : 0;
  const summary = `Mesociclo #${number} · ${objective} · ${weeks} sem × ${daysPerWeek} días · ${totalSeries} series/sem`;

  const proposal = await createAiProposal({
    athleteId: athleteEmail,
    kind: 'mesocycle',
    status: 'proposed',
    chatId,
    summary,
    rationale: rationale || '',
    payload,
    createdAt: new Date().toISOString(),
  });
  return toResult({
    proposalCreated: true,
    proposalId: proposal.id,
    number,
    trainedGroups: trained,
    note: 'Propuesta creada. Dani la revisa y aprueba desde el panel; luego materializa los entrenamientos por día en la app.',
  });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function executeTool(
  name: string, input: Record<string, unknown>, chatId: string,
): Promise<{ content: string; isError: boolean }> {
  try {
    const email = typeof input.athlete_email === 'string' ? input.athlete_email.trim() : '';
    switch (name) {
      case 'list_clients':
        return { content: await listClients(), isError: false };
      case 'get_client_overview':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getClientOverview(email), isError: false };
      case 'get_training_history':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getTrainingHistory(email, Number(input.weeks)), isError: false };
      case 'get_diet':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getDietInfo(email), isError: false };
      case 'get_checkins':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await getCheckinsInfo(email, Number(input.limit)), isError: false };
      case 'generate_report_draft':
        if (!email) return { content: 'Falta athlete_email', isError: true };
        return { content: await generateReportDraft(email, Number(input.period_days), typeof input.intro === 'string' ? input.intro : undefined), isError: false };
      case 'draft_checkin_feedback':
        if (!email || typeof input.check_in_id !== 'string' || typeof input.feedback !== 'string') {
          return { content: 'Faltan check_in_id, athlete_email o feedback', isError: true };
        }
        return {
          content: await draftCheckinFeedback(input.check_in_id, email, input.feedback, typeof input.rationale === 'string' ? input.rationale : '', chatId),
          isError: false,
        };
      case 'get_food_library':
        return {
          content: getFoodLibrary(typeof input.mode === 'string' ? input.mode : undefined, typeof input.category === 'string' ? input.category : undefined),
          isError: false,
        };
      case 'propose_diet_update': {
        if (!email || typeof input.name !== 'string' || !input.budget || !Array.isArray(input.meals)) {
          return { content: 'Faltan athlete_email, name, budget o meals', isError: true };
        }
        const content = await proposeDietUpdate(
          email,
          typeof input.base_diet_id === 'string' ? input.base_diet_id : undefined,
          input.name,
          input.budget as Record<FoodCategory, number>,
          input.meals as DietUpdatePayload['meals'],
          typeof input.rationale === 'string' ? input.rationale : '',
          chatId,
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      case 'search_knowledge':
        if (typeof input.query !== 'string' || !input.query.trim()) return { content: 'Falta query', isError: true };
        return { content: await searchKnowledge(input.query, typeof input.folder === 'string' ? input.folder : undefined), isError: false };
      case 'get_exercise_library':
        return { content: await getExerciseLibrary(typeof input.muscle_group === 'string' ? input.muscle_group : undefined), isError: false };
      case 'propose_mesocycle': {
        if (!email || typeof input.objective !== 'string' || !input.groups) {
          return { content: 'Faltan athlete_email, objective o groups', isError: true };
        }
        const content = await proposeMesocycle(
          email,
          Number(input.weeks),
          Number(input.days_per_week),
          input.objective,
          input.groups as MesocycleProposalPayload['groups'],
          typeof input.start_date === 'string' ? input.start_date : undefined,
          typeof input.rationale === 'string' ? input.rationale : '',
          chatId,
        );
        const parsed = JSON.parse(content) as { valid?: boolean };
        return { content, isError: parsed.valid === false };
      }
      default:
        return { content: `Tool desconocida: ${name}`, isError: true };
    }
  } catch (err) {
    console.error(`Tool ${name} falló:`, err);
    return { content: `Error ejecutando ${name}: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}
