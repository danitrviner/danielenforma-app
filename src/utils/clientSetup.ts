// Client Setup checklist engine — pure function, no side effects. Drives the
// coach's "Setup" tab in ClientHub: what's configured, what's pending, what
// needs attention, and the 90-day lifecycle milestones (semana 1 contacto
// diario, renovación anticipada semanas 5-7, reseña/referidos, decisión).
import type {
  UserProfile, OnboardingData, WeightCheckIn, Mesocycle, WorkoutAssignment,
  Diet, AthleteDietConfig, AthleteNutritionConfig, QuestionnaireAssignment,
  PhotoAssignment, ProgressPhoto, WorkoutLog, Roadmap, NutritionProgram,
  WeeklyChallenge, CoachClientTask,
} from '../types';
import type { HubTab, AnalisisTab } from '../components/ClientHub';
import { getWeekStart, addDays } from './trainingWeek';
import { isCoachGraceDay } from './challengeOptions';

export type SetupPhaseId = 'alta' | 'programacion' | 'primeras_semanas' | 'consolidacion';
export type SetupStatus = 'done' | 'pending' | 'attention' | 'na';

export interface SetupItemLink {
  tab: HubTab;
  analisisSub?: AnalisisTab;
}

export interface SetupItemDef {
  id: string;
  phase: SetupPhaseId;
  title: string;
  description?: string;
  link?: SetupItemLink;
  manual?: boolean;
}

export interface SetupItem extends SetupItemDef {
  status: SetupStatus;
  detail?: string;
}

export interface SetupPhaseGroup {
  id: SetupPhaseId;
  title: string;
  subtitle?: string;
  items: SetupItem[];
  donePct: number;
}

export interface SetupAlert {
  id: string;
  title: string;
  detail?: string;
  severity: 'warn' | 'critical';
  link?: SetupItemLink;
}

export interface SetupResult {
  phases: SetupPhaseGroup[];
  alerts: SetupAlert[];
  globalPct: number;
  attentionCount: number;
  nextStep: SetupItem | null;
}

export interface SetupInputs {
  profile: UserProfile;
  onboarding: OnboardingData | null;
  checkins: WeightCheckIn[];
  mesocycles: Mesocycle[];
  workoutAssignments: WorkoutAssignment[];
  diets: Diet[];
  dietConfig: AthleteDietConfig | null;
  nutritionConfig: AthleteNutritionConfig | null;
  qAssignments: QuestionnaireAssignment[];
  photoAssignments: PhotoAssignment[];
  photos: ProgressPhoto[];
  workoutLogs: WorkoutLog[];
  roadmap: Roadmap | null;
  nutritionProgram: NutritionProgram | null;
  weeklyChallenge: WeeklyChallenge | null;
  manualTasks: CoachClientTask[];
  today: string; // YYYY-MM-DD, injectable for tests
}

const REVISIONES: SetupItemLink = { tab: 'revisiones' };
const ENTRENAMIENTOS: SetupItemLink = { tab: 'entrenamientos' };
const DIETAS: SetupItemLink = { tab: 'dietas' };
const ROADMAP: SetupItemLink = { tab: 'roadmap' };
const PERIODIZACION: SetupItemLink = { tab: 'periodizacion' };

export const SEEDED_ITEMS: SetupItemDef[] = [
  // ── Alta (semana 0) ──
  { id: 'alta_perfil', phase: 'alta', title: 'Perfil del cliente creado' },
  { id: 'alta_plan_fechado', phase: 'alta', title: 'Plan con fecha de inicio y duración', link: REVISIONES },
  { id: 'alta_onboarding', phase: 'alta', title: 'Cuestionario de onboarding completado', link: REVISIONES },
  { id: 'alta_peso_inicial', phase: 'alta', title: 'Peso inicial registrado', link: REVISIONES },
  { id: 'alta_peso_meta', phase: 'alta', title: 'Peso objetivo definido', link: REVISIONES },
  { id: 'alta_foto_inicial', phase: 'alta', title: 'Foto inicial subida', link: REVISIONES },
  { id: 'alta_cuestionario', phase: 'alta', title: 'Cuestionario periódico asignado', link: REVISIONES },
  { id: 'alta_fotos_periodicas', phase: 'alta', title: 'Fotos periódicas asignadas', link: REVISIONES },

  // ── Programación ──
  { id: 'prog_mesociclo', phase: 'programacion', title: 'Mesociclo creado', link: ENTRENAMIENTOS },
  { id: 'prog_entrenos_semana', phase: 'programacion', title: 'Entrenamientos de esta semana asignados', link: ENTRENAMIENTOS },
  { id: 'prog_dietas', phase: 'programacion', title: 'Dietas creadas', link: DIETAS },
  { id: 'prog_calendario_dietas', phase: 'programacion', title: 'Calendario semanal de dietas configurado', link: DIETAS },
  { id: 'prog_pasos', phase: 'programacion', title: 'Objetivo de pasos configurado', link: DIETAS },
  { id: 'prog_fases_plan', phase: 'programacion', title: 'Fases del plan definidas', link: ROADMAP },
  { id: 'prog_periodizacion', phase: 'programacion', title: 'Periodización nutricional configurada', link: PERIODIZACION },
  { id: 'prog_escalera', phase: 'programacion', title: 'Escalera de niveles configurada', link: ROADMAP },
  { id: 'prog_retos_config', phase: 'programacion', title: 'Ejercicios elegibles para retos configurados', link: ROADMAP },

  // ── Primeras semanas (días 0-28) ──
  { id: 'w1_contacto_diario', phase: 'primeras_semanas', title: 'Contacto diario semana 1', manual: true },
  { id: 'w1_dudas_dieta', phase: 'primeras_semanas', title: 'Resolver dudas sobre la dieta', manual: true },
  { id: 'w1_primer_checkin', phase: 'primeras_semanas', title: 'Primer check-in recibido', link: REVISIONES },
  { id: 'w1_primera_revision', phase: 'primeras_semanas', title: 'Primer check-in revisado', link: REVISIONES },
  { id: 'w1_reto_semana', phase: 'primeras_semanas', title: 'Reto semanal asignado', link: ROADMAP },
  { id: 'w24_objetivos', phase: 'primeras_semanas', title: 'Revisar objetivos con el cliente', manual: true },

  // ── Consolidación (día ≥28) ──
  { id: 'c_renovacion_anticipada', phase: 'consolidacion', title: 'Ofrecer renovación anticipada', manual: true },
  { id: 'c_resena', phase: 'consolidacion', title: 'Pedir reseña', manual: true },
  { id: 'c_referidos', phase: 'consolidacion', title: 'Pedir referidos', manual: true },
  { id: 'c_decision_renovacion', phase: 'consolidacion', title: 'Decisión de renovación', manual: true },
];

const PHASE_META: Record<SetupPhaseId, { title: string; subtitle?: string }> = {
  alta: { title: 'Alta', subtitle: 'Semana 0' },
  programacion: { title: 'Programación' },
  primeras_semanas: { title: 'Primeras semanas', subtitle: 'Días 0-28' },
  consolidacion: { title: 'Consolidación', subtitle: 'Día 28+' },
};

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysSincePlanStart(planStartDate: string, today: string): number {
  const start = parseISODate(planStartDate);
  const t = parseISODate(today);
  return Math.floor((t.getTime() - start.getTime()) / 86_400_000);
}

function manualStatus(manualTasks: CoachClientTask[], itemId: string, inWindow: boolean): SetupStatus {
  const task = manualTasks.find(t => t.itemId === itemId);
  if (task?.done) return 'done';
  return inWindow ? 'attention' : 'pending';
}

export function computeSetupChecklist(inputs: SetupInputs): SetupResult {
  const {
    profile, onboarding, checkins, mesocycles, workoutAssignments, diets, dietConfig,
    nutritionConfig, qAssignments, photoAssignments, photos, workoutLogs, roadmap,
    nutritionProgram, weeklyChallenge, manualTasks, today,
  } = inputs;

  const hasDatedPlan = !!profile.planStartDate && !!profile.planDurationMonths;
  const day = hasDatedPlan ? daysSincePlanStart(profile.planStartDate!, today) : null;

  const statuses = new Map<string, { status: SetupStatus; detail?: string }>();
  const set = (id: string, status: SetupStatus, detail?: string) => statuses.set(id, { status, detail });

  // ── Alta ──
  set('alta_perfil', 'done');
  set('alta_plan_fechado', hasDatedPlan ? 'done' : 'attention');
  set('alta_onboarding', onboarding ? 'done' : 'pending');
  set('alta_peso_inicial', profile.initialWeight > 0 ? 'done' : 'pending');
  set('alta_peso_meta', profile.targetWeight > 0 ? 'done' : 'pending');
  set('alta_foto_inicial', photos.length > 0 ? 'done' : 'pending');
  set('alta_cuestionario', qAssignments.some(a => a.active) ? 'done' : 'pending');
  set('alta_fotos_periodicas', photoAssignments.some(a => a.active) ? 'done' : 'pending');

  // ── Programación ──
  set('prog_mesociclo', mesocycles.length > 0 ? 'done' : 'pending');
  {
    const weekStart = getWeekStart(today);
    const weekEnd = addDays(weekStart, 6);
    const hasThisWeek = workoutAssignments.some(a => a.date >= weekStart && a.date <= weekEnd);
    if (mesocycles.length === 0) set('prog_entrenos_semana', 'pending');
    else set('prog_entrenos_semana', hasThisWeek ? 'done' : 'attention');
  }
  set('prog_dietas', diets.length > 0 ? 'done' : 'pending');
  {
    const scheduledDays = dietConfig?.weeklySchedule
      ? Object.values(dietConfig.weeklySchedule).filter(v => !!v).length
      : 0;
    set('prog_calendario_dietas', scheduledDays > 0 ? 'done' : 'pending', `${scheduledDays}/7 días`);
  }
  set('prog_pasos', (nutritionConfig?.stepGoal ?? 0) > 0 ? 'done' : 'pending');
  set('prog_fases_plan', (roadmap?.planPhases?.length ?? 0) > 0 ? 'done' : 'pending');
  {
    const phases = nutritionProgram?.phases ?? [];
    if (phases.length === 0) set('prog_periodizacion', 'pending');
    else set('prog_periodizacion', phases.some(p => p.dietId === '') ? 'attention' : 'done');
  }
  set('prog_escalera', roadmap?.levelLadder ? 'done' : 'pending', roadmap?.levelLadder ? undefined : 'usa la default');
  set('prog_retos_config', (roadmap?.challengeConfig?.liftExerciseIds?.length ?? 0) > 0 ? 'done' : 'pending');

  // ── Primeras semanas (na sin plan fechado) ──
  const primerasNa = !hasDatedPlan;
  if (primerasNa) {
    set('w1_contacto_diario', 'na');
    set('w1_dudas_dieta', 'na');
    set('w1_primer_checkin', 'na');
    set('w1_primera_revision', 'na');
    set('w1_reto_semana', 'na');
    set('w24_objetivos', 'na');
  } else {
    const d = day!;
    set('w1_contacto_diario', manualStatus(manualTasks, 'w1_contacto_diario', d >= 0 && d <= 7));
    set('w1_dudas_dieta', manualStatus(manualTasks, 'w1_dudas_dieta', d >= 0 && d <= 7));

    if (checkins.length === 0) set('w1_primer_checkin', d >= 7 ? 'attention' : 'pending');
    else set('w1_primer_checkin', 'done');

    const reviewed = checkins.filter(c => !!c.coachFeedback || c.approved);
    if (reviewed.length > 0) {
      set('w1_primera_revision', 'done');
    } else if (checkins.length > 0) {
      const oldestMs = checkins.reduce<number | null>((oldest, c) => {
        const ms = (c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp)).getTime();
        return oldest === null || ms < oldest ? ms : oldest;
      }, null);
      const daysOld = oldestMs === null ? 0 : Math.floor((parseISODate(today).getTime() - oldestMs) / 86_400_000);
      set('w1_primera_revision', daysOld > 3 ? 'attention' : 'pending');
    } else {
      set('w1_primera_revision', 'pending');
    }

    if (weeklyChallenge === null) set('w1_reto_semana', 'attention');
    else if (weeklyChallenge.origin === 'coach') set('w1_reto_semana', 'done');
    else set('w1_reto_semana', 'pending', 'puedes personalizarlo');

    set('w24_objetivos', manualStatus(manualTasks, 'w24_objetivos', d >= 21 && d <= 28));
  }

  // ── Consolidación (na antes de día 28) ──
  const consolidacionNa = !hasDatedPlan || day! < 28;
  if (consolidacionNa) {
    set('c_renovacion_anticipada', 'na');
    set('c_resena', 'na');
    set('c_referidos', 'na');
    set('c_decision_renovacion', 'na');
  } else {
    const d = day!;
    set('c_renovacion_anticipada', manualStatus(manualTasks, 'c_renovacion_anticipada', d >= 28 && d <= 49));
    set('c_resena', manualStatus(manualTasks, 'c_resena', false));
    set('c_referidos', manualStatus(manualTasks, 'c_referidos', false));

    const decisionTask = manualTasks.find(t => t.itemId === 'c_decision_renovacion');
    if (decisionTask?.done) {
      set('c_decision_renovacion', 'done');
    } else {
      const expiry = calcPlanExpirySimple(profile, today);
      set('c_decision_renovacion', expiry.expired || expiry.expiringSoon ? 'attention' : 'pending');
    }
  }

  // ── Build phase groups ──
  const phaseIds: SetupPhaseId[] = ['alta', 'programacion', 'primeras_semanas', 'consolidacion'];
  const phases: SetupPhaseGroup[] = phaseIds.map(phaseId => {
    const defs = SEEDED_ITEMS.filter(def => def.phase === phaseId);
    const items: SetupItem[] = defs.map(def => {
      const s = statuses.get(def.id) ?? { status: 'pending' as SetupStatus };
      return { ...def, status: s.status, detail: s.detail };
    });
    const countable = items.filter(i => i.status !== 'na');
    const donePct = countable.length === 0 ? 100 : Math.round((countable.filter(i => i.status === 'done').length / countable.length) * 100);
    return { id: phaseId, title: PHASE_META[phaseId].title, subtitle: PHASE_META[phaseId].subtitle, items, donePct };
  });

  const allItems = phases.flatMap(p => p.items);
  const countableAll = allItems.filter(i => i.status !== 'na');
  const globalPct = countableAll.length === 0 ? 100 : Math.round((countableAll.filter(i => i.status === 'done').length / countableAll.length) * 100);
  const attentionCount = allItems.filter(i => i.status === 'attention').length;
  const nextStep = allItems.find(i => i.status === 'attention') ?? allItems.find(i => i.status === 'pending') ?? null;

  // ── Alertas (fuera del %) ──
  const alerts: SetupAlert[] = [];

  {
    const lastMs = checkins.reduce<number | null>((best, c) => {
      const ms = (c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp)).getTime();
      return best === null || ms > best ? ms : best;
    }, null);
    const daysSince = lastMs === null ? null : Math.floor((parseISODate(today).getTime() - lastMs) / 86_400_000);
    if (daysSince !== null && daysSince > 14) {
      alerts.push({ id: 'rec_checkin_atrasado', title: 'Check-in muy atrasado', detail: `${daysSince}d sin check-in`, severity: 'critical', link: REVISIONES });
    } else if (daysSince !== null && daysSince > 7) {
      alerts.push({ id: 'rec_checkin_atrasado', title: 'Check-in atrasado', detail: `${daysSince}d sin check-in`, severity: 'warn', link: REVISIONES });
    }
  }

  {
    const expiry = calcPlanExpirySimple(profile, today);
    if (expiry.expired) {
      alerts.push({ id: 'rec_plan_vencer', title: 'Plan vencido', detail: expiry.daysLeft !== null ? `Vencido hace ${-expiry.daysLeft}d` : undefined, severity: 'critical', link: REVISIONES });
    } else if (expiry.expiringSoon) {
      alerts.push({ id: 'rec_plan_vencer', title: 'Plan a punto de vencer', detail: expiry.daysLeft !== null ? `Vence en ${expiry.daysLeft}d` : undefined, severity: 'warn', link: REVISIONES });
    }
  }

  {
    const grace = isCoachGraceDay(today);
    if (weeklyChallenge === null && grace) {
      alerts.push({ id: 'rec_reto_lunes', title: 'Asigna el reto de la semana', detail: 'Hoy es lunes', severity: 'warn', link: ROADMAP });
    } else if (weeklyChallenge && weeklyChallenge.origin === 'auto' && !grace) {
      alerts.push({ id: 'rec_reto_lunes', title: 'Reto generado automáticamente', detail: 'Personalízalo si quieres', severity: 'warn', link: ROADMAP });
    }
  }

  {
    const unseen = workoutLogs.filter(l => !!l.note && !l.noteCoachSeen);
    if (unseen.length > 0) {
      alerts.push({ id: 'rec_notas_atleta', title: 'Notas del atleta sin leer', detail: `${unseen.length} nota${unseen.length > 1 ? 's' : ''}`, severity: 'warn', link: ENTRENAMIENTOS });
    }
  }

  return { phases, alerts, globalPct, attentionCount, nextStep };
}

// Same math as hooks/usePlanExpiry's calcPlanExpiry, but parameterized by
// `today` so tests can inject a fixed date instead of using the real clock.
function calcPlanExpirySimple(profile: { planStartDate?: string; planDurationMonths?: 3 | 6 | 12 }, today: string): { daysLeft: number | null; expired: boolean; expiringSoon: boolean } {
  if (!profile.planStartDate || !profile.planDurationMonths) return { daysLeft: null, expired: false, expiringSoon: false };
  const [y, m, d] = profile.planStartDate.split('-').map(Number);
  const end = new Date(y, m - 1 + profile.planDurationMonths, d);
  const t = parseISODate(today);
  const daysLeft = Math.floor((end.getTime() - t.getTime()) / 86_400_000);
  return { daysLeft, expired: daysLeft < 0, expiringSoon: daysLeft >= 0 && daysLeft <= 30 };
}

// Cheap fallback for the clients grid — uses only data ClientsScreen already
// loads (no extra queries), unlike computeSetupChecklist which needs roadmap/
// nutritionProgram/weeklyChallenge fetched per-athlete.
export function estimateSetupPct(profile: UserProfile, checkins: WeightCheckIn[], assignments: WorkoutAssignment[]): number {
  const signals = [
    !!profile.planStartDate && !!profile.planDurationMonths,
    profile.initialWeight > 0,
    profile.targetWeight > 0,
    checkins.length > 0,
    assignments.length > 0,
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}
