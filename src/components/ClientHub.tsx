import React, { useState, useEffect, useMemo } from 'react';
import {
  UserProfile, WeightCheckIn, Workout, WorkoutAssignment, WorkoutLog,
  Exercise, Diet, AthleteDietConfig, AthleteNutritionConfig, DietMode,
  FoodCategory, ProgressPhoto, PhotoView, PhotoAssignment,
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse,
  QSchedule, QScheduleType, OnboardingData, WeekDay, BodyweightLog,
  OnboardingTemplateQuestion, Mesocycle, CoachReport, AiProposal,
} from '../types';
import { OPEN_AI_PANEL_EVENT } from '../ai/events';
import { computeAdherenceScore, scoreStyle } from '../utils/adherence';
import { calcPlanExpiry } from '../hooks/usePlanExpiry';
import { invalidateResource } from '../hooks/useResourceCache';
import { useToast } from '../hooks/useToast';
import { DEFAULT_KCAL_PER_STEP } from '../utils/nutritionConstants';
import { scheduleLabel } from '../utils/scheduleEngine';
import { isDietPending } from '../utils/exchangeHelpers';
import {
  submitCoachFeedback, getWorkouts, getWorkoutAssignments,
  createWorkoutAssignment, deleteWorkoutAssignment, getWorkoutLogs, updateWorkoutLog,
  getExercises, seedExercisesIfEmpty, getDietsForAthlete,
  getAthleteNutritionConfig, saveAthleteNutritionConfig,
  getAthleteDietConfig, saveAthleteDietConfig, getProgressPhotos,
  updateUserProfile,
  getQuestionnairesByCoach, assignQuestionnaire, getAssignmentsForAthlete,
  getResponsesForAthlete, deactivateAssignment,
  assignPhotoCheckIn, getPhotoAssignmentsForAthlete, deactivatePhotoAssignment,
  updateCheckIn, deleteCheckIn,
  updateQuestionnaireResponse, deleteQuestionnaireResponse,
  getOnboarding, createQuestionnaire, getBodyweightForAthlete,
  getNutritionProgram, saveNutritionProgram, computeActivePhase, computePhaseStartDate, deleteNutritionProgram,
  getOnboardingTemplate, getMesocycles, getCoachReportsForAthlete, getAiProposalsForAthlete,
} from '../dbService';
import NutritionPeriodizationPanel from './NutritionPeriodizationPanel';
import ScheduleFields from './ScheduleFields';
import MesocycleManager from './MesocycleManager';
import MesocycleDashboard from './MesocycleDashboard';
import NutritionPlansScreen from './NutritionPlansScreen';
import QuestionnaireChartsPanel from './QuestionnaireChartsPanel';
import BodyweightPanel from './BodyweightPanel';
import OnboardingForm from './OnboardingForm';
import LoadHistoryPanel from './LoadHistoryPanel';
import QuestionnaireEditor, { FormState as QFormState, blankForm as blankQForm } from './QuestionnaireEditor';
import CorrelationPanel from './CorrelationPanel';
import ReportsPanel from './ReportsPanel';
import NutritionAnalysisPanel from './NutritionAnalysisPanel';
import CoachRoadmapView from './CoachRoadmapView';
import DietAutoGenerator from './DietAutoGenerator';
import FoodPreferencesPanel from './FoodPreferencesPanel';
import TaskManagerPanel from './TaskManagerPanel';
import ProgressRing from './ProgressRing';
import ExercisePersonalNotesPanel from './ExercisePersonalNotesPanel';
import ClientSetupPanel from './ClientSetupPanel';
import PendingTray from './PendingTray';
import ClientStatusCard from './ClientStatusCard';

const DIET_MODE_LABELS: Record<DietMode, string> = {
  OMNIVORO:  'Omnívoro',
  VEGANO:    'Vegano',
  SIN_PESAR: 'Sin pesar',
};

const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK_DAY_SHORT: Record<WeekDay, string> = { mon: 'L', tue: 'M', wed: 'X', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const WEEK_DAY_FULL: Record<WeekDay, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

const STATUS_LABEL: Record<WorkoutAssignment['status'], string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  skipped:   'Saltado',
  perdido:   'Perdido',
};

const STATUS_STYLE: Record<WorkoutAssignment['status'], string> = {
  pending:   'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  skipped:   'bg-[#2a2a2a] text-[#c6c9ab] border border-[#3a3a3a]',
  perdido:   'bg-red-500/10 text-red-300 border border-red-500/20',
};

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

const DIET_LABELS: Record<string, string> = {
  omnivoro: 'Omnívoro', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro',
};
const EXP_LABELS: Record<string, string> = {
  principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado',
};
const SECTION_LABELS: Record<string, string> = {
  entrenamiento: 'Entrenamiento', nutricion: 'Nutrición', descanso: 'Descanso / Recuperación',
};
const ACTIVITY_LABELS: Record<string, string> = {
  sedentario: 'Sedentario (×1.2)', poco_activo: 'Poco activo (×1.375)',
  activo: 'Activo (×1.55)', muy_activo: 'Muy activo (×1.725)',
};
const GOAL_BODY_LABELS: Record<string, string> = {
  aumentar_musculo: 'Aumentar músculo (+10%)',
  reducir_grasa:    'Reducir grasa (−20%)',
  mantener:         'Mantener (0%)',
};
const GOAL_CAP_LABELS: Record<string, string> = {
  fuerza: 'Fuerza', fuerza_resistencia: 'Fuerza-resistencia', salud: 'Salud',
};
const PROGRESS_FREQ_LABELS: Record<string, string> = {
  cada_semana: 'Cada semana', cada_varias_semanas: 'Cada varias semanas', con_dificultad: 'Con dificultad',
};
const TECHNIQUE_LABELS: Record<string, string> = {
  mala: 'Mala', regular: 'Regular', buena: 'Buena', muy_buena: 'Muy buena',
};

function displayAge(birthDate: string): number {
  const dob = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

function fmtExch(g: number, ef: number): string {
  const r = Math.round(g / ef / 0.25) * 0.25;
  return r % 1 === 0 ? r.toFixed(0) : r.toFixed(2);
}

export default function ClientHub({
  athlete, coachId, coachEmail, checkins, onRefreshCheckIns, onBack,
  activeTab, onTabChange, analisisTab, onAnalisisTabChange,
}: ClientHubProps) {
  const { showToast } = useToast();

  // Onboarding
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [editingOnboarding, setEditingOnboarding] = useState(false);
  // Colapsada por defecto: es referencia estática (rara vez cambia) y en su día
  // fue la sección que más ruido metía al abrir Revisiones — un resumen de una
  // línea basta la mayoría de las veces.
  const [fichaExpanded, setFichaExpanded] = useState(false);
  const [onboardingTemplate, setOnboardingTemplate] = useState<OnboardingTemplateQuestion[]>([]);

  // Check-in / feedback state
  const [selectedView, setSelectedView] = useState<PhotoView>('front');
  const [activeCheckInId, setActiveCheckInId] = useState<string>('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  // Assignment state
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignWorkoutId, setAssignWorkoutId] = useState('');
  const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAssigning, setIsAssigning] = useState(false);

  // Load history
  const [athleteLogs, setAthleteLogs] = useState<WorkoutLog[]>([]);
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  // Nutrition/diet
  const [athleteDiets, setAthleteDiets] = useState<Diet[]>([]);
  const [athleteDietConfig, setAthleteDietConfig] = useState<AthleteDietConfig | null>(null);
  const [nutritionConfig, setNutritionConfig] = useState<AthleteNutritionConfig | null>(null);

  // Diets scheduled across the week (día A/B/C) that the athlete hasn't finished
  // filling in yet — surfaced so the coach knows who still owes the athlete nothing,
  // but the athlete still owes themselves food items to hit the budget assigned.
  const pendingScheduledDiets = useMemo(() => {
    const scheduledIds = new Set(Object.values(athleteDietConfig?.weeklySchedule ?? {}).filter((id): id is string => typeof id === 'string'));
    return athleteDiets.filter(d => scheduledIds.has(d.id) && isDietPending(d));
  }, [athleteDiets, athleteDietConfig]);

  // Photos
  const [athletePhotos, setAthletePhotos] = useState<ProgressPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  // Diet editor state: undefined = closed, null = create new, Diet = edit existing
  const [dietEditorDiet, setDietEditorDiet] = useState<Diet | null | undefined>(undefined);
  const [showGenerator,  setShowGenerator]  = useState(false);

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

  // Questionnaires
  const [coachQuestionnaires, setCoachQuestionnaires] = useState<Questionnaire[]>([]);
  const [athleteQAssignments, setAthleteQAssignments] = useState<QuestionnaireAssignment[]>([]);
  const [athleteQResponses, setAthleteQResponses] = useState<QuestionnaireResponse[]>([]);
  const [assignQId, setAssignQId] = useState('');
  const [assignSchedType, setAssignSchedType] = useState<QScheduleType>('once');
  const [assignWeekdays, setAssignWeekdays] = useState<number[]>([]);
  const [assignIntervalDays, setAssignIntervalDays] = useState(7);
  const [assignDayOfMonth, setAssignDayOfMonth] = useState(1);
  const [assignStartDate, setAssignStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigningQ, setAssigningQ] = useState(false);
  // Inline new-questionnaire editor
  const [showNewQEditor, setShowNewQEditor] = useState(false);
  const [newQForm, setNewQForm]             = useState<QFormState>(blankQForm());
  const [savingNewQ, setSavingNewQ]         = useState(false);

  // Photo check-in assignments
  const [athletePhotoAssignments, setAthletePhotoAssignments] = useState<PhotoAssignment[]>([]);
  const [assignPhotoViews, setAssignPhotoViews]         = useState<PhotoView[]>(['front']);
  const [assignPhotoSchedType, setAssignPhotoSchedType] = useState<QScheduleType>('once');
  const [assignPhotoWeekdays, setAssignPhotoWeekdays]   = useState<number[]>([]);
  const [assignPhotoIntervalDays, setAssignPhotoIntervalDays] = useState(7);
  const [assignPhotoDayOfMonth, setAssignPhotoDayOfMonth]     = useState(1);
  const [assignPhotoStartDate, setAssignPhotoStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigningPhoto, setAssigningPhoto] = useState(false);

  // Bodyweight logs (for Análisis tab)
  const [bodyweightLogs, setBodyweightLogs] = useState<BodyweightLog[]>([]);

  // Reportes del atleta — solo se usa aquí para el recordatorio en PendingTray
  // (ReportsPanel mantiene su propia copia con más detalle cuando esa pestaña está abierta).
  const [coachReports, setCoachReports] = useState<CoachReport[]>([]);
  // Propuestas del asistente IA pendientes de revisión — se aprueban/rechazan
  // desde las tarjetas del panel de chat (AiChatPanel), no aquí.
  const [aiProposals, setAiProposals] = useState<AiProposal[]>([]);
  // Lista de entrenamientos asignados plegada por defecto (puede ser muy larga)
  const [assignmentsExpanded, setAssignmentsExpanded] = useState(false);

  // Unified review list state
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [unifiedFeedbackText, setUnifiedFeedbackText] = useState('');
  const [unifiedFeedbackError, setUnifiedFeedbackError] = useState('');
  const [unifiedFeedbackSuccess, setUnifiedFeedbackSuccess] = useState('');
  const [unifiedSubmitting, setUnifiedSubmitting] = useState(false);

  // R7 — inline editing of check-ins and questionnaire responses
  const [editingReviewKey, setEditingReviewKey] = useState<string | null>(null);
  const [checkinEditForm, setCheckinEditForm] = useState<{
    weight: number; adherence: WeightCheckIn['adherence']; mood: string; notes: string; dateStr: string;
  } | null>(null);
  const [responseEditAnswers, setResponseEditAnswers] = useState<QuestionnaireResponse['answers']>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingReviewKey, setDeletingReviewKey] = useState<string | null>(null);

  const athleteCheckins = checkins.filter(
    c => c.userId === athlete.userId || c.email.toLowerCase() === athlete.email.toLowerCase()
  );

  const adherence = computeAdherenceScore(assignments, athleteCheckins);
  const adh        = scoreStyle(adherence.score);

  useEffect(() => {
    const first = athleteCheckins[0];
    if (first) {
      setActiveCheckInId(first.id);
      setFeedbackText(first.coachFeedback || '');
    }
  }, [athlete.userId]);

  useEffect(() => {
    getQuestionnairesByCoach(coachId).then(setCoachQuestionnaires).catch(console.error);
  }, [coachId]);

  useEffect(() => {
    setAssignments([]);
    setAthleteLogs([]);
    setAthleteDiets([]);
    setAthleteDietConfig(null);
    setNutritionConfig(null);
    setAthletePhotos([]);
    setOnboardingData(null);
    setEditingOnboarding(false);
    setBodyweightLogs([]);
    setExpandedReviewId(null);

    getOnboarding(athlete.email).then(d => setOnboardingData(d)).catch(console.error);
    getOnboardingTemplate(coachEmail).then(tpl => setOnboardingTemplate(tpl?.questions ?? [])).catch(console.error);
    getWorkoutAssignments(athlete.userId).then(setAssignments).catch(console.error);
    getWorkoutLogs(athlete.email).then(setAthleteLogs).catch(console.error);
    getMesocycles(athlete.email).then(setMesocycles).catch(console.error);
    getAthleteNutritionConfig(athlete.email).then(setNutritionConfig).catch(console.error);
    // Self-managed diets ("Mis Dietas") are private to the athlete — the coach's
    // "Dietas disponibles" tab only lists/assigns diets the coach itself authored.
    getDietsForAthlete(athlete.email).then(diets => setAthleteDiets(diets.filter(d => !d.selfManaged))).catch(console.error);
    getAthleteDietConfig(athlete.email).then(setAthleteDietConfig).catch(console.error);
    getAssignmentsForAthlete(athlete.email).then(setAthleteQAssignments).catch(console.error);
    getResponsesForAthlete(athlete.email).then(setAthleteQResponses).catch(console.error);
    getPhotoAssignmentsForAthlete(athlete.email).then(setAthletePhotoAssignments).catch(console.error);
    getBodyweightForAthlete(athlete.email).then(setBodyweightLogs).catch(console.error);
    getCoachReportsForAthlete(athlete.email).then(setCoachReports).catch(console.error);
    getAiProposalsForAthlete(athlete.email).then(list => setAiProposals(list.filter(p => p.status === 'proposed'))).catch(console.error);
    setLoadingPhotos(true);
    getProgressPhotos(athlete.email)
      .then(p => { setAthletePhotos(p); setLoadingPhotos(false); })
      .catch(() => setLoadingPhotos(false));

    if (workouts.length === 0) getWorkouts().then(setWorkouts).catch(console.error);
    if (exercises.length === 0) {
      (async () => {
        await seedExercisesIfEmpty();
        getExercises().then(setExercises).catch(console.error);
      })();
    }
  }, [athlete.userId]);

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
  const getExercise = (id: string) => exercises.find(e => e.id === id);
  const getWorkout  = (id: string) => workouts.find(w => w.id === id);

  // Ejercicios del programa actual del atleta (rutinas asignadas) — acota el
  // selector de observaciones por ejercicio a lo que realmente entrena.
  const programExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assignments) {
      const wo = workouts.find(w => w.id === a.workoutId);
      wo?.exercises.forEach(e => ids.add(e.exerciseId));
    }
    return [...ids];
  }, [assignments, workouts]);

  const activeCheckIn = activeCheckInId
    ? checkins.find(c => c.id === activeCheckInId)
    : athleteCheckins[0];

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCheckInId) { setFeedbackError('No hay ningún check-in seleccionado.'); return; }
    if (!feedbackText.trim()) { setFeedbackError('Por favor ingresa una directriz.'); return; }
    setFeedbackError('');
    setFeedbackSuccess('');
    setIsSubmitting(true);
    try {
      await submitCoachFeedback(activeCheckInId, feedbackText);
      setFeedbackSuccess('¡Directiva enviada con éxito!');
      onRefreshCheckIns();
      setTimeout(() => setFeedbackSuccess(''), 4000);
    } catch (err) {
      console.error(err);
      setFeedbackError('Fallo en la comunicación con la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnifiedSendFeedback = async (checkInId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!unifiedFeedbackText.trim()) { setUnifiedFeedbackError('Por favor ingresa una directriz.'); return; }
    setUnifiedFeedbackError('');
    setUnifiedFeedbackSuccess('');
    setUnifiedSubmitting(true);
    try {
      await submitCoachFeedback(checkInId, unifiedFeedbackText);
      setUnifiedFeedbackSuccess('¡Directiva enviada con éxito!');
      onRefreshCheckIns();
      setTimeout(() => setUnifiedFeedbackSuccess(''), 4000);
    } catch (err) {
      console.error(err);
      setUnifiedFeedbackError('Fallo en la comunicación con la base de datos.');
    } finally {
      setUnifiedSubmitting(false);
    }
  };

  const handleStartEditCheckin = (c: WeightCheckIn, key: string) => {
    setCheckinEditForm({ weight: c.weight, adherence: c.adherence, mood: c.mood || '', notes: c.notes || '', dateStr: c.dateStr || '' });
    setEditingReviewKey(key);
  };
  const handleSaveCheckinEdit = async (id: string) => {
    if (!checkinEditForm) return;
    setSavingEdit(true);
    try {
      await updateCheckIn(id, checkinEditForm);
      onRefreshCheckIns();
      setEditingReviewKey(null);
      setCheckinEditForm(null);
    } catch (err) { console.error(err); }
    finally { setSavingEdit(false); }
  };
  const handleDeleteCheckin = async (id: string, key: string) => {
    if (!confirm('¿Eliminar este check-in permanentemente? Esta acción no se puede deshacer.')) return;
    setDeletingReviewKey(key);
    try {
      await deleteCheckIn(id);
      onRefreshCheckIns();
      setExpandedReviewId(null);
    } catch (err) { console.error(err); }
    finally { setDeletingReviewKey(null); }
  };
  const handleStartEditResponse = (r: QuestionnaireResponse, key: string) => {
    setResponseEditAnswers(r.answers.map(a => ({ ...a })));
    setEditingReviewKey(key);
  };
  const handleSaveResponseEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      await updateQuestionnaireResponse(id, responseEditAnswers);
      setAthleteQResponses(prev => prev.map(r => r.id === id ? { ...r, answers: responseEditAnswers } : r));
      setEditingReviewKey(null);
      setResponseEditAnswers([]);
    } catch (err) { console.error(err); }
    finally { setSavingEdit(false); }
  };
  const handleDeleteResponse = async (id: string, key: string) => {
    if (!confirm('¿Eliminar esta respuesta permanentemente? Esta acción no se puede deshacer.')) return;
    setDeletingReviewKey(key);
    try {
      await deleteQuestionnaireResponse(id);
      setAthleteQResponses(prev => prev.filter(r => r.id !== id));
      setExpandedReviewId(null);
    } catch (err) { console.error(err); }
    finally { setDeletingReviewKey(null); }
  };

  const handleCreateAssignment = async () => {
    if (!assignWorkoutId || !assignDate) return;
    setIsAssigning(true);
    try {
      const newA = await createWorkoutAssignment({
        workoutId: assignWorkoutId,
        athleteId: athlete.userId,
        date:      assignDate,
        status:    'pending',
      });
      setAssignments(prev => [...prev, newA].sort((a, b) => a.date.localeCompare(b.date)));
      setShowAssignModal(false);
      setAssignWorkoutId('');
      invalidateResource(`assignments:${athlete.userId}`);
    } catch (err) { console.error(err); showToast('No se pudo asignar el entrenamiento.'); }
    finally { setIsAssigning(false); }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!window.confirm('¿Eliminar este entrenamiento asignado?')) return;
    try {
      await deleteWorkoutAssignment(id);
      setAssignments(prev => prev.filter(a => a.id !== id));
      invalidateResource(`assignments:${athlete.userId}`);
    } catch (err) { console.error(err); showToast('No se pudo eliminar el entrenamiento.'); }
  };

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
    setAthleteDietConfig(next);
    await saveAthleteDietConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar el cambio de dieta.'); });
  };

  const handleScheduleDay = async (day: WeekDay, dietId: string | null) => {
    const current = athleteDietConfig ?? { athleteId: athlete.email, activeDietIds: [] };
    const next: AthleteDietConfig = {
      ...current,
      weeklySchedule: { ...current.weeklySchedule, [day]: dietId },
    };
    setAthleteDietConfig(next);
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
    setNutritionConfig(next);
    await saveAthleteNutritionConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar el modo de dieta.'); });
  };

  const handleSaveStepConfig = async (updates: Partial<Pick<AthleteNutritionConfig, 'stepGoal' | 'kcalPerStep'>>) => {
    const current = nutritionConfig ?? { athleteId: athlete.email, enabledModes: ['OMNIVORO'] as DietMode[] };
    const next: AthleteNutritionConfig = { ...current, ...updates };
    setNutritionConfig(next);
    await saveAthleteNutritionConfig(next).catch(err => { console.error(err); showToast('No se pudo guardar la configuración de pasos.'); });
  };

  // ── Questionnaire assignment ───────────────────────────────────────────────
  const handleAssignQuestionnaire = async () => {
    if (!assignQId) return;
    if (assignSchedType === 'weekdays' && assignWeekdays.length === 0) return;
    setAssigningQ(true);
    try {
      const schedule: QSchedule = { type: assignSchedType };
      if (assignSchedType === 'weekdays')  schedule.weekdays     = assignWeekdays;
      if (assignSchedType === 'interval')  schedule.intervalDays = assignIntervalDays;
      if (assignSchedType === 'monthly')   schedule.dayOfMonth   = assignDayOfMonth;
      const a = await assignQuestionnaire({
        questionnaireId: assignQId,
        athleteId: athlete.email,
        schedule,
        startDate: assignStartDate,
        active: true,
        createdAt: new Date().toISOString(),
      });
      setAthleteQAssignments(prev => [...prev, a]);
      setAssignQId('');
      setAssignSchedType('once');
      setAssignWeekdays([]);
    } catch (err) { console.error(err); showToast('No se pudo asignar el cuestionario.'); }
    finally { setAssigningQ(false); }
  };

  const handleDeactivateQ = async (id: string) => {
    await deactivateAssignment(id).catch(err => { console.error(err); showToast('No se pudo desactivar el cuestionario.'); });
    setAthleteQAssignments(prev => prev.map(a => a.id === id ? { ...a, active: false } : a));
  };

  // ── Photo check-in assignment ───────────────────────────────────────────────
  const handleAssignPhotoCheckIn = async () => {
    if (assignPhotoViews.length === 0) return;
    if (assignPhotoSchedType === 'weekdays' && assignPhotoWeekdays.length === 0) return;
    setAssigningPhoto(true);
    try {
      const schedule: QSchedule = { type: assignPhotoSchedType };
      if (assignPhotoSchedType === 'weekdays')  schedule.weekdays     = assignPhotoWeekdays;
      if (assignPhotoSchedType === 'interval')  schedule.intervalDays = assignPhotoIntervalDays;
      if (assignPhotoSchedType === 'monthly')   schedule.dayOfMonth   = assignPhotoDayOfMonth;
      const a = await assignPhotoCheckIn({
        athleteId: athlete.email,
        schedule,
        startDate: assignPhotoStartDate,
        views: assignPhotoViews,
        active: true,
        createdAt: new Date().toISOString(),
      });
      setAthletePhotoAssignments(prev => [...prev, a]);
      setAssignPhotoViews(['front']);
      setAssignPhotoSchedType('once');
      setAssignPhotoWeekdays([]);
    } catch (err) { console.error(err); showToast('No se pudo asignar el check-in de fotos.'); }
    finally { setAssigningPhoto(false); }
  };

  const handleDeactivatePhoto = async (id: string) => {
    await deactivatePhotoAssignment(id).catch(err => { console.error(err); showToast('No se pudo desactivar el check-in de fotos.'); });
    setAthletePhotoAssignments(prev => prev.map(a => a.id === id ? { ...a, active: false } : a));
  };

  const handleCreateNewQ = async () => {
    if (!newQForm.title.trim()) return;
    setSavingNewQ(true);
    try {
      const data = {
        ownerId: coachId,
        title: newQForm.title.trim(),
        description: newQForm.description.trim() || undefined,
        questions: newQForm.questions
          .filter(q => q.label.trim())
          .map(q => ({ ...q, graphable: q.type === 'numeric' || q.type === 'scale' ? true : undefined })),
      };
      const created = await createQuestionnaire(data);
      setCoachQuestionnaires(prev => [...prev, created]);
      setAssignQId(created.id);
      setShowNewQEditor(false);
      setNewQForm(blankQForm());
    } catch (err) { console.error(err); }
    finally { setSavingNewQ(false); }
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
        <div className="space-y-6">

        <TaskManagerPanel athleteEmail={athlete.email} />

        {/* ── Photos ─────────────────────────────────────────────────────────── */}
        {(() => {
          const viewPhotos = athletePhotos
            .filter(p => p.view === selectedView)
            .sort((a, b) => a.date.localeCompare(b.date));
          const baseline = viewPhotos[0];
          const latest   = viewPhotos[viewPhotos.length - 1];
          const fmtDate  = (d: string) =>
            new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });

          return (
            <div className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/7 flex items-center justify-between bg-[#1c1b1b]">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">photo_camera</span>
                  Historial Fotográfico
                  {athletePhotos.length > 0 && (
                    <span className="font-mono text-[9px] text-[#c6c9ab]">({athletePhotos.length} fotos)</span>
                  )}
                </h3>
                <div className="flex bg-[#2a2a2a] rounded p-0.5">
                  {([
                    { id: 'front', label: 'Frente'   },
                    { id: 'side',  label: 'Lateral'  },
                    { id: 'back',  label: 'Espalda'  },
                  ] as { id: PhotoView; label: string }[]).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedView(v.id)}
                      className={`px-3 py-1 rounded font-sans text-[9px] font-bold uppercase transition-all tracking-wider ${selectedView === v.id ? 'bg-[#fbcb1a] text-black shadow-md' : 'text-[#c6c9ab] hover:text-white'}`}
                    >{v.label}</button>
                  ))}
                </div>
              </div>
              {loadingPhotos ? (
                <div className="p-8 text-center font-mono text-xs text-[#c6c9ab] animate-pulse">Cargando fotos…</div>
              ) : viewPhotos.length === 0 ? (
                <div className="p-10 text-center">
                  <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">photo_camera</span>
                  <p className="font-mono text-xs text-[#c6c9ab]">Sin fotos todavía.</p>
                </div>
              ) : (
                <div className="p-3 bg-[#111110]/90">
                  {viewPhotos.length === 1 ? (
                    <div className="relative rounded-lg overflow-hidden border border-[#fbcb1a]/20 group max-w-[240px] mx-auto">
                      <div className="absolute top-2 left-2 z-10 bg-[#fbcb1a] text-black px-2.5 py-0.5 rounded font-sans text-[10px] font-black shadow-md">
                        Actual · {fmtDate(latest.date)}
                      </div>
                      <img className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500" src={latest.url} alt="Actual" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative rounded-lg overflow-hidden border border-white/7 group">
                        <div className="absolute top-2 left-2 z-10 bg-black/75 backdrop-blur-sm border border-white/7 px-2.5 py-0.5 rounded text-white font-mono text-[10px]">
                          Baseline · {fmtDate(baseline.date)}
                        </div>
                        <img className="w-full h-[280px] object-cover object-top filter grayscale-[20%] group-hover:filter-none transition-all duration-500" src={baseline.url} alt="Baseline" />
                      </div>
                      <div className="relative rounded-lg overflow-hidden border border-[#fbcb1a]/20 group">
                        <div className="absolute top-2 left-2 z-10 bg-[#fbcb1a] text-black px-2.5 py-0.5 rounded font-sans text-[10px] font-black shadow-md">
                          Actual · {fmtDate(latest.date)}
                        </div>
                        <img className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500" src={latest.url} alt="Actual" />
                      </div>
                    </div>
                  )}
                  {viewPhotos.length > 2 && (
                    <p className="text-center font-mono text-[9px] text-[#c6c9ab] mt-2">
                      {viewPhotos.length} fotos — mostrando baseline y más reciente
                    </p>
                  )}
                </div>
              )}

              {/* ── Asignar fotos de check-in (vive dentro del historial fotográfico) ── */}
              <div className="p-4 border-t border-white/7 space-y-4">
                <h4 className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">edit_calendar</span>
                  Asignar fotos de check-in
                </h4>

                <div className="space-y-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      { id: 'front', label: 'Frente' },
                      { id: 'side',  label: 'Lateral' },
                      { id: 'back',  label: 'Espalda' },
                    ] as { id: PhotoView; label: string }[]).map(v => {
                      const active = assignPhotoViews.includes(v.id);
                      return (
                        <button
                          key={v.id}
                          onClick={() => setAssignPhotoViews(prev => active ? prev.filter(x => x !== v.id) : [...prev, v.id])}
                          className={`px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider border transition-all ${
                            active
                              ? 'bg-[#fbcb1a] border-[#fbcb1a] text-black'
                              : 'bg-[#1c1b1b] border-white/7 text-[#c6c9ab] hover:border-[#3a3a3a]'
                          }`}
                        >{v.label}</button>
                      );
                    })}
                  </div>

                  <ScheduleFields
                    schedType={assignPhotoSchedType}
                    onSchedTypeChange={setAssignPhotoSchedType}
                    weekdays={assignPhotoWeekdays}
                    onWeekdaysChange={setAssignPhotoWeekdays}
                    intervalDays={assignPhotoIntervalDays}
                    onIntervalDaysChange={setAssignPhotoIntervalDays}
                    dayOfMonth={assignPhotoDayOfMonth}
                    onDayOfMonthChange={setAssignPhotoDayOfMonth}
                    startDate={assignPhotoStartDate}
                    onStartDateChange={setAssignPhotoStartDate}
                  />

                  <button
                    onClick={handleAssignPhotoCheckIn}
                    disabled={assignPhotoViews.length === 0 || assigningPhoto || (assignPhotoSchedType === 'weekdays' && assignPhotoWeekdays.length === 0)}
                    className="px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 shadow-sm"
                  >
                    {assigningPhoto ? '…' : 'Asignar'}
                  </button>
                </div>

                {athletePhotoAssignments.filter(a => a.active).length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/60">
                    <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Asignados activos</p>
                    {athletePhotoAssignments.filter(a => a.active).map(a => {
                      const schedLabel = scheduleLabel(a.schedule);
                      const viewsLabel = a.views.map(v => v === 'front' ? 'Frente' : v === 'side' ? 'Lateral' : 'Espalda').join(', ');
                      return (
                        <div key={a.id} className="flex items-center gap-3 bg-[#1e1e1b] border border-white/7 rounded-xl px-3 py-2">
                          <span className="material-symbols-outlined text-[#fbcb1a] text-sm">photo_camera</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-sans font-bold text-white text-xs truncate">{viewsLabel}</p>
                            <p className="font-mono text-[9px] text-[#c6c9ab]">{schedLabel} · desde {a.startDate}</p>
                          </div>
                          <button onClick={() => handleDeactivatePhoto(a.id)} className="text-[#c6c9ab] hover:text-red-400 transition-colors" title="Desactivar">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <ExercisePersonalNotesPanel athleteEmail={athlete.email} programExerciseIds={programExerciseIds} />

        {/* ── Ficha de iniciación ─────────────────────────────────────────── */}
        <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
          {editingOnboarding ? (
            <OnboardingForm
              athleteEmail={athlete.email}
              initialData={onboardingData}
              template={onboardingTemplate}
              onSaved={data => { setOnboardingData(data); setEditingOnboarding(false); }}
              onCancel={() => setEditingOnboarding(false)}
            />
          ) : onboardingData ? (
            <div className="space-y-4">
              <button
                onClick={() => setFichaExpanded(v => !v)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-base flex-shrink-0">person_check</span>
                  <span className="truncate">Ficha de iniciación</span>
                  <span className="font-mono text-[10px] text-[#555] font-normal normal-case truncate">
                    {[
                      onboardingData.sex && (onboardingData.sex === 'male' ? 'Hombre' : 'Mujer'),
                      onboardingData.birthDate && `${displayAge(onboardingData.birthDate)} años`,
                      onboardingData.goalBody && GOAL_BODY_LABELS[onboardingData.goalBody],
                    ].filter(Boolean).join(' · ')}
                  </span>
                </h3>
                <span className="material-symbols-outlined text-[#c6c9ab] flex-shrink-0 transition-transform" style={{ transform: fichaExpanded ? 'rotate(180deg)' : 'none' }}>
                  expand_more
                </span>
              </button>
              {fichaExpanded && (
                <div className="flex justify-end -mt-2">
                  <button
                    onClick={() => setEditingOnboarding(true)}
                    className="flex items-center gap-1 font-mono text-[10px] text-[#c6c9ab] hover:text-[#fbcb1a] transition-colors border border-white/7 px-2.5 py-1.5 rounded-lg"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>Editar
                  </button>
                </div>
              )}
              {fichaExpanded && (
              <>

              {/* Composición corporal */}
              {(onboardingData.sex || onboardingData.weightKg || onboardingData.heightCm) && (
                <div className="space-y-2">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Composición corporal</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.sex && (
                      <span className="text-[#c6c9ab]">Sexo: <span className="text-white font-bold">{onboardingData.sex === 'male' ? 'Hombre' : 'Mujer'}</span></span>
                    )}
                    {onboardingData.birthDate && (
                      <span className="text-[#c6c9ab]">Edad: <span className="text-white font-bold">{displayAge(onboardingData.birthDate)} años</span></span>
                    )}
                    {onboardingData.weightKg && (
                      <span className="text-[#c6c9ab]">Peso: <span className="text-white font-bold">{onboardingData.weightKg} kg</span></span>
                    )}
                    {onboardingData.heightCm && (
                      <span className="text-[#c6c9ab]">Altura: <span className="text-white font-bold">{onboardingData.heightCm} cm</span></span>
                    )}
                    {onboardingData.bodyFatPct && (
                      <span className="text-[#c6c9ab]">%Grasa: <span className="text-white font-bold">{onboardingData.bodyFatPct}%</span></span>
                    )}
                    {onboardingData.musclePct && (
                      <span className="text-[#c6c9ab]">%Músculo: <span className="text-white font-bold">{onboardingData.musclePct}%</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Actividad y objetivo */}
              {(onboardingData.activityLevel || onboardingData.goalBody || onboardingData.goalCapacity) && (
                <div className="space-y-2">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Actividad y objetivo</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.activityLevel && (
                      <span className="text-[#c6c9ab]">Actividad: <span className="text-white font-bold">{ACTIVITY_LABELS[onboardingData.activityLevel]}</span></span>
                    )}
                    {onboardingData.goalBody && (
                      <span className="text-[#c6c9ab]">Objetivo: <span className="text-[#fbcb1a] font-bold">{GOAL_BODY_LABELS[onboardingData.goalBody]}</span></span>
                    )}
                    {onboardingData.goalCapacity && (
                      <span className="text-[#c6c9ab]">Capacidad: <span className="text-white font-bold">{GOAL_CAP_LABELS[onboardingData.goalCapacity]}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Nutrition */}
              <div className="space-y-2">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Nutrición</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                  <span className="text-[#c6c9ab]">Dieta: <span className="text-white font-bold">{DIET_LABELS[onboardingData.dietType]}</span></span>
                  <span className="text-[#c6c9ab]">Calorías: <span className="text-[#fbcb1a] font-bold">{onboardingData.targetCalories} kcal/día</span></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: 'HC',    g: onboardingData.macroGrams.hc,    pct: onboardingData.macroSplit.hc,    ef: 25, color: '#ffa500' },
                    { label: 'PROT',  g: onboardingData.macroGrams.prot,  pct: onboardingData.macroSplit.prot,  ef: 25, color: '#00eefc' },
                    { label: 'GRASA', g: onboardingData.macroGrams.grasa, pct: onboardingData.macroSplit.grasa, ef: 11, color: '#ff6b6b' },
                  ]).map(m => (
                    <div key={m.label} className="bg-[#1e1e1b] border border-white/7 rounded-xl px-3 py-1.5 text-center">
                      <p className="font-mono text-[10px] uppercase" style={{ color: m.color }}>{m.label}</p>
                      <p className="font-mono font-bold text-white text-sm">{m.g}g</p>
                      <p className="font-mono text-[9px] text-[#555]">{m.pct}% · {fmtExch(m.g, m.ef)} int</p>
                    </div>
                  ))}
                </div>
                {onboardingData.allergies.length > 0 && (
                  <p className="font-mono text-[10px] text-amber-400 pt-1">
                    <span className="material-symbols-outlined text-xs align-middle mr-1">warning</span>
                    Alergias: {onboardingData.allergies.join(', ')}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1 font-mono text-[10px] text-[#555]">
                  <span className="text-amber-400">⭐ {onboardingData.likedFoods.length} favoritos</span>
                  <span className="text-red-400">➖ {onboardingData.dislikedFoods.length} no quiero</span>
                  <span className="text-[#3a3a3a]">· editar abajo</span>
                </div>
              </div>

              {/* Comidas */}
              {onboardingData.meals && onboardingData.meals.length > 0 && (
                <div className="space-y-2">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Comidas ({onboardingData.mealCount ?? onboardingData.meals.length} ingestas)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {onboardingData.meals.map(m => (
                      <div key={m.intakeType} className="flex items-center gap-1.5 bg-[#1e1e1b] border border-white/7 rounded-xl px-2.5 py-1.5">
                        <span className="font-mono text-[10px] text-[#c6c9ab]">{m.name}</span>
                        {m.needsTupper && (
                          <span className="font-mono text-[8px] bg-[#00eefc]/10 border border-[#00eefc]/30 text-[#00eefc] rounded px-1.5 py-0.5">tupper</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cocina */}
              {(onboardingData.cookingLevel || onboardingData.cookingMaxTime) && (
                <div className="space-y-1">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Cocina</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.cookingLevel && (
                      <span className="text-[#c6c9ab]">Nivel: <span className="text-white font-bold">{onboardingData.cookingLevel}/5</span></span>
                    )}
                    {onboardingData.cookingMaxTime && (
                      <span className="text-[#c6c9ab]">Tiempo máx: <span className="text-white font-bold">{onboardingData.cookingMaxTime} min</span></span>
                    )}
                    {onboardingData.breakfastVariety && (
                      <span className="text-[#c6c9ab]">Variedad desayunos: <span className="text-white font-bold">{onboardingData.breakfastVariety}/5</span></span>
                    )}
                    {onboardingData.lunchVariety && (
                      <span className="text-[#c6c9ab]">Variedad almuerzos: <span className="text-white font-bold">{onboardingData.lunchVariety}/5</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Training */}
              <div className="space-y-2">
                <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Entrenamiento</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                  <span className="text-[#c6c9ab]">Nivel: <span className="text-white font-bold">{EXP_LABELS[onboardingData.experienceLevel]}</span></span>
                </div>
                {onboardingData.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {onboardingData.equipment.map(e => (
                      <span key={e} className="bg-[#1e1e1b] border border-white/7 text-[#c6c9ab] px-2 py-0.5 rounded-full text-[10px] font-mono">{e}</span>
                    ))}
                  </div>
                )}
                {onboardingData.favoriteExercises.length > 0 && (
                  <p className="font-mono text-[10px] text-[#c6c9ab]">
                    <span className="text-[#555] mr-1">Favoritos:</span>{onboardingData.favoriteExercises.join(', ')}
                  </p>
                )}
                {onboardingData.hatedExercises.length > 0 && (
                  <p className="font-mono text-[10px] text-[#c6c9ab]">
                    <span className="text-[#555] mr-1">Evita:</span>{onboardingData.hatedExercises.join(', ')}
                  </p>
                )}
                {onboardingData.injuries && (
                  <p className="font-mono text-[10px] text-amber-300">
                    <span className="material-symbols-outlined text-xs align-middle mr-1">personal_injury</span>
                    {onboardingData.injuries}
                  </p>
                )}
              </div>

              {/* Datos personales adicionales */}
              {(onboardingData.occupation || onboardingData.referralSource || onboardingData.goalFreeText) && (
                <div className="space-y-1 pt-3 border-t border-white/40">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Datos personales</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.occupation && (
                      <span className="text-[#c6c9ab]">Ocupación: <span className="text-white font-bold">{onboardingData.occupation}</span></span>
                    )}
                    {onboardingData.referralSource && (
                      <span className="text-[#c6c9ab]">Nos conoció por: <span className="text-white font-bold">{onboardingData.referralSource}</span></span>
                    )}
                  </div>
                  {onboardingData.goalFreeText && (
                    <p className="font-mono text-[10px] text-[#c6c9ab] italic">"{onboardingData.goalFreeText}"</p>
                  )}
                </div>
              )}

              {/* Salud */}
              {(onboardingData.hasCurrentInjury || onboardingData.hadPastInjuries || onboardingData.takesMedication ||
                onboardingData.recentSurgery || onboardingData.smokesAlcoholSubstances || onboardingData.sunExposureWeekly) && (
                <div className="space-y-1 pt-3 border-t border-white/40">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Salud</p>
                  <div className="space-y-1">
                    {onboardingData.hasCurrentInjury && (
                      <p className="font-mono text-[10px] text-amber-300">
                        <span className="material-symbols-outlined text-xs align-middle mr-1">personal_injury</span>
                        Lesión actual en {onboardingData.currentInjuryLocation || '—'} (intensidad {onboardingData.currentInjuryIntensity ?? '—'}/10)
                        {onboardingData.currentInjuryMovements && ` — duele al: ${onboardingData.currentInjuryMovements}`}
                      </p>
                    )}
                    {onboardingData.hadPastInjuries && (
                      <p className="font-mono text-[10px] text-[#c6c9ab]">
                        <span className="text-[#555] mr-1">Lesiones anteriores:</span>{onboardingData.pastInjuriesDetail || '—'}
                      </p>
                    )}
                    {onboardingData.takesMedication && (
                      <p className="font-mono text-[10px] text-[#c6c9ab]">
                        <span className="text-[#555] mr-1">Medicación:</span>{onboardingData.medicationDetail || '—'}
                      </p>
                    )}
                    {onboardingData.recentSurgery && (
                      <p className="font-mono text-[10px] text-[#c6c9ab]">
                        <span className="text-[#555] mr-1">Cirugía reciente:</span>{onboardingData.recentSurgeryDetail || '—'}
                      </p>
                    )}
                    {onboardingData.smokesAlcoholSubstances && (
                      <p className="font-mono text-[10px] text-[#c6c9ab]">
                        <span className="text-[#555] mr-1">Tabaco/alcohol/otras sustancias:</span>{onboardingData.smokesAlcoholSubstances}
                      </p>
                    )}
                    {onboardingData.sunExposureWeekly && (
                      <p className="font-mono text-[10px] text-[#c6c9ab]">
                        <span className="text-[#555] mr-1">Exposición al sol:</span>{onboardingData.sunExposureWeekly}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Nutrición — detalle adicional */}
              {(onboardingData.appetitePeakTime || onboardingData.hadOverweightHistory || !onboardingData.foodRelationshipGood ||
                onboardingData.eatsTooFast || (onboardingData.supplements?.length ?? 0) > 0 || onboardingData.weightTendency ||
                onboardingData.neckCm || onboardingData.waistCm || onboardingData.hipCm) && (
                <div className="space-y-1 pt-3 border-t border-white/40">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Nutrición — detalle</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.appetitePeakTime && (
                      <span className="text-[#c6c9ab]">Más apetito: <span className="text-white font-bold">{onboardingData.appetitePeakTime}</span></span>
                    )}
                    {onboardingData.hadOverweightHistory && (
                      <span className="text-amber-300">Historial de sobrepeso</span>
                    )}
                    {!onboardingData.foodRelationshipGood && (
                      <span className="text-amber-300">Relación con la comida: mala{onboardingData.foodRelationshipReason ? ` (${onboardingData.foodRelationshipReason})` : ''}</span>
                    )}
                    {onboardingData.eatsTooFast && <span className="text-[#c6c9ab]">Come deprisa</span>}
                    {onboardingData.neckCm && <span className="text-[#c6c9ab]">Cuello: <span className="text-white font-bold">{onboardingData.neckCm}cm</span></span>}
                    {onboardingData.waistCm && <span className="text-[#c6c9ab]">Cintura: <span className="text-white font-bold">{onboardingData.waistCm}cm</span></span>}
                    {onboardingData.hipCm && <span className="text-[#c6c9ab]">Cadera: <span className="text-white font-bold">{onboardingData.hipCm}cm</span></span>}
                  </div>
                  {onboardingData.weightTendency && (
                    <p className="font-mono text-[10px] text-[#c6c9ab]"><span className="text-[#555] mr-1">Tendencia de peso:</span>{onboardingData.weightTendency}</p>
                  )}
                  {(onboardingData.supplements?.length ?? 0) > 0 && (
                    <div className="pt-1">
                      <p className="font-mono text-[9px] text-[#555] mb-1">Suplementación</p>
                      {onboardingData.supplements!.map((s, i) => (
                        <p key={i} className="font-mono text-[10px] text-[#c6c9ab]">{s.name} — {s.dose} — {s.frequency}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Entrenamiento — detalle adicional */}
              {(onboardingData.oneRepMaxTotal || onboardingData.progressFrequency || onboardingData.techniqueLevel ||
                onboardingData.currentMotivation || onboardingData.muscleGroupsToImprove || onboardingData.restDayActive ||
                onboardingData.sittingHoursPerDay || onboardingData.stressReason) && (
                <div className="space-y-1 pt-3 border-t border-white/40">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Entrenamiento — detalle</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.oneRepMaxTotal && (
                      <span className="text-[#c6c9ab]">Total 1RM: <span className="text-white font-bold">{onboardingData.oneRepMaxTotal}kg</span></span>
                    )}
                    {onboardingData.progressFrequency && (
                      <span className="text-[#c6c9ab]">Progresa: <span className="text-white font-bold">{PROGRESS_FREQ_LABELS[onboardingData.progressFrequency]}</span></span>
                    )}
                    {onboardingData.techniqueLevel && (
                      <span className="text-[#c6c9ab]">Técnica: <span className="text-white font-bold">{TECHNIQUE_LABELS[onboardingData.techniqueLevel]}</span></span>
                    )}
                    {onboardingData.currentMotivation && (
                      <span className="text-[#c6c9ab]">Motivación: <span className="text-white font-bold">{onboardingData.currentMotivation}/10</span></span>
                    )}
                    {onboardingData.sittingHoursPerDay && (
                      <span className="text-[#c6c9ab]">Horas sentado/día: <span className="text-white font-bold">{onboardingData.sittingHoursPerDay}h</span></span>
                    )}
                    {onboardingData.restDayActive && <span className="text-[#c6c9ab]">Activo en descanso{onboardingData.restDayActiveDetail ? ` (${onboardingData.restDayActiveDetail})` : ''}</span>}
                  </div>
                  {onboardingData.muscleGroupsToImprove && (
                    <p className="font-mono text-[10px] text-[#c6c9ab]"><span className="text-[#555] mr-1">A mejorar:</span>{onboardingData.muscleGroupsToImprove}</p>
                  )}
                  {onboardingData.stressReason && (
                    <p className="font-mono text-[10px] text-[#c6c9ab]"><span className="text-[#555] mr-1">Motivo de estrés:</span>{onboardingData.stressReason}</p>
                  )}
                </div>
              )}

              {/* Descanso — detalle adicional */}
              {((onboardingData.sleepDeficitCauses?.length ?? 0) > 0 || onboardingData.sleepRoutineOrScreen || onboardingData.sleepMedication) && (
                <div className="space-y-1 pt-3 border-t border-white/40">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">Descanso — detalle</p>
                  {(onboardingData.sleepDeficitCauses?.length ?? 0) > 0 && (
                    <p className="font-mono text-[10px] text-[#c6c9ab]"><span className="text-[#555] mr-1">Causas del déficit:</span>{onboardingData.sleepDeficitCauses!.join(', ')}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                    {onboardingData.sleepRoutineOrScreen && (
                      <span className="text-[#c6c9ab]">Antes de dormir: <span className="text-white font-bold">{onboardingData.sleepRoutineOrScreen === 'rutina' ? 'Rutina' : 'Pantalla'}</span></span>
                    )}
                    {onboardingData.sleepMedication && (
                      <span className="text-amber-300">Medicación para dormir{onboardingData.sleepMedicationDetail ? `: ${onboardingData.sleepMedicationDetail}` : ''}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Extra answers from template */}
              {onboardingTemplate.length > 0 && onboardingData.extraAnswers && Object.keys(onboardingData.extraAnswers).length > 0 && (
                <div className="space-y-3 pt-3 border-t border-white/40">
                  {(['entrenamiento', 'nutricion', 'descanso'] as const).map(section => {
                    const sqs = onboardingTemplate.filter(q => q.section === section);
                    const answered = sqs.filter(q => {
                      const v = onboardingData.extraAnswers?.[q.id];
                      return v !== undefined && v !== '' && v !== 0;
                    });
                    if (answered.length === 0) return null;
                    return (
                      <div key={section} className="space-y-1">
                        <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wide">{SECTION_LABELS[section]}</p>
                        {answered.map(q => {
                          const val = onboardingData.extraAnswers![q.id];
                          const display = q.type === 'scale'
                            ? `${val} / ${q.scaleMax ?? 10}`
                            : `${val}${q.unit ? ` ${q.unit}` : ''}`;
                          return (
                            <p key={q.id} className="font-mono text-[10px] text-[#c6c9ab]">
                              <span className="text-[#555] mr-1">{q.label}:</span>
                              <span className="text-white font-bold">{display}</span>
                            </p>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
              </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-sans font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#555] text-base">person_check</span>
                  Ficha de iniciación
                </p>
                <p className="font-mono text-xs text-[#c6c9ab] mt-1">El atleta no ha completado su ficha todavía.</p>
              </div>
              <button
                onClick={() => setEditingOnboarding(true)}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">add</span>Crear ficha
              </button>
            </div>
          )}
        </div>

        {/* ── Preferencias alimentarias ────────────────────────────────── */}
        {onboardingData && (
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
            <h3 className="font-sans font-bold text-base text-white flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#fbcb1a] text-base">restaurant</span>
              Preferencias alimentarias
            </h3>
            <FoodPreferencesPanel
              athleteEmail={athlete.email}
              initialLiked={onboardingData.likedFoods}
              initialDisliked={onboardingData.dislikedFoods}
              allergies={onboardingData.allergies}
              onSaved={(liked, disliked) =>
                setOnboardingData(prev => prev ? { ...prev, likedFoods: liked, dislikedFoods: disliked } : null)
              }
            />
          </div>
        )}

        {/* ── Quick stats + weekly compliance ────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
            {[
              { label: 'Correo',     value: athlete.email,                                        color: 'text-white'     },
              { label: 'Racha',      value: `${athlete.currentStreak || 0} Semanas`,              color: 'text-orange-400'},
              { label: 'Nivel',      value: `Nivel ${athlete.level || 1}`,                        color: 'text-[#00eefc]' },
              { label: 'XP',         value: `${athlete.xp || 0} / 400`,                          color: 'text-slate-300' },
              { label: 'Peso actual',value: `${athlete.actualWeight || athlete.initialWeight} kg`,color: 'text-[#fbcb1a]' },
              { label: 'Meta',       value: `${athlete.targetWeight} kg`,                         color: 'text-[#86efac]' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-baseline text-xs font-mono">
                <span className="text-[#c6c9ab] uppercase">{row.label}:</span>
                <span className={`font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
            <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00eefc] text-sm">assignment_turned_in</span>
              Cumplimiento Semanal
            </h3>
            {weekTotal === 0 ? (
              <p className="font-mono text-[9px] text-[#c6c9ab]">Sin entrenamientos esta semana</p>
            ) : (
              <div className="flex items-center gap-4">
                <ProgressRing pct={weekPct} color="#00eefc" />
                <div className="flex-1 font-mono text-[10px]">
                  <span className="text-[#c6c9ab] uppercase block mb-1">Entrenamientos</span>
                  <span className="text-white text-sm font-bold">{weekCompleted} / {weekTotal}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Unified chronological review list ──────────────────────────── */}
        {(() => {
          type ReviewItem =
            | { kind: 'checkin'; date: string; sortKey: number; data: WeightCheckIn }
            | { kind: 'response'; date: string; sortKey: number; data: QuestionnaireResponse; questionnaire?: Questionnaire };

          const items: ReviewItem[] = [
            ...athleteCheckins.map(c => ({
              kind: 'checkin' as const,
              date: c.dateStr,
              sortKey: c.timestamp instanceof Date ? c.timestamp.getTime() : (c.timestamp as any)?.toDate?.()?.getTime?.() ?? new Date(c.timestamp as any).getTime(),
              data: c,
            })),
            ...athleteQResponses.map(r => ({
              kind: 'response' as const,
              date: r.submittedAt.split('T')[0],
              sortKey: new Date(r.submittedAt).getTime(),
              data: r,
              questionnaire: coachQuestionnaires.find(q => q.id === r.questionnaireId),
            })),
          ].sort((a, b) => a.sortKey - b.sortKey);

          if (items.length === 0) {
            return (
              <div className="bg-[#181816] border border-dashed border-white/7 rounded-2xl p-12 text-center text-[#c6c9ab]">
                <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-2">history_edu</span>
                <p className="text-sm font-bold text-white">Sin revisiones todavía</p>
                <p className="text-xs mt-1">Los check-ins y respuestas del atleta aparecerán aquí.</p>
              </div>
            );
          }

          return (
            <div className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/7 bg-[#1c1b1b] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#fbcb1a] text-sm">history_edu</span>
                <h3 className="font-sans font-bold text-base text-white uppercase tracking-wide">Historial unificado</h3>
                <span className="font-mono text-[9px] text-[#c6c9ab] ml-1">({items.length} entradas)</span>
              </div>
              <div className="divide-y divide-[#2a2a2a]/40">
                {items.map(item => {
                  const key = item.kind === 'checkin' ? `c_${item.data.id}` : `r_${item.data.id}`;
                  const isExpanded = expandedReviewId === key;
                  const toggle = () => {
                    if (isExpanded) {
                      setExpandedReviewId(null);
                    } else {
                      setExpandedReviewId(key);
                      if (item.kind === 'checkin') {
                        setUnifiedFeedbackText(item.data.coachFeedback || '');
                        setUnifiedFeedbackError('');
                        setUnifiedFeedbackSuccess('');
                      }
                    }
                  };

                  if (item.kind === 'checkin') {
                    const c = item.data;
                    return (
                      <div key={key}>
                        <div
                          onClick={toggle}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-[#1e1e1b] ${isExpanded ? 'bg-[#1e1e1b]' : ''}`}
                        >
                          <span
                            className="material-symbols-outlined flex-shrink-0 text-lg"
                            style={{ color: c.approved ? '#fbcb1a' : '#fb923c', fontVariationSettings: "'FILL' 1" }}
                          >rate_review</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-sans font-bold text-white text-xs">Check-in</span>
                              <span className="font-mono text-[9px] text-[#c6c9ab]">{c.dateStr}</span>
                              <span className={`text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded-lg flex-shrink-0 ${
                                c.approved ? 'bg-emerald-500/10 text-emerald-300' : 'bg-orange-500/10 text-orange-300'
                              }`}>
                                {c.approved ? 'Revisado' : 'Pendiente'}
                              </span>
                            </div>
                            <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                              {c.weight} kg · {c.adherence} · {c.mood}
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-[#c6c9ab] text-sm transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                        </div>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 bg-[#111111] space-y-3 border-t border-white/40">
                            {/* R7 action bar */}
                            {editingReviewKey !== key && (
                              <div className="flex items-center gap-2 pb-1">
                                <button
                                  onClick={() => handleStartEditCheckin(c, key)}
                                  className="flex items-center gap-1 font-mono text-[10px] uppercase px-2.5 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#00eefc] hover:border-[#00eefc]/40 rounded-lg transition-all"
                                >
                                  <span className="material-symbols-outlined text-xs">edit</span>Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteCheckin(c.id, key)}
                                  disabled={deletingReviewKey === key}
                                  className="flex items-center gap-1 font-mono text-[10px] uppercase px-2.5 py-1.5 bg-[#1c1b1b] border border-white/7 text-red-400 hover:border-red-500/40 rounded-lg transition-all disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-xs">{deletingReviewKey === key ? 'progress_activity' : 'delete'}</span>Eliminar
                                </button>
                              </div>
                            )}
                            {/* Inline edit form */}
                            {editingReviewKey === key && checkinEditForm ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Peso (kg)</label>
                                    <input type="number" step="0.1" value={checkinEditForm.weight}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, weight: parseFloat(e.target.value) || 0 }))}
                                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#00eefc]/50 font-mono" />
                                  </div>
                                  <div>
                                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Fecha</label>
                                    <input type="text" value={checkinEditForm.dateStr}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, dateStr: e.target.value }))}
                                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#00eefc]/50 font-mono" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Adherencia</label>
                                    <select value={checkinEditForm.adherence}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, adherence: e.target.value as WeightCheckIn['adherence'] }))}
                                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#00eefc]/50 font-mono">
                                      {['Sí', 'Parcial', 'No'].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Humor</label>
                                    <select value={checkinEditForm.mood}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, mood: e.target.value }))}
                                      className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#00eefc]/50 font-mono">
                                      {['😩', '😴', '😐', '😊', '🔥'].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Notas</label>
                                  <textarea value={checkinEditForm.notes}
                                    onChange={e => setCheckinEditForm(f => f && ({ ...f, notes: e.target.value }))}
                                    className="w-full bg-[#1c1b1b] border border-white/7 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#00eefc]/50 font-sans resize-none min-h-[60px]" />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveCheckinEdit(c.id)} disabled={savingEdit}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-[#fbcb1a] text-black font-sans text-[9px] font-bold uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 disabled:opacity-50 transition-all">
                                    <span className="material-symbols-outlined text-xs">save</span>{savingEdit ? 'Guardando…' : 'Guardar'}
                                  </button>
                                  <button onClick={() => { setEditingReviewKey(null); setCheckinEditForm(null); }}
                                    className="px-3 py-1.5 font-mono text-[10px] uppercase text-[#c6c9ab] border border-white/7 rounded-lg hover:border-[#c6c9ab]/40 transition-all">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                            <>
                            <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                              {[
                                { label: 'Peso', value: `${c.weight} kg`, color: 'text-white' },
                                { label: 'Adherencia', value: c.adherence, color: 'text-[#fbcb1a]' },
                                { label: 'Humor', value: c.mood || '😊', color: 'text-white' },
                              ].map(cell => (
                                <div key={cell.label} className="bg-[#1e1e1b] p-2.5 rounded-xl border border-white/40">
                                  <span className="block text-[#c6c9ab] text-[10px] uppercase">{cell.label}</span>
                                  <strong className={`${cell.color}`}>{cell.value}</strong>
                                </div>
                              ))}
                            </div>
                            {c.notes && (
                              <div className="bg-[#181818] p-3 rounded-lg border border-white/30">
                                <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Notas del atleta</span>
                                <p className="text-xs text-slate-300 font-sans italic">"{c.notes}"</p>
                              </div>
                            )}
                            {unifiedFeedbackSuccess && expandedReviewId === key && (
                              <div className="bg-[#fbcb1a]/15 border border-[#fbcb1a]/30 text-white p-3 rounded-lg text-xs flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#fbcb1a] text-sm">check_circle</span>
                                {unifiedFeedbackSuccess}
                              </div>
                            )}
                            {unifiedFeedbackError && expandedReviewId === key && (
                              <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs font-mono">{unifiedFeedbackError}</div>
                            )}
                            <form onSubmit={(e) => handleUnifiedSendFeedback(c.id, e)} className="space-y-2">
                              <textarea
                                value={expandedReviewId === key ? unifiedFeedbackText : (c.coachFeedback || '')}
                                onChange={e => setUnifiedFeedbackText(e.target.value)}
                                placeholder="Ajustes nutricionales, indicaciones de cargas, observaciones motivacionales..."
                                className="w-full bg-[#1c1b1b] border border-white/60 rounded p-3 text-sm text-white focus:ring-1 focus:ring-[#fbcb1a] focus:outline-none min-h-[80px] resize-none font-sans"
                              />
                              <button
                                type="submit"
                                disabled={unifiedSubmitting}
                                className="h-[36px] px-5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded flex items-center gap-1.5 hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
                              >
                                {unifiedSubmitting ? 'Guardando...' : 'Enviar y Aprobar'}
                                <span className="material-symbols-outlined text-sm">send</span>
                              </button>
                            </form>
                            </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Response item
                  const r = item.data;
                  const q = item.questionnaire;
                  const submittedDate = new Date(r.submittedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                  const previewAnswers = r.answers.slice(0, 2).map(ans => {
                    const question = q?.questions.find(qq => qq.id === ans.questionId);
                    return `${question?.label ?? ans.questionId}: ${ans.value}`;
                  }).join(' · ');

                  return (
                    <div key={key}>
                      <div
                        onClick={toggle}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-[#1e1e1b] ${isExpanded ? 'bg-[#1e1e1b]' : ''}`}
                      >
                        <span
                          className="material-symbols-outlined flex-shrink-0 text-lg"
                          style={{ color: '#00eefc', fontVariationSettings: "'FILL' 1" }}
                        >quiz</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-sans font-bold text-white text-xs">{q?.title ?? 'Cuestionario'}</span>
                            <span className="font-mono text-[9px] text-[#c6c9ab]">{submittedDate}</span>
                          </div>
                          {previewAnswers && (
                            <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5 truncate">{previewAnswers}</p>
                          )}
                        </div>
                        <span className="material-symbols-outlined text-[#c6c9ab] text-sm transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 bg-[#111111] border-t border-white/40 space-y-2">
                          {/* R7 action bar */}
                          {editingReviewKey !== key && (
                            <div className="flex items-center gap-2 pb-1">
                              <button
                                onClick={() => handleStartEditResponse(r, key)}
                                className="flex items-center gap-1 font-mono text-[10px] uppercase px-2.5 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#00eefc] hover:border-[#00eefc]/40 rounded-lg transition-all"
                              >
                                <span className="material-symbols-outlined text-xs">edit</span>Editar
                              </button>
                              <button
                                onClick={() => handleDeleteResponse(r.id, key)}
                                disabled={deletingReviewKey === key}
                                className="flex items-center gap-1 font-mono text-[10px] uppercase px-2.5 py-1.5 bg-[#1c1b1b] border border-white/7 text-red-400 hover:border-red-500/40 rounded-lg transition-all disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-xs">{deletingReviewKey === key ? 'progress_activity' : 'delete'}</span>Eliminar
                              </button>
                            </div>
                          )}
                          {editingReviewKey === key ? (
                            <div className="space-y-2">
                              {responseEditAnswers.map((ans, idx) => {
                                const question = q?.questions.find(qq => qq.id === ans.questionId);
                                const isNum = question?.type === 'numeric' || question?.type === 'scale';
                                const isBool = question?.type === 'boolean';
                                const isChoice = question?.type === 'choice';
                                return (
                                  <div key={ans.questionId} className="flex items-center gap-3">
                                    <span className="font-mono text-[9px] text-[#c6c9ab] flex-1">{question?.label ?? ans.questionId}</span>
                                    {isChoice && question?.options ? (
                                      <select value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                                        className="bg-[#1c1b1b] border border-white/7 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00eefc]/50 font-mono w-32">
                                        {question.options.map(o => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : isBool ? (
                                      <select value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value === 'true' } : a))}
                                        className="bg-[#1c1b1b] border border-white/7 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00eefc]/50 font-mono w-24">
                                        <option value="true">{question?.labelTrue ?? 'Sí'}</option>
                                        <option value="false">{question?.labelFalse ?? 'No'}</option>
                                      </select>
                                    ) : isNum ? (
                                      <input type="number" value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: parseFloat(e.target.value) || 0 } : a))}
                                        className="bg-[#1c1b1b] border border-white/7 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00eefc]/50 font-mono w-24 text-right" />
                                    ) : (
                                      <input type="text" value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                                        className="bg-[#1c1b1b] border border-white/7 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00eefc]/50 font-mono flex-1 min-w-0" />
                                    )}
                                  </div>
                                );
                              })}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => handleSaveResponseEdit(r.id)} disabled={savingEdit}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-[#fbcb1a] text-black font-sans text-[9px] font-bold uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 disabled:opacity-50 transition-all">
                                  <span className="material-symbols-outlined text-xs">save</span>{savingEdit ? 'Guardando…' : 'Guardar'}
                                </button>
                                <button onClick={() => { setEditingReviewKey(null); setResponseEditAnswers([]); }}
                                  className="px-3 py-1.5 font-mono text-[10px] uppercase text-[#c6c9ab] border border-white/7 rounded-lg hover:border-[#c6c9ab]/40 transition-all">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            r.answers.map(ans => {
                              const question = q?.questions.find(qq => qq.id === ans.questionId);
                              return (
                                <div key={ans.questionId} className="flex items-start gap-3">
                                  <span className="font-mono text-[9px] text-[#c6c9ab] flex-1 pt-0.5">{question?.label ?? ans.questionId}</span>
                                  <span className="font-mono text-xs text-white font-bold text-right">
                                    {String(ans.value)}{question?.unit ? ` ${question.unit}` : ''}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Asignar cuestionario ───────────────────────────────────── */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">quiz</span>
                  Asignar cuestionario
                </h3>
                <button
                  onClick={() => { setNewQForm(blankQForm()); setShowNewQEditor(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#fbcb1a]/40 text-[#fbcb1a] font-mono text-[10px] uppercase rounded-lg hover:border-[#fbcb1a]/70 transition-all flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">add</span>Crear cuestionario nuevo
                </button>
              </div>

              {/* Inline new-questionnaire editor modal — bottom-sheet on mobile, centered dialog on desktop */}
              {showNewQEditor && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4">
                  <div className="relative w-full sm:max-w-2xl bg-[#0d0d0d] border border-white/7 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
                    <button
                      onClick={() => setShowNewQEditor(false)}
                      className="absolute top-4 right-4 p-1.5 text-[#c6c9ab] hover:text-white transition-colors"
                      aria-label="Cerrar"
                    >
                      <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                    <QuestionnaireEditor
                      form={newQForm}
                      setForm={setNewQForm}
                      onSave={handleCreateNewQ}
                      onCancel={() => setShowNewQEditor(false)}
                      saving={savingNewQ}
                      isNew
                    />
                  </div>
                </div>
              )}

              {coachQuestionnaires.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[10px] font-mono text-[#c6c9ab]">
                    Todavía no hay cuestionarios. Usa el botón de arriba para crear uno.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={assignQId}
                    onChange={e => setAssignQId(e.target.value)}
                    className="w-full bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                  >
                    <option value="">— Seleccionar plantilla —</option>
                    {coachQuestionnaires.map(q => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                  </select>

                  <ScheduleFields
                    schedType={assignSchedType}
                    onSchedTypeChange={setAssignSchedType}
                    weekdays={assignWeekdays}
                    onWeekdaysChange={setAssignWeekdays}
                    intervalDays={assignIntervalDays}
                    onIntervalDaysChange={setAssignIntervalDays}
                    dayOfMonth={assignDayOfMonth}
                    onDayOfMonthChange={setAssignDayOfMonth}
                    startDate={assignStartDate}
                    onStartDateChange={setAssignStartDate}
                  />

                  <button
                    onClick={handleAssignQuestionnaire}
                    disabled={!assignQId || assigningQ || (assignSchedType === 'weekdays' && assignWeekdays.length === 0)}
                    className="px-4 py-2.5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 shadow-sm"
                  >
                    {assigningQ ? '…' : 'Asignar'}
                  </button>
                </div>
              )}

              {/* Active assignments list */}
              {athleteQAssignments.filter(a => a.active).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/60">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase tracking-wider">Asignados activos</p>
                  {athleteQAssignments.filter(a => a.active).map(a => {
                    const tmpl = coachQuestionnaires.find(q => q.id === a.questionnaireId);
                    const schedLabel = scheduleLabel(a.schedule);
                    return (
                      <div key={a.id} className="flex items-center gap-3 bg-[#1e1e1b] border border-white/7 rounded-xl px-3 py-2">
                        <span className="material-symbols-outlined text-[#fbcb1a] text-sm">quiz</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-sans font-bold text-white text-xs truncate">{tmpl?.title ?? a.questionnaireId}</p>
                          <p className="font-mono text-[9px] text-[#c6c9ab]">{schedLabel} · desde {a.startDate}</p>
                        </div>
                        <button onClick={() => handleDeactivateQ(a.id)} className="text-[#c6c9ab] hover:text-red-400 transition-colors" title="Desactivar">
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Peso corporal (coach view) ────────────────────────────── */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
              <BodyweightPanel athleteEmail={athlete.email} readOnly />
            </div>

            {/* ── Gráficas de evolución ──────────────────────────────────── */}
            {athleteQResponses.length > 0 && coachQuestionnaires.length > 0 && (
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-5">
                <QuestionnaireChartsPanel
                  questionnaires={coachQuestionnaires}
                  responses={athleteQResponses}
                />
              </div>
            )}

            {/* ── Respuestas del atleta ──────────────────────────────────── */}
            {athleteQResponses.length > 0 && (
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00eefc] text-sm">assignment_turned_in</span>
                  Respuestas enviadas
                </h3>
                <div className="space-y-3">
                  {[...athleteQResponses]
                    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
                    .slice(0, 10)
                    .map(r => {
                      const tmpl = coachQuestionnaires.find(q => q.id === r.questionnaireId);
                      const date = new Date(r.submittedAt);
                      return (
                        <details key={r.id} className="bg-[#1e1e1b] border border-white/7 rounded-xl overflow-hidden">
                          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[#222]">
                            <span className="material-symbols-outlined text-[#c6c9ab] text-sm">expand_more</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-sans font-bold text-white text-xs">{tmpl?.title ?? r.questionnaireId}</p>
                              <p className="font-mono text-[9px] text-[#c6c9ab]">
                                {date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' · '}{r.answers.length} respuestas
                              </p>
                            </div>
                          </summary>
                          <div className="px-4 pb-3 pt-1 space-y-2 border-t border-white/50">
                            {r.answers.map(ans => {
                              const q = tmpl?.questions.find(q => q.id === ans.questionId);
                              return (
                                <div key={ans.questionId} className="flex items-start gap-3">
                                  <span className="font-mono text-[9px] text-[#c6c9ab] flex-1 pt-0.5">{q?.label ?? ans.questionId}</span>
                                  <span className="font-mono text-xs text-white font-bold text-right">
                                    {String(ans.value)}{q?.unit ? ` ${q.unit}` : ''}
                                    {q?.type === 'boolean' ? (ans.value ? ' ✓' : ' ✗') : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                </div>
              </div>
            )}
        </div>
      )}

      {/* ── Tab: Entrenamientos ───────────────────────────────────────────── */}
      {/* Orden: análisis/dashboard arriba (periodización + historial de cargas),
          información del atleta en medio, programación/edición abajo. */}
      {activeTab === 'entrenamientos' && (
        <div className="space-y-6">
          {/* Periodización de entrenamiento — visión analítica */}
          <div>
            <h2 className="font-sans font-black text-xl tracking-tight text-white uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
              Periodización de entrenamiento
            </h2>
            <p className="font-mono text-xs text-[#c6c9ab] mt-1">Cómo va el ciclo actual antes de tocar la programación.</p>
          </div>
          <MesocycleDashboard mesocycles={mesocycles} athleteEmail={athlete.email} />
          <LoadHistoryPanel logs={athleteLogs} exercises={exercises} athleteId={athlete.email} />

          {/* Onboarding exercise reference */}
          {onboardingData && (onboardingData.favoriteExercises.length > 0 || onboardingData.hatedExercises.length > 0 || onboardingData.equipment.length > 0) && (
            <div className="bg-[#0e0e0e] border border-[#fbcb1a]/15 rounded-xl p-4 space-y-3">
              <p className="font-mono text-[10px] text-[#fbcb1a] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">person_check</span>
                Preferencias de ejercicio
              </p>
              {onboardingData.favoriteExercises.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase">Favoritos</p>
                  <div className="flex flex-wrap gap-1.5">
                    {onboardingData.favoriteExercises.map(e => (
                      <span key={e} className="bg-[#fbcb1a]/10 border border-[#fbcb1a]/25 text-[#fbcb1a] px-2.5 py-1 rounded-full text-[10px] font-mono font-bold">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {onboardingData.hatedExercises.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase">Evitar</p>
                  <div className="flex flex-wrap gap-1.5">
                    {onboardingData.hatedExercises.map(e => (
                      <span key={e} className="bg-red-500/10 border border-red-500/20 text-red-300 px-2.5 py-1 rounded-full text-[10px] font-mono">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {onboardingData.equipment.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-[9px] text-[#c6c9ab] uppercase">Material disponible</p>
                  <div className="flex flex-wrap gap-1.5">
                    {onboardingData.equipment.map(e => (
                      <span key={e} className="bg-[#1e1e1b] border border-white/7 text-[#c6c9ab] px-2.5 py-1 rounded-full text-[10px] font-mono">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {onboardingData.injuries && (
                <p className="font-mono text-[10px] text-amber-300 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">personal_injury</span>
                  {onboardingData.injuries}
                </p>
              )}
            </div>
          )}

          {/* Notas del atleta (por ejercicio + entreno completo) */}
          {(() => {
            const logsWithNotes = athleteLogs
              .filter(l => l.note || l.entries.some(e => e.note))
              .sort((a, b) => b.date.localeCompare(a.date));
            if (logsWithNotes.length === 0) return null;
            return (
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-3">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-300 text-base">sticky_note_2</span>
                  Notas del atleta
                </h3>
                {logsWithNotes.map(log => {
                  const wo = getWorkout(log.workoutId);
                  const unseen = !log.noteCoachSeen;
                  return (
                    <div
                      key={log.id}
                      className={`border rounded-lg p-3.5 space-y-2 ${unseen ? 'bg-amber-500/5 border-amber-500/25' : 'bg-[#1e1e1e] border-white/7'}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-sans text-xs font-bold text-white">{wo?.name || 'Rutina'} · {log.date}</p>
                        {unseen && (
                          <button
                            onClick={() => {
                              updateWorkoutLog(log.id, { noteCoachSeen: true }).catch(console.error);
                              setAthleteLogs(prev => prev.map(l => l.id === log.id ? { ...l, noteCoachSeen: true } : l));
                            }}
                            className="flex-shrink-0 flex items-center gap-1 text-[9px] font-sans font-bold uppercase text-amber-300 hover:text-amber-200 transition-colors border border-amber-500/30 px-2 py-1 rounded-lg"
                          >
                            <span className="material-symbols-outlined text-xs">visibility</span>
                            Marcar visto
                          </button>
                        )}
                      </div>
                      {log.note && (
                        <p className="text-xs text-[#c6c9ab] italic">"{log.note}"</p>
                      )}
                      {log.entries.filter(e => e.note).map(e => (
                        <p key={e.exerciseId} className="text-xs text-[#c6c9ab]">
                          <span className="font-mono text-[10px] text-[#fbcb1a]">{getExercise(e.exerciseId)?.name || e.exerciseId}:</span> "{e.note}"
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Workout assignments — plegado por defecto: la lista puede ser larga
              y lo habitual es venir a asignar, no a repasarla entera */}
          <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setAssignmentsExpanded(e => !e)}
                className="flex items-center gap-2 text-left group"
              >
                <span className="material-symbols-outlined text-[#fbcb1a] text-sm">fitness_center</span>
                <h3 className="font-sans font-bold text-base text-white group-hover:text-[#fbcb1a] transition-colors">
                  Entrenamientos asignados
                </h3>
                {assignments.length > 0 && (
                  <span className="font-mono text-[10px] text-[#c6c9ab] bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                    {assignments.length}
                  </span>
                )}
                <span
                  className="material-symbols-outlined text-[#c6c9ab] text-base transition-transform"
                  style={{ transform: assignmentsExpanded ? 'rotate(180deg)' : 'none' }}
                >
                  expand_more
                </span>
              </button>
              <button
                onClick={() => { setAssignWorkoutId(workouts[0]?.id || ''); setAssignDate(new Date().toISOString().split('T')[0]); setShowAssignModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 text-[#fbcb1a] hover:bg-[#fbcb1a]/20 font-mono text-[10px] uppercase rounded-lg transition-all"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Asignar
              </button>
            </div>
            {assignments.length === 0 ? (
              <div className="py-6 text-center">
                <span className="material-symbols-outlined text-2xl text-[#2a2a2a] block mb-2">calendar_today</span>
                <p className="text-xs text-[#c6c9ab]">Sin entrenamientos asignados todavía.</p>
              </div>
            ) : !assignmentsExpanded ? null : (
              <div className="space-y-2">
                {[...assignments].sort((a, b) => a.date.localeCompare(b.date)).map(a => {
                  const wo = workouts.find(w => w.id === a.workoutId);
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-[#181816] border border-white/50 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="material-symbols-outlined text-base text-[#c6c9ab] flex-shrink-0">event</span>
                        <div className="min-w-0">
                          <p className="font-sans font-bold text-sm text-white truncate flex items-center gap-1.5">
                            {wo?.name || <span className="italic text-[#c6c9ab]">Rutina eliminada</span>}
                            {wo?.exercises.some(e => e.recordVideoSet) && (
                              <span className="material-symbols-outlined text-[#fbcb1a] text-sm flex-shrink-0" title="Esta rutina pide grabar vídeo">videocam</span>
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-[#c6c9ab]">{a.date}{wo ? ` · ${wo.exercises.length} ejercicios` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[9px] font-sans font-bold uppercase px-2 py-0.5 rounded-lg ${STATUS_STYLE[a.status]}`}>
                          {STATUS_LABEL[a.status]}
                        </span>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="text-[#c6c9ab] hover:text-red-400 p-1 rounded transition-colors" title="Eliminar">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Macrociclos — programación de volumen/semanas (el análisis vive arriba) */}
          <MesocycleManager
            coachId={coachId}
            athleteEmail={athlete.email}
            athleteEquipment={onboardingData?.equipment ?? []}
          />
        </div>
      )}

      {/* ── Tab: Dietas ───────────────────────────────────────────────────── */}
      {activeTab === 'dietas' && (
        showGenerator && onboardingData ? (
          /* ── Auto-generator ── */
          <DietAutoGenerator
            athleteEmail={athlete.email}
            onboarding={onboardingData}
            onSaved={async () => {
              setShowGenerator(false);
              getDietsForAthlete(athlete.email)
                .then(diets => setAthleteDiets(diets.filter(d => !d.selfManaged)))
                .catch(console.error);
            }}
            onCancel={() => setShowGenerator(false)}
          />
        ) : dietEditorDiet !== undefined ? (
          /* ── Diet editor (embedded NutritionPlansScreen) ── */
          <NutritionPlansScreen
            coachId={coachId}
            athleteEmail={athlete.email}
            embeddedDiet={dietEditorDiet}
            onboardingData={onboardingData}
            onSaved={async (_saved) => {
              setDietEditorDiet(undefined);
              getDietsForAthlete(athlete.email)
                .then(diets => setAthleteDiets(diets.filter(d => !d.selfManaged)))
                .catch(console.error);
            }}
            onCancelled={() => setDietEditorDiet(undefined)}
          />
        ) : (
          /* ── Diet list + config ── */
          <div className="space-y-6">
            {/* Diets */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">nutrition</span>
                  Dietas disponibles
                </h3>
                <div className="flex gap-2">
                  {onboardingData && (
                    <button
                      onClick={() => setShowGenerator(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-white/7 text-[#fbcb1a] font-mono text-[10px] font-bold uppercase rounded-lg hover:bg-[#252511] active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">auto_awesome</span>
                      Generar auto
                    </button>
                  )}
                  <button
                    onClick={() => setDietEditorDiet(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#fbcb1a] text-black font-sans text-[10px] font-bold uppercase rounded-lg hover:bg-[#d4a800] active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Nueva dieta
                  </button>
                </div>
              </div>
              {athleteDiets.length === 0 ? (
                <div className="py-6 text-center">
                  <span className="material-symbols-outlined text-2xl text-[#2a2a2a] block mb-2">nutrition</span>
                  <p className="text-xs text-[#c6c9ab]">No hay dietas creadas para este atleta.</p>
                  <p className="text-[10px] text-[#c6c9ab] mt-1 font-mono">Pulsa "Nueva dieta" para crear la primera.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {athleteDiets.map(dt => {
                    const active = athleteDietConfig?.activeDietIds?.includes(dt.id) ?? false;
                    return (
                      <div
                        key={dt.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${active ? 'bg-[#1a1c12] border-[#fbcb1a]/40' : 'bg-[#181816] border-white/7'}`}
                      >
                        {/* Toggle checkbox */}
                        <button
                          onClick={() => handleToggleDiet(dt.id)}
                          className="flex-shrink-0"
                          title={active ? 'Desactivar dieta' : 'Activar dieta'}
                        >
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${active ? 'bg-[#fbcb1a] border-[#fbcb1a]' : 'border-[#3a3a3a] hover:border-[#c6c9ab]'}`}>
                            {active && <span className="material-symbols-outlined text-black" style={{ fontSize: '11px' }}>check</span>}
                          </span>
                        </button>

                        {/* Diet info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className={`font-sans font-bold text-sm truncate ${active ? 'text-white' : 'text-[#c6c9ab]'}`}>{dt.name}</p>
                            {dt.isDraft === true && (
                              <span className="flex-shrink-0 text-[8px] font-mono font-bold uppercase text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                                BORRADOR
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-[#c6c9ab]">
                            {dt.meals.length} comida{dt.meals.length !== 1 ? 's' : ''} · {dt.meals.reduce((s, m) => s + m.items.length, 0)} alimentos
                          </p>
                        </div>

                        {active && (
                          <span className="text-[9px] font-sans font-bold uppercase text-[#fbcb1a] bg-[#fbcb1a]/10 px-2 py-0.5 rounded-lg border border-[#fbcb1a]/20 flex-shrink-0">
                            Activa
                          </span>
                        )}

                        {/* Edit button */}
                        <button
                          onClick={() => setDietEditorDiet(dt)}
                          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-[#1c1b1b] border border-white/7 text-[#00eefc] hover:border-[#00eefc]/40 font-mono text-[10px] uppercase rounded-lg transition-all"
                          title="Editar dieta"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                          Editar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Weekly schedule grid */}
            <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#fbcb1a] text-sm">calendar_month</span>
                  Programación semanal
                </h3>
                {pendingScheduledDiets.length > 0 && (
                  <span className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase text-amber-400 bg-amber-400/10 px-2 py-1 rounded-lg border border-amber-400/20">
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>pending_actions</span>
                    {pendingScheduledDiets.length} {pendingScheduledDiets.length === 1 ? 'pendiente de generar' : 'pendientes de generar'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#c6c9ab] font-mono">
                Asigna una dieta a cada día. El atleta la verá cargada automáticamente.
              </p>
              <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-1.5 min-w-[360px]">
                {WEEK_DAYS.map(day => {
                  const scheduledId = athleteDietConfig?.weeklySchedule?.[day] ?? null;
                  const scheduledDiet = scheduledId ? athleteDiets.find(d => d.id === scheduledId) ?? null : null;
                  const totalExch = scheduledDiet
                    ? (scheduledDiet.budget?.HC ?? 0) + (scheduledDiet.budget?.PROT ?? 0) + (scheduledDiet.budget?.GRASA ?? 0)
                    : null;
                  return (
                    <div key={day} className="flex flex-col gap-1">
                      <span className="text-[9px] font-mono font-bold text-[#c6c9ab] uppercase text-center tracking-widest">
                        {WEEK_DAY_SHORT[day]}
                      </span>
                      <select
                        value={scheduledId ?? ''}
                        onChange={e => handleScheduleDay(day, e.target.value || null)}
                        className="w-full bg-[#1c1b1b] border border-white/7 text-[#c6c9ab] text-[9px] font-mono rounded-lg px-1.5 py-1.5 focus:outline-none focus:border-[#fbcb1a]/40 hover:border-[#3a3a3a] transition-colors cursor-pointer"
                        title={WEEK_DAY_FULL[day]}
                      >
                        <option value="">Libre</option>
                        {athleteDiets.map(dt => (
                          <option key={dt.id} value={dt.id}>{dt.name}</option>
                        ))}
                      </select>
                      {totalExch !== null && (
                        <span className="text-[8px] font-mono text-[#fbcb1a] text-center">
                          {totalExch} int.
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>{/* end grid cols-7 */}
              </div>{/* end overflow-x-auto */}
            </div>

            {/* Periodización nutricional — el panel es dueño del estado de
                edición y renderiza el dashboard de rendimiento (gráfico +
                stats) como su propia vista de lectura; son una sola sección. */}
            <NutritionPeriodizationPanel
              athleteEmail={athlete.email}
              athleteName={athlete.displayName}
              targetWeightKg={athlete.targetWeight}
              diets={athleteDiets}
              onboarding={onboardingData}
              currentWeightKg={bodyweightLogs.length > 0 ? bodyweightLogs[bodyweightLogs.length - 1].weight : onboardingData?.weightKg}
              stepGoal={nutritionConfig?.stepGoal ?? 8000}
              kcalPerStep={nutritionConfig?.kcalPerStep ?? DEFAULT_KCAL_PER_STEP}
              onDietsChanged={() => {
                getDietsForAthlete(athlete.email)
                  .then(diets => setAthleteDiets(diets.filter(d => !d.selfManaged)))
                  .catch(console.error);
              }}
            />

            {/* Nutrition mode config */}
            {nutritionConfig && (
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00eefc] text-sm">tune</span>
                  Modos de alimentación habilitados
                </h3>
                <p className="text-[10px] text-[#c6c9ab] font-mono">
                  Si hay varios activos, el atleta podrá elegir entre ellos en su tracker.
                </p>
                <div className="flex gap-3 flex-wrap">
                  {(['OMNIVORO', 'VEGANO', 'SIN_PESAR'] as DietMode[]).map(mode => {
                    const active = nutritionConfig.enabledModes?.includes(mode) ?? false;
                    return (
                      <button
                        key={mode}
                        onClick={() => handleToggleDietMode(mode)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider border transition-all ${active ? 'bg-[#fbcb1a]/10 border-[#fbcb1a]/40 text-[#fbcb1a]' : 'bg-[#1c1b1b] border-white/7 text-[#c6c9ab] hover:border-[#c6c9ab]/30 hover:text-white'}`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${active ? 'bg-[#fbcb1a] border-[#fbcb1a]' : 'border-[#3a3a3a]'}`}>
                          {active && <span className="material-symbols-outlined text-black" style={{ fontSize: '10px' }}>check</span>}
                        </span>
                        {DIET_MODE_LABELS[mode]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step goal config */}
            {nutritionConfig && (
              <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
                <h3 className="font-sans font-bold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#00eefc] text-sm">directions_walk</span>
                  Objetivo de pasos
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Pasos/día</label>
                    <input
                      type="number"
                      min={0}
                      defaultValue={nutritionConfig.stepGoal ?? ''}
                      placeholder="8000"
                      onBlur={e => {
                        const val = parseInt(e.target.value, 10);
                        handleSaveStepConfig({ stepGoal: isNaN(val) ? undefined : val });
                      }}
                      className="w-full bg-[#1e1e1b] border border-white/7 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Kcal/paso</label>
                    <input
                      type="number"
                      min={0}
                      step={0.001}
                      defaultValue={nutritionConfig.kcalPerStep ?? DEFAULT_KCAL_PER_STEP}
                      onBlur={e => {
                        const val = parseFloat(e.target.value);
                        handleSaveStepConfig({ kcalPerStep: isNaN(val) ? undefined : val });
                      }}
                      className="w-full bg-[#1e1e1b] border border-white/7 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-[#c6c9ab] font-mono">
                  Por defecto {DEFAULT_KCAL_PER_STEP} kcal/paso (1000 pasos ≈ 46 kcal).
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Tab: Road map ─────────────────────────────────────────────────── */}
      {activeTab === 'roadmap' && (
        <CoachRoadmapView athleteEmail={athlete.email} />
      )}

      {/* ── Tab: Análisis ─────────────────────────────────────────────────── */}
      {activeTab === 'analisis' && (
        <div className="space-y-6">
          {/* Sub-switcher */}
          <div className="flex bg-[#181816] border border-white/7 p-1 rounded-lg gap-1 w-fit">
            {([
              { id: 'reportes',      label: 'Reportes',      icon: 'analytics' },
              { id: 'nutricion',     label: 'Nutrición',     icon: 'nutrition' },
              { id: 'correlaciones', label: 'Correlaciones', icon: 'insights'  },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => onAnalisisTabChange(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-sans text-xs font-bold tracking-wider uppercase transition-all ${
                  analisisTab === t.id ? 'bg-[#fbcb1a] text-black shadow-lg shadow-[#fbcb1a]/10' : 'text-[#c6c9ab] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {analisisTab === 'reportes' && (
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

          {analisisTab === 'nutricion' && (
            <NutritionAnalysisPanel
              athleteEmail={athlete.email}
              athleteName={athlete.displayName}
              targetWeight={athlete.targetWeight}
            />
          )}

          {analisisTab === 'correlaciones' && (
            <CorrelationPanel
              athleteEmail={athlete.email}
              logs={athleteLogs}
              exercises={exercises}
              responses={athleteQResponses}
              questionnaires={coachQuestionnaires}
              bodyweightLogs={bodyweightLogs}
            />
          )}
        </div>
      )}

      {/* ── Assign modal ──────────────────────────────────────────────────── */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center sm:p-4">
          <div className="bg-[#1e1e1b] border border-white/7 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between">
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-tight">Asignar entrenamiento</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-[#c6c9ab] hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs text-[#c6c9ab] font-mono flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-[#fbcb1a]">person</span>
              Atleta: <strong className="text-white">{athlete.displayName}</strong>
            </p>
            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Rutina *</label>
              {workouts.length === 0 ? (
                <p className="text-xs text-[#c6c9ab] font-mono italic">No hay rutinas disponibles.</p>
              ) : (
                <select
                  value={assignWorkoutId}
                  onChange={e => setAssignWorkoutId(e.target.value)}
                  className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] cursor-pointer"
                >
                  {workouts.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.exercises.length} ej.)</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider mb-1.5">Fecha *</label>
              <input
                type="date"
                value={assignDate}
                onChange={e => setAssignDate(e.target.value)}
                className="w-full bg-[#181816] border border-white/7 rounded-lg px-3 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAssignModal(false)} className="flex-1 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all">
                Cancelar
              </button>
              <button
                onClick={handleCreateAssignment}
                disabled={isAssigning || !assignWorkoutId || !assignDate || workouts.length === 0}
                className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isAssigning ? (
                  <><span className="material-symbols-outlined text-sm animate-spin">refresh</span>Asignando...</>
                ) : (
                  <><span className="material-symbols-outlined text-sm">event_available</span>Confirmar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
