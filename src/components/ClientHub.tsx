import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UserProfile, WeightCheckIn, Workout, WorkoutAssignment, WorkoutLog,
  Exercise, Diet, AthleteDietConfig, AthleteNutritionConfig, DietMode,
  FoodCategory, ProgressPhoto, PhotoAssignment,
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse,
  OnboardingData, WeekDay, BodyweightLog,
  OnboardingTemplateQuestion, Mesocycle, CoachReport, AiProposal, WeeklyMenu,
} from '../types';
import { OPEN_AI_PANEL_EVENT } from '../ai/events';
import { computeAdherenceScore, scoreStyle, SIN_DATOS_ADHERENCIA } from '../utils/adherence';
import { atletasActivos } from '../utils/atletas';
import { computeAverageRir } from '../utils/rirStats';
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { useToast } from '../hooks/useToast';
import { useAthleteWeight } from '../hooks/useAthleteWeight';
import {
  getWorkouts, getWorkoutAssignments,
  getWorkoutLogs,
  getExercises, seedExercisesIfEmpty, getDietsForAthlete,
  getAthleteNutritionConfig, saveAthleteNutritionConfig,
  getAthleteDietConfig, saveAthleteDietConfig, getProgressPhotos,
  updateUserProfile,
  getQuestionnairesByCoach, getAssignmentsForAthlete,
  getResponsesForAthlete,
  getPhotoAssignmentsForAthlete,
  getOnboarding,
  getNutritionProgram, saveNutritionProgram, computeActivePhase, computePhaseStartDate, deleteNutritionProgram,
  getOnboardingTemplate, getMesocycles, getCoachReportsForAthlete, getAiProposalsForAthlete,
  getWeeklyMenusForAthlete, getMenuCompletionLogsForAthlete, getAllUserProfiles,
} from '../dbService';
/* 06-7. El Hub es la ruta más pesada del coach: ~1 MB, y buena parte es
   recharts entrando por Análisis y Entrenamientos. Los paneles se importaban
   en estático aunque el Hub solo pinta UNO cada vez —es una pantalla de
   pestañas—, así que abrir la ficha de un cliente para mirar el setup
   descargaba también los gráficos de correlaciones que quizá no se abren nunca.
   En diferido, cada pestaña trae lo suyo la primera vez que se toca.
   Reportes/Nutrición-análisis/Correlaciones se importan aquí por separado
   (antes iban juntos dentro de ClientAnalysisPanel, retirado): abrir
   Reportes ya no descarga también CorrelationPanel. */
const ClientRoadmapPanel = lazy(() => import('./ClientRoadmapPanel'));
const ClientFichaPanel = lazy(() => import('./ClientFichaPanel'));
const ClientBodyPanel = lazy(() => import('./ClientBodyPanel'));
const ReportsPanel = lazy(() => import('./ReportsPanel'));
const NutritionAnalysisPanel = lazy(() => import('./NutritionAnalysisPanel'));
const CorrelationPanel = lazy(() => import('./CorrelationPanel'));
const ClientDietsPanel = lazy(() => import('./ClientDietsPanel'));
const ClientWorkoutsPanel = lazy(() => import('./ClientWorkoutsPanel'));
const ClientReviewsPanel = lazy(() => import('./ClientReviewsPanel'));
const ClientSetupPanel = lazy(() => import('./ClientSetupPanel'));
import PendingTray from './PendingTray';
import ClientAlertsBar from './ClientAlertsBar';
import { Badge, Tabs, Skeleton, Sheet, SearchField, ListRow, Icon } from './ui';

export type HubTab =
  | 'setup' | 'revisiones'
  | 'ficha' | 'cuerpo'
  | 'entrenamientos' | 'dietas' | 'roadmap'
  | 'reportes' | 'analisis-nutricion' | 'correlaciones';
export const HUB_TABS: readonly HubTab[] = [
  'setup', 'revisiones', 'ficha', 'cuerpo',
  'entrenamientos', 'dietas', 'roadmap',
  'reportes', 'analisis-nutricion', 'correlaciones',
];

// Las 10 pestañas se agrupan en 4 zonas para responder a una pregunta distinta
// cada una: qué reviso (Hoy), quién es y cómo está (Atleta), qué programo
// (Plan), cómo va (Análisis). La URL sigue direccionando por HubTab — la zona
// es puramente de navegación/UI, así que los deep links y
// ClientSetupPanel.onGoToTab no cambian.
//
// Análisis perdió su tercer nivel: antes era zona → pestaña única "Análisis"
// → 3 sub-pestañas (reportes/nutricion/correlaciones) con estado propio
// (AnalisisTab). Ahora esas tres viven como pestañas de zona normales — un
// nivel menos para llegar a Reportes, y AnalisisTab desaparece del todo.
type Zone = 'hoy' | 'atleta' | 'plan' | 'analisis';
const ZONE_TABS: Record<Zone, HubTab[]> = {
  hoy: ['revisiones', 'setup'],
  atleta: ['ficha', 'cuerpo'],
  plan: ['entrenamientos', 'dietas', 'roadmap'],
  analisis: ['reportes', 'analisis-nutricion', 'correlaciones'],
};
const ZONE_META: Record<Zone, { label: string; icon: string }> = {
  hoy: { label: 'Hoy', icon: 'today' },
  atleta: { label: 'Atleta', icon: 'person' },
  plan: { label: 'Plan', icon: 'event_note' },
  analisis: { label: 'Análisis', icon: 'insights' },
};
const TAB_META: Record<HubTab, { label: string; icon: string }> = {
  setup:                { label: 'Setup',          icon: 'checklist' },
  revisiones:           { label: 'Revisiones',     icon: 'rate_review' },
  ficha:                { label: 'Ficha',          icon: 'badge' },
  cuerpo:               { label: 'Cuerpo',         icon: 'monitor_weight' },
  entrenamientos:       { label: 'Entrenamientos', icon: 'fitness_center' },
  dietas:               { label: 'Dietas',         icon: 'nutrition' },
  roadmap:              { label: 'Road map',       icon: 'map' },
  reportes:             { label: 'Reportes',       icon: 'analytics' },
  'analisis-nutricion': { label: 'Nutrición',      icon: 'restaurant' },
  correlaciones:        { label: 'Correlaciones',  icon: 'insights' },
};
function zoneOf(tab: HubTab): Zone {
  return (Object.keys(ZONE_TABS) as Zone[]).find(z => ZONE_TABS[z].includes(tab)) ?? 'hoy';
}

interface ClientHubProps {
  key?: React.Key;
  athlete: UserProfile;
  coachId: string;
  coachEmail: string;
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  onBack: () => void;
  // Tab position is owned by the URL (see ClientsScreen) so refreshing or
  // deep-linking lands on the exact same tab instead of always resetting.
  activeTab: HubTab;
  onTabChange: (tab: HubTab) => void;
}

export default function ClientHub({
  athlete, coachId, coachEmail, checkins, onRefreshCheckIns, onBack,
  activeTab, onTabChange,
}: ClientHubProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Selector de atleta — saltar a otro sin volver a /clients. Comparte la
  // clave de caché ['userProfiles'] con ClientsScreen/CommandPalette, así que
  // normalmente ya está en caché al llegar aquí.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
    enabled: switcherOpen,
  });
  const switcherAthletes = useMemo(() => {
    const q = switcherSearch.trim().toLowerCase();
    return atletasActivos(allProfiles)
      .filter(p => p.role === 'client' && p.email !== athlete.email)
      .filter(p => !q || p.displayName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [allProfiles, switcherSearch, athlete.email]);

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const onboardingKey = ['onboarding', athlete.email] as const;
  const { data: onboardingData = null } = useQuery({
    queryKey: onboardingKey,
    queryFn: () => getOnboarding(athlete.email),
  });
  // ClientReviewsPanel writes through this (OnboardingForm / FoodPreferencesPanel
  // saves) without needing to know about react-query — same Dispatch-shaped API
  // it had before, now backed by the query cache instead of local state.
  const setOnboardingData = (updater: React.SetStateAction<OnboardingData | null>) =>
    queryClient.setQueryData<OnboardingData | null>(onboardingKey, prev =>
      typeof updater === 'function' ? (updater as (p: OnboardingData | null) => OnboardingData | null)(prev ?? null) : updater);

  const { data: onboardingTemplateDoc } = useQuery({
    queryKey: ['onboardingTemplate', coachEmail],
    queryFn: () => getOnboardingTemplate(coachEmail),
  });
  const onboardingTemplate: OnboardingTemplateQuestion[] = onboardingTemplateDoc?.questions ?? [];

  // ── Assignment state ───────────────────────────────────────────────────────
  const assignmentsKey = ['workoutAssignments', athlete.userId] as const;
  const { data: assignments = [] } = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => getWorkoutAssignments(athlete.userId),
  });
  const setAssignments = (updater: React.SetStateAction<WorkoutAssignment[]>) =>
    queryClient.setQueryData<WorkoutAssignment[]>(assignmentsKey, prev =>
      typeof updater === 'function' ? (updater as (p: WorkoutAssignment[]) => WorkoutAssignment[])(prev ?? []) : updater);

  // Shared ['workouts'] cache key with HomeScreen/MesocycleManager — no more
  // "only fetch if empty" guard needed, react-query's cache already dedupes.
  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts'],
    queryFn: getWorkouts,
  });

  // ── Load history ───────────────────────────────────────────────────────────
  const athleteLogsKey = ['workoutLogs', athlete.email] as const;
  const { data: athleteLogs = [] } = useQuery({
    queryKey: athleteLogsKey,
    queryFn: () => getWorkoutLogs(athlete.email),
  });
  const setAthleteLogs = (updater: React.SetStateAction<WorkoutLog[]>) =>
    queryClient.setQueryData<WorkoutLog[]>(athleteLogsKey, prev =>
      typeof updater === 'function' ? (updater as (p: WorkoutLog[]) => WorkoutLog[])(prev ?? []) : updater);

  const { data: mesocycles = [] } = useQuery({
    queryKey: ['mesocycles', athlete.email],
    queryFn: () => getMesocycles(athlete.email),
  });

  // Shared ['exercises'] cache key with MesocycleManager/CoachRoadmapView —
  // seeding only runs from whichever mount actually performs the fetch, same
  // as the old "if (exercises.length === 0)" guard only ever ran it once.
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => seedExercisesIfEmpty().then(getExercises),
  });

  // ── Nutrition/diet ─────────────────────────────────────────────────────────
  // Self-managed diets ("Mis Dietas") are private to the athlete — the coach's
  // "Dietas disponibles" tab only lists/assigns diets the coach itself authored.
  // Deliberately a DIFFERENT key from plain ['dietsForAthlete', email]
  // (NutritionAnalysisPanel/CoachRoadmapView fetch that one unfiltered and
  // filter locally) — this one bakes the filter into the queryFn, so sharing
  // one key across both shapes would make whichever query wins the mount race
  // silently feed the wrong list to the other. The 'coachOnly' suffix keeps
  // this a separate cache entry (one extra read vs. true sharing, but correct).
  const athleteDietsKey = ['dietsForAthlete', athlete.email, 'coachOnly'] as const;
  const { data: athleteDiets = [] } = useQuery({
    queryKey: athleteDietsKey,
    queryFn: () => getDietsForAthlete(athlete.email).then(list => list.filter(d => !d.selfManaged)),
  });
  const setAthleteDiets = (updater: React.SetStateAction<Diet[]>) =>
    queryClient.setQueryData<Diet[]>(athleteDietsKey, prev =>
      typeof updater === 'function' ? (updater as (p: Diet[]) => Diet[])(prev ?? []) : updater);

  const athleteDietConfigKey = ['athleteDietConfig', athlete.email] as const;
  const { data: athleteDietConfig = null } = useQuery({
    queryKey: athleteDietConfigKey,
    queryFn: () => getAthleteDietConfig(athlete.email),
  });

  const nutritionConfigKey = ['athleteNutritionConfig', athlete.email] as const;
  const { data: nutritionConfig = null } = useQuery({
    queryKey: nutritionConfigKey,
    queryFn: () => getAthleteNutritionConfig(athlete.email),
  });

  // ── Photos ─────────────────────────────────────────────────────────────────
  const { data: athletePhotos = [], isPending: loadingPhotos } = useQuery({
    queryKey: ['progressPhotos', athlete.email],
    queryFn: () => getProgressPhotos(athlete.email),
  });

  // Weekly menu (recipe-first): list of drafts/published/archived — feeds both
  // the Dietas tab (editor state is local to ClientDietsPanel) and the menu
  // adherence rate computed there.
  const weeklyMenusKey = ['weeklyMenusForAthlete', athlete.email] as const;
  const { data: weeklyMenus = [] } = useQuery({
    queryKey: weeklyMenusKey,
    queryFn: () => getWeeklyMenusForAthlete(athlete.email),
  });
  const setWeeklyMenus = (updater: React.SetStateAction<WeeklyMenu[]>) =>
    queryClient.setQueryData<WeeklyMenu[]>(weeklyMenusKey, prev =>
      typeof updater === 'function' ? (updater as (p: WeeklyMenu[]) => WeeklyMenu[])(prev ?? []) : updater);

  const { data: menuCompletionLogs = [] } = useQuery({
    queryKey: ['menuCompletionLogsForAthlete', athlete.email],
    queryFn: () => getMenuCompletionLogsForAthlete(athlete.email),
  });

  // Plan duration — snapshot-diff dirty check, same pattern as NutritionScreen's
  // dietSnapshot/isDirty (src/components/NutritionScreen.tsx), so an edit here
  // can't be silently discarded by switching tabs or leaving the Hub.
  const planSnapshot = (start: string, months: number) => `${start}|${months}`;
  const [planStart, setPlanStart] = useState(athlete.planStartDate ?? '');
  const [planMonths, setPlanMonths] = useState<3 | 6 | 12>(athlete.planDurationMonths ?? 3);
  const [savedPlanSnapshot, setSavedPlanSnapshot] = useState(() => planSnapshot(athlete.planStartDate ?? '', athlete.planDurationMonths ?? 3));
  const [savingPlan, setSavingPlan] = useState(false);
  const isPlanDirty = planSnapshot(planStart, planMonths) !== savedPlanSnapshot;

  const confirmDiscardPlanChanges = () =>
    !isPlanDirty || window.confirm('Tienes cambios sin guardar en la duración del plan. ¿Continuar y descartarlos?');
  const guardedTabChange = (tab: HubTab) => { if (confirmDiscardPlanChanges()) onTabChange(tab); };
  const guardedBack = () => { if (confirmDiscardPlanChanges()) onBack(); };

  // Zona activa (nav de nivel 1) + última pestaña visitada por zona, para que
  // saltar entre zonas y volver no te devuelva siempre a la primera pestaña.
  const [activeZone, setActiveZone] = useState<Zone>(() => zoneOf(activeTab));
  const [lastTabByZone, setLastTabByZone] = useState<Partial<Record<Zone, HubTab>>>({});
  useEffect(() => {
    const z = zoneOf(activeTab);
    setActiveZone(z);
    setLastTabByZone(prev => ({ ...prev, [z]: activeTab }));
  }, [activeTab]);
  const goToZone = (zone: Zone) => {
    if (zone === activeZone) return;
    guardedTabChange(lastTabByZone[zone] ?? ZONE_TABS[zone][0]);
  };

  // Altura real del bloque sticky de pestañas (nav de zona + sub-pestañas si
  // la zona tiene más de una), medida y no escrita a mano: la segunda fila
  // solo existe a veces, así que la altura cambia según la zona. Publicada
  // como --hub-sticky-top para que paneles embebidos (p. ej. la barra de
  // intercambios de nutrición) se peguen justo debajo sin taparla.
  const subnavRef = useRef<HTMLDivElement>(null);
  const [subnavHeight, setSubnavHeight] = useState(0);
  useEffect(() => {
    const el = subnavRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height;
      if (h !== undefined) setSubnavHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeZone]);

  // ── Questionnaires ─────────────────────────────────────────────────────────
  const coachQuestionnairesKey = ['questionnairesByCoach', coachId] as const;
  const { data: coachQuestionnaires = [] } = useQuery({
    queryKey: coachQuestionnairesKey,
    queryFn: () => getQuestionnairesByCoach(coachId),
  });
  const setCoachQuestionnaires = (updater: React.SetStateAction<Questionnaire[]>) =>
    queryClient.setQueryData<Questionnaire[]>(coachQuestionnairesKey, prev =>
      typeof updater === 'function' ? (updater as (p: Questionnaire[]) => Questionnaire[])(prev ?? []) : updater);

  const athleteQAssignmentsKey = ['assignmentsForAthlete', athlete.email] as const;
  const { data: athleteQAssignments = [] } = useQuery({
    queryKey: athleteQAssignmentsKey,
    queryFn: () => getAssignmentsForAthlete(athlete.email),
  });
  const setAthleteQAssignments = (updater: React.SetStateAction<QuestionnaireAssignment[]>) =>
    queryClient.setQueryData<QuestionnaireAssignment[]>(athleteQAssignmentsKey, prev =>
      typeof updater === 'function' ? (updater as (p: QuestionnaireAssignment[]) => QuestionnaireAssignment[])(prev ?? []) : updater);

  const athleteQResponsesKey = ['responsesForAthlete', athlete.email] as const;
  const { data: athleteQResponses = [] } = useQuery({
    queryKey: athleteQResponsesKey,
    queryFn: () => getResponsesForAthlete(athlete.email),
  });
  const setAthleteQResponses = (updater: React.SetStateAction<QuestionnaireResponse[]>) =>
    queryClient.setQueryData<QuestionnaireResponse[]>(athleteQResponsesKey, prev =>
      typeof updater === 'function' ? (updater as (p: QuestionnaireResponse[]) => QuestionnaireResponse[])(prev ?? []) : updater);

  // ── Photo check-in assignments ────────────────────────────────────────────
  const athletePhotoAssignmentsKey = ['photoAssignmentsForAthlete', athlete.email] as const;
  const { data: athletePhotoAssignments = [] } = useQuery({
    queryKey: athletePhotoAssignmentsKey,
    queryFn: () => getPhotoAssignmentsForAthlete(athlete.email),
  });
  const setAthletePhotoAssignments = (updater: React.SetStateAction<PhotoAssignment[]>) =>
    queryClient.setQueryData<PhotoAssignment[]>(athletePhotoAssignmentsKey, prev =>
      typeof updater === 'function' ? (updater as (p: PhotoAssignment[]) => PhotoAssignment[])(prev ?? []) : updater);

  // ── Bodyweight logs (for Análisis tab) ────────────────────────────────────
  // Shared query key/hook with BodyweightPanel (writer) and CoachRoadmapView
  // (reader) — see src/hooks/useAthleteWeight.ts.
  const { logs: bodyweightLogs } = useAthleteWeight(athlete.email);

  // Reportes del atleta — solo se usa aquí para el recordatorio en PendingTray
  // (ReportsPanel mantiene su propia copia con más detalle cuando esa pestaña está abierta).
  const { data: coachReports = [] } = useQuery({
    queryKey: ['coachReportsForAthlete', athlete.email],
    queryFn: () => getCoachReportsForAthlete(athlete.email),
  });
  // Propuestas del asistente IA pendientes de revisión — se aprueban/rechazan
  // desde las tarjetas del panel de chat (AiChatPanel), no aquí. Filter baked
  // into the queryFn to match AiChatPanel's identical query for this key.
  const { data: aiProposals = [] } = useQuery({
    queryKey: ['aiProposalsForAthlete', athlete.email],
    queryFn: () => getAiProposalsForAthlete(athlete.email).then(list => list.filter(p => p.status === 'proposed')),
  });

  const athleteCheckins = checkins.filter(
    c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
  );

  const adherence = computeAdherenceScore(assignments, athleteCheckins);
  const adh        = adherence.hasData ? scoreStyle(adherence.score) : SIN_DATOS_ADHERENCIA;

  // ── Resumen del Hub (F3.13b) ──────────────────────────────────────────────
  // RIR medio de las últimas 4 semanas (rirStats.ts) — el peso más reciente lo
  // calcula ClientOverviewCard internamente con el mismo criterio.
  const avgRir = computeAverageRir(athleteLogs);
  // "Próxima revisión" del handoff = el próximo check-in que el coach aún no
  // ha revisado (sin feedback ni aprobar) — es exactamente lo que Revisiones
  // resuelve, así que el CTA salta directo ahí.
  const pendingCheckins = athleteCheckins.filter(c => !c.coachFeedback && !c.approved);

  // ── Exercise history ───────────────────────────────────────────────────────
  const getWorkout = (id: string) => workouts.find(w => w.id === id);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleToggleDiet = async (dietId: string) => {
    const current = athleteDietConfig ?? { athleteId: athlete.email, activeDietIds: [] };
    // Old docs can predate this field — never trust it to be present just because the type says so.
    const activeDietIds = current.activeDietIds ?? [];
    const next: AthleteDietConfig = {
      ...current,
      activeDietIds: activeDietIds.includes(dietId)
        ? activeDietIds.filter(id => id !== dietId)
        : [...activeDietIds, dietId],
    };
    queryClient.setQueryData(athleteDietConfigKey, next);
    await saveAthleteDietConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar el cambio de dieta.'); });
  };

  const handleScheduleDay = async (day: WeekDay, dietId: string | null) => {
    const current = athleteDietConfig ?? { athleteId: athlete.email, activeDietIds: [] };
    const next: AthleteDietConfig = {
      ...current,
      weeklySchedule: { ...current.weeklySchedule, [day]: dietId },
    };
    queryClient.setQueryData(athleteDietConfigKey, next);
    await saveAthleteDietConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar el calendario de dietas.'); });
  };

  const handleToggleDietMode = async (mode: DietMode) => {
    if (!nutritionConfig) return;
    const enabledModes = nutritionConfig.enabledModes ?? [];
    const already  = enabledModes.includes(mode);
    const updated  = already
      ? enabledModes.filter(m => m !== mode)
      : [...enabledModes, mode];
    if (updated.length === 0) return;
    const next: AthleteNutritionConfig = { ...nutritionConfig, enabledModes: updated };
    queryClient.setQueryData(nutritionConfigKey, next);
    await saveAthleteNutritionConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar el modo de dieta.'); });
  };

  const handleSaveStepConfig = async (updates: Partial<Pick<AthleteNutritionConfig, 'stepGoal' | 'kcalPerStep'>>) => {
    const current = nutritionConfig ?? { athleteId: athlete.email, enabledModes: ['OMNIVORO'] as DietMode[] };
    const next: AthleteNutritionConfig = { ...current, ...updates };
    queryClient.setQueryData(nutritionConfigKey, next);
    await saveAthleteNutritionConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar la configuración de pasos.'); });
  };

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      await updateUserProfile(athlete.userId, {
        planStartDate: planStart || undefined,
        planDurationMonths: planStart ? planMonths : undefined,
      });
      setSavedPlanSnapshot(planSnapshot(planStart, planMonths));
      showToast('Plan actualizado.', 'success');
    } catch (err) {
      console.error('Error guardando plan:', err);
      showToast('No se pudo guardar el plan.');
    } finally {
      setSavingPlan(false);
    }
  };

  const { daysLeft, weekNumber, totalWeeks } = calcPlanExpiry({ planStartDate: planStart, planDurationMonths: planMonths });
  // "Semana 11 de 24" (patrón HubFit) en vez de solo días restantes — dice
  // más al programar. El vencimiento, que sí es accionable/urgente, se queda
  // como texto secundario junto al email en vez de desaparecer del todo.
  const planBadge = daysLeft !== null ? (
    <Badge tone={daysLeft > 30 ? 'success' : daysLeft >= 0 ? 'warning' : 'danger'}>
      {weekNumber !== null && totalWeeks !== null ? `Semana ${weekNumber} de ${totalWeeks}` : (daysLeft >= 0 ? `Vence en ${daysLeft}d` : `Vencido hace ${-daysLeft}d`)}
    </Badge>
  ) : null;
  const planExpiryCaption = daysLeft !== null
    ? (daysLeft >= 0 ? `Vence en ${daysLeft}d` : `Vencido hace ${-daysLeft}d`)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-hairline space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={guardedBack}
            className="p-1 px-3 bg-raised hover:bg-raised text-accent border border-hairline text-label font-sans rounded-control flex items-center gap-1 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-body-s">arrow_back</span>
            Clientes
          </button>
          <button
            onClick={() => { if (confirmDiscardPlanChanges()) setSwitcherOpen(true); }}
            title="Cambiar de atleta"
            aria-label="Cambiar de atleta"
            className="p-1 px-2 bg-raised hover:bg-raised text-ink-2 hover:text-accent border border-hairline rounded-control flex items-center active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-body-s">swap_horiz</span>
          </button>
          <img src={athlete.avatarUrl} alt="" className="w-11 h-11 rounded-full border border-accent/30 object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-black uppercase text-ink text-title-l leading-tight tracking-tight">{athlete.displayName}</h1>
              {planBadge}
            </div>
            <p className="font-mono text-caption text-ink-2">
              {athlete.email}
              {planExpiryCaption && <span className="text-ink-3"> · {planExpiryCaption}</span>}
            </p>
          </div>
        </div>

        {/* Lo urgente, siempre visible sea cual sea la pestaña. Lo
            descriptivo (KPIs, fase, objetivo, nota, últimos cambios) vive
            ahora en la pestaña Ficha — ver ClientFichaPanel. */}
        <ClientAlertsBar
          planUnpublished={assignments.length === 0}
          pendingReviewsCount={pendingCheckins.length}
          onGoToEntrenamientos={() => guardedTabChange('entrenamientos')}
          onGoToRevisiones={() => guardedTabChange('revisiones')}
        />
      </div>

      {/* Pendientes de hoy — lo accionable, independiente de la zona/pestaña activa */}
      <PendingTray
        athleteLogs={athleteLogs}
        getWorkout={getWorkout}
        coachReports={coachReports}
        aiProposals={aiProposals}
        onGoToNotes={() => { setActiveZone('plan'); guardedTabChange('entrenamientos'); }}
        onGoToReports={() => { setActiveZone('analisis'); guardedTabChange('reportes'); }}
        onGoToAiProposals={() => window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT))}
      />

      {/* Nav de zonas (nivel 1). z-subnav, no z-sticky: los paneles que se
          montan dentro (matriz de series, barra de intercambios…) también
          usan sticky con z-sticky, y a igualdad de z-index gana el que va
          después en el DOM — las pestañas quedaban tapadas por su propio
          contenido. */}
      <div ref={subnavRef} className="sticky top-[var(--header-h)] z-[var(--z-subnav)] bg-field/95 backdrop-blur-sm space-y-2 ">
        <Tabs
          items={(Object.keys(ZONE_TABS) as Zone[]).map(zone => ({ id: zone, label: ZONE_META[zone].label, icon: ZONE_META[zone].icon }))}
          value={activeZone}
          onChange={id => goToZone(id as Zone)}
          label="Zonas del cliente"
        />

        {/* Sub-tabs de la zona activa (solo si tiene más de una) */}
        {ZONE_TABS[activeZone].length > 1 && (
          <Tabs
            items={ZONE_TABS[activeZone].map(tab => ({ id: tab, label: TAB_META[tab].label, icon: TAB_META[tab].icon }))}
            value={activeTab}
            onChange={id => guardedTabChange(id as HubTab)}
            label="Secciones de la zona"
          />
        )}
      </div>

      {/* Un solo Suspense para las diez pestañas: solo hay una montada a la
          vez, así que diez serían diez veces el mismo hueco.
          --hub-sticky-top: publica dónde termina el bloque sticky de arriba
          para que paneles embebidos con su propio sticky (p. ej. la barra de
          intercambios de nutrición) se peguen justo debajo, sin taparlo. */}
      <div style={{ ['--hub-sticky-top' as string]: `calc(var(--header-h) + ${subnavHeight}px)` } as React.CSSProperties}>
      <Suspense fallback={<Skeleton className="w-full h-64 rounded-surface" />}>

      {/* ── Tab: Setup ──────────────────────────────────────────────────────── */}
      {activeTab === 'setup' && (
        <ClientSetupPanel
          key={athlete.email}
          athlete={athlete}
          checkins={athleteCheckins}
          onboarding={onboardingData}
          mesocycles={mesocycles}
          workoutAssignments={assignments}
          diets={athleteDiets}
          dietConfig={athleteDietConfig}
          nutritionConfig={nutritionConfig}
          qAssignments={athleteQAssignments}
          photoAssignments={athletePhotoAssignments}
          photos={athletePhotos}
          workoutLogs={athleteLogs}
          onGoToTab={guardedTabChange}
        />
      )}

      {/* ── Tab: Revisiones ────────────────────────────────────────────────── */}
      {activeTab === 'revisiones' && (
        <ClientReviewsPanel
          key={athlete.email}
          athlete={athlete}
          coachId={coachId}
          athleteCheckins={athleteCheckins}
          onRefreshCheckIns={onRefreshCheckIns}
          athleteQResponses={athleteQResponses}
          setAthleteQResponses={setAthleteQResponses}
          coachQuestionnaires={coachQuestionnaires}
          setCoachQuestionnaires={setCoachQuestionnaires}
          athleteQAssignments={athleteQAssignments}
          setAthleteQAssignments={setAthleteQAssignments}
        />
      )}

      {/* ── Tab: Ficha ───────────────────────────────────────────────────── */}
      {activeTab === 'ficha' && (
        <ClientFichaPanel
          key={athlete.email}
          athlete={athlete}
          onboardingData={onboardingData}
          setOnboardingData={setOnboardingData}
          onboardingTemplate={onboardingTemplate}
          planStart={planStart}
          onPlanStartChange={setPlanStart}
          planMonths={planMonths}
          onPlanMonthsChange={setPlanMonths}
          savingPlan={savingPlan}
          onSavePlan={handleSavePlan}
          mesocycles={mesocycles}
          checkins={athleteCheckins}
          coachReports={coachReports}
          athleteLogs={athleteLogs}
          bodyweightLogs={bodyweightLogs}
          adherenceScore={adherence.hasData ? adherence.score : null}
          adherenceStyle={adh}
          averageRir={avgRir}
        />
      )}

      {/* ── Tab: Cuerpo ──────────────────────────────────────────────────── */}
      {activeTab === 'cuerpo' && (
        <ClientBodyPanel
          key={athlete.email}
          athlete={athlete}
          athletePhotos={athletePhotos}
          loadingPhotos={loadingPhotos}
          athletePhotoAssignments={athletePhotoAssignments}
          setAthletePhotoAssignments={setAthletePhotoAssignments}
          athleteQResponses={athleteQResponses}
          coachQuestionnaires={coachQuestionnaires}
        />
      )}

      {/* ── Tab: Entrenamientos ───────────────────────────────────────────── */}
      {activeTab === 'entrenamientos' && (
        <ClientWorkoutsPanel
          athlete={athlete}
          coachId={coachId}
          mesocycles={mesocycles}
          athleteLogs={athleteLogs}
          setAthleteLogs={setAthleteLogs}
          exercises={exercises}
          onboardingData={onboardingData}
          assignments={assignments}
          setAssignments={setAssignments}
          workouts={workouts}
          getWorkout={getWorkout}
        />
      )}

      {/* ── Tab: Dietas ───────────────────────────────────────────────────── */}
      {activeTab === 'dietas' && (
        <ClientDietsPanel
          athlete={athlete}
          coachId={coachId}
          onboardingData={onboardingData}
          setOnboardingData={setOnboardingData}
          athleteDiets={athleteDiets}
          setAthleteDiets={setAthleteDiets}
          athleteDietConfig={athleteDietConfig}
          nutritionConfig={nutritionConfig}
          weeklyMenus={weeklyMenus}
          setWeeklyMenus={setWeeklyMenus}
          menuCompletionLogs={menuCompletionLogs}
          bodyweightLogs={bodyweightLogs}
          onToggleDiet={handleToggleDiet}
          onScheduleDay={handleScheduleDay}
          onToggleDietMode={handleToggleDietMode}
          onSaveStepConfig={handleSaveStepConfig}
        />
      )}

      {/* ── Tab: Road map ─────────────────────────────────────────────────── */}
      {activeTab === 'roadmap' && (
        <ClientRoadmapPanel athleteEmail={athlete.email} />
      )}

      {/* ── Tab: Reportes ────────────────────────────────────────────────── */}
      {activeTab === 'reportes' && (
        <ReportsPanel
          athleteEmail={athlete.email}
          athleteName={athlete.displayName}
          coachId={coachId}
          logs={athleteLogs}
          exercises={exercises}
          assignments={assignments}
          bodyweightLogs={bodyweightLogs}
          targetWeight={athlete.targetWeight}
        />
      )}

      {/* ── Tab: Nutrición (análisis) ────────────────────────────────────── */}
      {activeTab === 'analisis-nutricion' && (
        <NutritionAnalysisPanel
          athleteEmail={athlete.email}
          athleteName={athlete.displayName}
          targetWeight={athlete.targetWeight}
        />
      )}

      {/* ── Tab: Correlaciones ───────────────────────────────────────────── */}
      {activeTab === 'correlaciones' && (
        <CorrelationPanel
          athleteEmail={athlete.email}
          logs={athleteLogs}
          exercises={exercises}
          responses={athleteQResponses}
          questionnaires={coachQuestionnaires}
          bodyweightLogs={bodyweightLogs}
          assignments={assignments}
        />
      )}

      </Suspense>
      </div>

      {/* Selector de atleta — la key={athlete.email} del padre (ClientsScreen)
          ya garantiza un remonte limpio del Hub entero al navegar aquí. */}
      {switcherOpen && (
        <Sheet open onClose={() => setSwitcherOpen(false)} title="Cambiar de atleta" size="m">
          <div className="space-y-3">
            <SearchField value={switcherSearch} onChange={setSwitcherSearch} placeholder="Buscar atleta..." label="Buscar atleta" />
            <div className="space-y-1">
              {switcherAthletes.length === 0 ? (
                <p className="font-sans text-body-s text-ink-2 text-center py-6">Ningún atleta coincide.</p>
              ) : switcherAthletes.map(a => (
                <ListRow
                  key={a.userId}
                  title={a.displayName}
                  subtitle={a.email}
                  leading={<img src={a.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />}
                  trailing={<Icon name="chevron_right" size="m" className="text-ink-4" />}
                  onClick={() => { setSwitcherOpen(false); navigate(`/clients/${encodeURIComponent(a.email)}`); }}
                />
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
