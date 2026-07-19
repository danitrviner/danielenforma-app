import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserProfile, WeightCheckIn, Workout, WorkoutAssignment, WorkoutLog,
  Exercise, Diet, AthleteDietConfig, AthleteNutritionConfig, DietMode,
  FoodCategory, ProgressPhoto, PhotoAssignment,
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse,
  OnboardingData, WeekDay, BodyweightLog,
  OnboardingTemplateQuestion, Mesocycle, CoachReport, AiProposal, WeeklyMenu,
} from '../types';
import { OPEN_AI_PANEL_EVENT } from '../ai/events';
import { computeAdherenceScore, scoreStyle } from '../utils/adherence';
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
  getWeeklyMenusForAthlete, getMenuCompletionLogsForAthlete,
} from '../dbService';
import ClientRoadmapPanel from './ClientRoadmapPanel';
import ClientAnalysisPanel from './ClientAnalysisPanel';
import ClientDietsPanel from './ClientDietsPanel';
import ClientWorkoutsPanel from './ClientWorkoutsPanel';
import ClientReviewsPanel from './ClientReviewsPanel';
import ClientSetupPanel from './ClientSetupPanel';
import PendingTray from './PendingTray';
import ClientStatusCard from './ClientStatusCard';

export type HubTab = 'setup' | 'revisiones' | 'entrenamientos' | 'dietas' | 'roadmap' | 'analisis';
export type AnalisisTab = 'correlaciones' | 'nutricion' | 'reportes';
export const HUB_TABS: readonly HubTab[] = ['setup', 'revisiones', 'entrenamientos', 'dietas', 'roadmap', 'analisis'];
export const ANALISIS_TABS: readonly AnalisisTab[] = ['reportes', 'nutricion', 'correlaciones'];

// Las 6 pestañas se agrupan en 3 zonas para responder a una pregunta distinta
// cada una: qué reviso (Hoy), qué programo (Plan), cómo va (Análisis). La URL
// sigue direccionando por HubTab — la zona es puramente de navegación/UI, así
// que los deep links y ClientSetupPanel.onGoToTab no cambian.
type Zone = 'hoy' | 'plan' | 'analisis';
const ZONE_TABS: Record<Zone, HubTab[]> = {
  hoy: ['revisiones', 'setup'],
  plan: ['entrenamientos', 'dietas', 'roadmap'],
  analisis: ['analisis'],
};
const ZONE_META: Record<Zone, { label: string; icon: string }> = {
  hoy: { label: 'Hoy', icon: 'today' },
  plan: { label: 'Plan', icon: 'event_note' },
  analisis: { label: 'Análisis', icon: 'insights' },
};
const TAB_META: Record<HubTab, { label: string; icon: string }> = {
  setup:          { label: 'Setup',          icon: 'checklist' },
  revisiones:     { label: 'Revisiones',     icon: 'rate_review' },
  entrenamientos: { label: 'Entrenamientos', icon: 'fitness_center' },
  dietas:         { label: 'Dietas',         icon: 'nutrition' },
  roadmap:        { label: 'Road map',       icon: 'map' },
  analisis:       { label: 'Análisis',       icon: 'insights' },
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
  analisisTab: AnalisisTab;
  onAnalisisTabChange: (tab: AnalisisTab) => void;
}

export default function ClientHub({
  athlete, coachId, coachEmail, checkins, onRefreshCheckIns, onBack,
  activeTab, onTabChange, analisisTab, onAnalisisTabChange,
}: ClientHubProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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
  const adh        = scoreStyle(adherence.score);

  // ── Weekly compliance ──────────────────────────────────────────────────────
  const getWeekRange = () => {
    const today = new Date();
    const day = today.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
  };
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const weekAssignments = assignments.filter(a => a.date >= weekStart && a.date <= weekEnd);
  const weekCompleted   = weekAssignments.filter(a => a.status === 'completed').length;
  const weekTotal       = weekAssignments.length;
  const weekPct         = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

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

  const { daysLeft } = calcPlanExpiry({ planStartDate: planStart, planDurationMonths: planMonths });
  const planBadge = daysLeft !== null ? (
    <span className={`text-[9px] font-sans font-bold uppercase px-2 py-0.5 rounded-lg border flex-shrink-0 ${
      daysLeft > 30  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
      daysLeft >= 0  ? 'bg-orange-500/10  text-orange-300  border-orange-500/20'  :
                       'bg-red-500/10     text-red-300     border-red-500/20'
    }`}>
      {daysLeft >= 0 ? `Vence en ${daysLeft}d` : `Vencido hace ${-daysLeft}d`}
    </span>
  ) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-white/60 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={guardedBack}
            className="p-1 px-3 bg-[#1c1b1b] hover:bg-[#2c2b2b] text-[#fbcb1a] border border-white/7 text-xs font-mono rounded flex items-center gap-1 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Clientes
          </button>
          <img src={athlete.avatarUrl} alt="" className="w-9 h-9 rounded-full border border-[#fbcb1a]/30 object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-sans font-bold text-white text-xl leading-tight">{athlete.displayName}</h1>
              {planBadge}
            </div>
            <p className="font-mono text-[10px] text-[#c6c9ab]">{athlete.email}</p>
            {/* Adherence score badge */}
            <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md border font-mono ${adh.bg}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>monitor_heart</span>
              <span className={`text-[9px] font-bold uppercase ${adh.text}`}>{adh.label}</span>
              <span className={`text-sm font-black ${adh.text}`}>{adherence.score}</span>
            </div>
          </div>
        </div>
        {/* Plan duration config */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-[#c6c9ab] uppercase">Plan:</span>
          <input
            type="date"
            value={planStart}
            onChange={e => setPlanStart(e.target.value)}
            className="bg-[#1e1e1b] border border-white/7 rounded px-2 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] min-h-[36px]"
          />
          <select
            value={planMonths}
            onChange={e => setPlanMonths(Number(e.target.value) as 3 | 6 | 12)}
            className="bg-[#1e1e1b] border border-white/7 rounded px-2 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] min-h-[36px]"
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
          <button
            onClick={handleSavePlan}
            disabled={savingPlan}
            className="px-3 py-2 min-h-[36px] bg-[#fbcb1a] text-black font-sans text-[10px] font-bold uppercase rounded hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
          >
            {savingPlan ? '...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Pendientes de hoy — lo accionable, independiente de la zona/pestaña activa */}
      <PendingTray
        athleteLogs={athleteLogs}
        getWorkout={getWorkout}
        athleteCheckins={athleteCheckins}
        coachReports={coachReports}
        aiProposals={aiProposals}
        onGoToNotes={() => { setActiveZone('plan'); guardedTabChange('entrenamientos'); }}
        onGoToCheckins={() => { setActiveZone('hoy'); guardedTabChange('revisiones'); }}
        onGoToReports={() => { setActiveZone('analisis'); guardedTabChange('analisis'); onAnalisisTabChange('reportes'); }}
        onGoToAiProposals={() => window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT))}
      />

      {/* Estado del cliente — fase, objetivo, últimos cambios y nota del coach */}
      <ClientStatusCard
        athlete={athlete}
        onboardingData={onboardingData}
        mesocycles={mesocycles}
        checkins={athleteCheckins}
        coachReports={coachReports}
        athleteLogs={athleteLogs}
        bodyweightLogs={bodyweightLogs}
      />

      {/* Nav de zonas (nivel 1) */}
      <div className="sticky top-0 z-20 bg-[#141414]/95 backdrop-blur-sm space-y-1.5 pb-0.5">
        <div className="flex bg-[#181816] border border-white/7 p-1 rounded-2xl gap-1">
          {(Object.keys(ZONE_TABS) as Zone[]).map(zone => (
            <button
              key={zone}
              onClick={() => goToZone(zone)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-sans text-xs font-bold uppercase tracking-wide transition-all ${
                activeZone === zone ? 'bg-[#fbcb1a] text-black' : 'text-[#c6c9ab] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">{ZONE_META[zone].icon}</span>
              {ZONE_META[zone].label}
            </button>
          ))}
        </div>

        {/* Sub-tabs de la zona activa (solo si tiene más de una) */}
        {ZONE_TABS[activeZone].length > 1 && (
          <div className="overflow-x-auto snap-x snap-mandatory -mx-1 px-1">
            <div className="flex gap-1 min-w-max">
              {ZONE_TABS[activeZone].map(tab => (
                <button
                  key={tab}
                  onClick={() => guardedTabChange(tab)}
                  className={`snap-start flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg font-mono text-[11px] font-bold uppercase tracking-wide transition-all whitespace-nowrap border ${
                    activeTab === tab
                      ? 'bg-[#fbcb1a]/10 border-[#fbcb1a]/40 text-[#fbcb1a]'
                      : 'border-transparent text-[#c6c9ab] hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{TAB_META[tab].icon}</span>
                  {TAB_META[tab].label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tab: Setup ──────────────────────────────────────────────────────── */}
      {activeTab === 'setup' && (
        <ClientSetupPanel
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
          onGoToAnalisis={onAnalisisTabChange}
        />
      )}

      {/* ── Tab: Revisiones ────────────────────────────────────────────────── */}
      {activeTab === 'revisiones' && (
        <ClientReviewsPanel
          athlete={athlete}
          coachId={coachId}
          athleteCheckins={athleteCheckins}
          onRefreshCheckIns={onRefreshCheckIns}
          athletePhotos={athletePhotos}
          loadingPhotos={loadingPhotos}
          athletePhotoAssignments={athletePhotoAssignments}
          setAthletePhotoAssignments={setAthletePhotoAssignments}
          onboardingData={onboardingData}
          setOnboardingData={setOnboardingData}
          onboardingTemplate={onboardingTemplate}
          assignments={assignments}
          workouts={workouts}
          athleteQResponses={athleteQResponses}
          setAthleteQResponses={setAthleteQResponses}
          coachQuestionnaires={coachQuestionnaires}
          setCoachQuestionnaires={setCoachQuestionnaires}
          athleteQAssignments={athleteQAssignments}
          setAthleteQAssignments={setAthleteQAssignments}
          weekTotal={weekTotal}
          weekCompleted={weekCompleted}
          weekPct={weekPct}
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

      {/* ── Tab: Análisis ─────────────────────────────────────────────────── */}
      {activeTab === 'analisis' && (
        <ClientAnalysisPanel
          athlete={athlete}
          coachId={coachId}
          athleteLogs={athleteLogs}
          exercises={exercises}
          assignments={assignments}
          bodyweightLogs={bodyweightLogs}
          athleteQResponses={athleteQResponses}
          coachQuestionnaires={coachQuestionnaires}
          analisisTab={analisisTab}
          onAnalisisTabChange={onAnalisisTabChange}
        />
      )}
    </div>
  );
}
