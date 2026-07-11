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
  getAthleteNutritionConfig,
  getNutritionProgram,
  getBodyweightForAthlete,
  getOnboarding,
  getResponsesForAthlete,
  getQuestionnairesByCoach,
  isLocalBypassActive,
} from '../dbService';
import { computeAdherenceScore } from '../utils/adherence';
import { computeWeightTrend } from '../utils/nutritionAnalysis';
import { estimateMaintenanceKcal } from '../utils/energyCalc';
import { buildTrainingReport } from '../utils/trainingReport';
import { computeDietPlaced } from '../utils/exchangeHelpers';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { buildPhaseEnergyPlans } from '../utils/nutritionPeriodization';
import { UserProfile, WeightCheckIn } from '../types';

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
      'Últimos check-ins de un cliente (peso, ánimo, adherencia autodeclarada, notas y si ya tienen feedback del coach) más sus respuestas recientes de cuestionarios.',
    input_schema: {
      type: 'object',
      properties: {
        athlete_email: { type: 'string' },
        limit: { type: 'number', description: 'Cuántos check-ins devolver (por defecto 8, máx 20)' },
      },
      required: ['athlete_email'],
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

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function executeTool(name: string, input: Record<string, unknown>): Promise<{ content: string; isError: boolean }> {
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
      default:
        return { content: `Tool desconocida: ${name}`, isError: true };
    }
  } catch (err) {
    console.error(`Tool ${name} falló:`, err);
    return { content: `Error ejecutando ${name}: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}
