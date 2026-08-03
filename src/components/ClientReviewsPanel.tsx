import React, { useState, useMemo } from 'react';
import {
  UserProfile, WeightCheckIn, WorkoutAssignment, Workout, ProgressPhoto,
  PhotoView, PhotoAssignment, Questionnaire, QuestionnaireAssignment,
  QuestionnaireResponse, QSchedule, QScheduleType, OnboardingData,
  OnboardingTemplateQuestion,
} from '../types';
import {
  submitCoachFeedback, updateCheckIn, deleteCheckIn,
  updateQuestionnaireResponse, deleteQuestionnaireResponse,
  assignQuestionnaire, deactivateAssignment, createQuestionnaire,
  assignPhotoCheckIn, deactivatePhotoAssignment,
} from '../dbService';
import { scheduleLabel } from '../utils/scheduleEngine';
import { useToast } from '../hooks/useToast';
import Skeleton from './Skeleton';
import ScheduleFields from './ScheduleFields';
import OnboardingForm from './OnboardingForm';
import FoodPreferencesPanel from './FoodPreferencesPanel';
import ProgressRing from './ProgressRing';
import BodyweightPanel from './BodyweightPanel';
import QuestionnaireChartsPanel from './QuestionnaireChartsPanel';
import QuestionnaireEditor, { FormState as QFormState, blankForm as blankQForm } from './QuestionnaireEditor';
import ExercisePersonalNotesPanel from './ExercisePersonalNotesPanel';
import TaskManagerPanel from './TaskManagerPanel';

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

interface Props {
  athlete: UserProfile;
  coachId: string;
  athleteCheckins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  athletePhotos: ProgressPhoto[];
  loadingPhotos: boolean;
  athletePhotoAssignments: PhotoAssignment[];
  setAthletePhotoAssignments: React.Dispatch<React.SetStateAction<PhotoAssignment[]>>;
  onboardingData: OnboardingData | null;
  setOnboardingData: React.Dispatch<React.SetStateAction<OnboardingData | null>>;
  onboardingTemplate: OnboardingTemplateQuestion[];
  assignments: WorkoutAssignment[];
  workouts: Workout[];
  athleteQResponses: QuestionnaireResponse[];
  setAthleteQResponses: React.Dispatch<React.SetStateAction<QuestionnaireResponse[]>>;
  coachQuestionnaires: Questionnaire[];
  setCoachQuestionnaires: React.Dispatch<React.SetStateAction<Questionnaire[]>>;
  athleteQAssignments: QuestionnaireAssignment[];
  setAthleteQAssignments: React.Dispatch<React.SetStateAction<QuestionnaireAssignment[]>>;
  weekTotal: number;
  weekCompleted: number;
  weekPct: number;
}

export default function ClientReviewsPanel({
  athlete, coachId, athleteCheckins, onRefreshCheckIns, athletePhotos, loadingPhotos,
  athletePhotoAssignments, setAthletePhotoAssignments, onboardingData, setOnboardingData,
  onboardingTemplate, assignments, workouts, athleteQResponses, setAthleteQResponses,
  coachQuestionnaires, setCoachQuestionnaires, athleteQAssignments, setAthleteQAssignments,
  weekTotal, weekCompleted, weekPct,
}: Props) {
  const { showToast } = useToast();

  // Onboarding
  const [editingOnboarding, setEditingOnboarding] = useState(false);
  // Colapsada por defecto: es referencia estática (rara vez cambia) y en su día
  // fue la sección que más ruido metía al abrir Revisiones — un resumen de una
  // línea basta la mayoría de las veces.
  const [fichaExpanded, setFichaExpanded] = useState(false);

  // Photos
  const [selectedView, setSelectedView] = useState<PhotoView>('front');

  // Photo check-in assignments
  const [assignPhotoViews, setAssignPhotoViews]         = useState<PhotoView[]>(['front']);
  const [assignPhotoSchedType, setAssignPhotoSchedType] = useState<QScheduleType>('once');
  const [assignPhotoWeekdays, setAssignPhotoWeekdays]   = useState<number[]>([]);
  const [assignPhotoIntervalDays, setAssignPhotoIntervalDays] = useState(7);
  const [assignPhotoDayOfMonth, setAssignPhotoDayOfMonth]     = useState(1);
  const [assignPhotoStartDate, setAssignPhotoStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigningPhoto, setAssigningPhoto] = useState(false);

  // Questionnaires
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

  const handleUnifiedSendFeedback = async (checkInId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!unifiedFeedbackText.trim()) { setUnifiedFeedbackError('Por favor, escribe tu feedback.'); return; }
    setUnifiedFeedbackError('');
    setUnifiedFeedbackSuccess('');
    setUnifiedSubmitting(true);
    try {
      await submitCoachFeedback(checkInId, unifiedFeedbackText);
      setUnifiedFeedbackSuccess('¡Feedback enviado!');
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

  return (
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
            <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
              <div className="p-4 border-b border-hairline flex items-center justify-between bg-raised">
                <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-body-s">photo_camera</span>
                  Historial Fotográfico
                  {athletePhotos.length > 0 && (
                    <span className="font-mono text-caption text-ink-2">({athletePhotos.length} fotos)</span>
                  )}
                </h3>
                <div className="flex bg-raised rounded-control ">
                  {([
                    { id: 'front', label: 'Frente'   },
                    { id: 'side',  label: 'Lateral'  },
                    { id: 'back',  label: 'Espalda'  },
                  ] as { id: PhotoView; label: string }[]).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedView(v.id)}
                      className={`px-3 py-1 rounded-control font-sans text-caption font-bold uppercase transition-all tracking-wider ${selectedView === v.id ? 'bg-accent text-black shadow-md' : 'text-ink-2 hover:text-white'}`}
                    >{v.label}</button>
                  ))}
                </div>
              </div>
              {loadingPhotos ? (
                <div className="p-3 grid grid-cols-3 gap-2">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                </div>
              ) : viewPhotos.length === 0 ? (
                <div className="p-10 text-center">
                  <span className="material-symbols-outlined text-display text-ink-3 block mb-2">photo_camera</span>
                  <p className="font-sans text-label text-ink-2">Sin fotos todavía.</p>
                </div>
              ) : (
                <div className="p-3 bg-bg/90">
                  {viewPhotos.length === 1 ? (
                    <div className="relative rounded-surface overflow-hidden border border-accent/20 group max-w-[240px] mx-auto">
                      <div className="absolute top-2 left-2 z-10 bg-accent text-black px-3 rounded-control font-sans text-caption font-bold shadow-md">
                        Actual · {fmtDate(latest.date)}
                      </div>
                      <img className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500" src={latest.url} alt="Actual" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative rounded-surface overflow-hidden border border-hairline group">
                        <div className="absolute top-2 left-2 z-10 bg-black/75 backdrop-blur-sm border border-hairline px-3 rounded-control text-white font-mono text-caption">
                          Baseline · {fmtDate(baseline.date)}
                        </div>
                        <img className="w-full h-[280px] object-cover object-top filter grayscale-[20%] group-hover:filter-none transition-all duration-500" src={baseline.url} alt="Baseline" />
                      </div>
                      <div className="relative rounded-surface overflow-hidden border border-accent/20 group">
                        <div className="absolute top-2 left-2 z-10 bg-accent text-black px-3 rounded-control font-sans text-caption font-bold shadow-md">
                          Actual · {fmtDate(latest.date)}
                        </div>
                        <img className="w-full h-[280px] object-cover object-top group-hover:scale-105 transition-all duration-500" src={latest.url} alt="Actual" />
                      </div>
                    </div>
                  )}
                  {viewPhotos.length > 2 && (
                    <p className="text-center font-mono text-caption text-ink-2 mt-2">
                      {viewPhotos.length} fotos — mostrando baseline y más reciente
                    </p>
                  )}
                </div>
              )}

              {/* ── Asignar fotos de check-in (vive dentro del historial fotográfico) ── */}
              <div className="p-4 border-t border-hairline space-y-4">
                <h4 className="font-sans font-bold text-body-s text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-body-s">edit_calendar</span>
                  Asignar fotos de check-in
                </h4>

                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
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
                          className={`px-3 py-2 rounded-control font-sans text-caption font-bold uppercase tracking-wider border transition-all ${
                            active
                              ? 'bg-accent border-accent text-black'
                              : 'bg-raised border-hairline text-ink-2 hover:border-hairline'
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
                    className="px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 shadow-sm"
                  >
                    {assigningPhoto ? '…' : 'Asignar'}
                  </button>
                </div>

                {athletePhotoAssignments.filter(a => a.active).length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-hairline">
                    <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Asignados activos</p>
                    {athletePhotoAssignments.filter(a => a.active).map(a => {
                      const schedLabel = scheduleLabel(a.schedule);
                      const viewsLabel = a.views.map(v => v === 'front' ? 'Frente' : v === 'side' ? 'Lateral' : 'Espalda').join(', ');
                      return (
                        <div key={a.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
                          <span className="material-symbols-outlined text-accent text-body-s">photo_camera</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-sans font-bold text-white text-label truncate">{viewsLabel}</p>
                            <p className="font-mono text-caption text-ink-2">{schedLabel} · desde {a.startDate}</p>
                          </div>
                          <button onClick={() => handleDeactivatePhoto(a.id)} className="text-ink-2 hover:text-red-400 transition-colors" title="Desactivar">
                            <span className="material-symbols-outlined text-body-s">close</span>
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
        <div className="bg-surface border border-hairline rounded-surface p-5">
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
                <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-accent text-title-s flex-shrink-0">person_check</span>
                  <span className="truncate">Ficha de iniciación</span>
                  <span className="font-mono text-caption text-ink-3 font-normal normal-case truncate">
                    {[
                      onboardingData.sex && (onboardingData.sex === 'male' ? 'Hombre' : 'Mujer'),
                      onboardingData.birthDate && `${displayAge(onboardingData.birthDate)} años`,
                      onboardingData.goalBody && GOAL_BODY_LABELS[onboardingData.goalBody],
                    ].filter(Boolean).join(' · ')}
                  </span>
                </h3>
                <span className="material-symbols-outlined text-ink-2 flex-shrink-0 transition-transform" style={{ transform: fichaExpanded ? 'rotate(180deg)' : 'none' }}>
                  expand_more
                </span>
              </button>
              {fichaExpanded && (
                <div className="flex justify-end -mt-2">
                  <button
                    onClick={() => setEditingOnboarding(true)}
                    className="flex items-center gap-1 font-mono text-caption text-ink-2 hover:text-accent transition-colors border border-hairline px-3 py-2 rounded-control"
                  >
                    <span className="material-symbols-outlined text-body-s">edit</span>Editar
                  </button>
                </div>
              )}
              {fichaExpanded && (
              <>

              {/* Composición corporal */}
              {(onboardingData.sex || onboardingData.weightKg || onboardingData.heightCm) && (
                <div className="space-y-2">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Composición corporal</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.sex && (
                      <span className="text-ink-2">Sexo: <span className="text-white font-bold">{onboardingData.sex === 'male' ? 'Hombre' : 'Mujer'}</span></span>
                    )}
                    {onboardingData.birthDate && (
                      <span className="text-ink-2">Edad: <span className="text-white font-bold">{displayAge(onboardingData.birthDate)} años</span></span>
                    )}
                    {onboardingData.weightKg && (
                      <span className="text-ink-2">Peso: <span className="text-white font-bold">{onboardingData.weightKg} kg</span></span>
                    )}
                    {onboardingData.heightCm && (
                      <span className="text-ink-2">Altura: <span className="text-white font-bold">{onboardingData.heightCm} cm</span></span>
                    )}
                    {onboardingData.bodyFatPct && (
                      <span className="text-ink-2">%Grasa: <span className="text-white font-bold">{onboardingData.bodyFatPct}%</span></span>
                    )}
                    {onboardingData.musclePct && (
                      <span className="text-ink-2">%Músculo: <span className="text-white font-bold">{onboardingData.musclePct}%</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Actividad y objetivo */}
              {(onboardingData.activityLevel || onboardingData.goalBody || onboardingData.goalCapacity) && (
                <div className="space-y-2">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Actividad y objetivo</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-sans">
                    {onboardingData.activityLevel && (
                      <span className="text-ink-2">Actividad: <span className="text-white font-bold">{ACTIVITY_LABELS[onboardingData.activityLevel]}</span></span>
                    )}
                    {onboardingData.goalBody && (
                      <span className="text-ink-2">Objetivo: <span className="text-accent font-bold">{GOAL_BODY_LABELS[onboardingData.goalBody]}</span></span>
                    )}
                    {onboardingData.goalCapacity && (
                      <span className="text-ink-2">Capacidad: <span className="text-white font-bold">{GOAL_CAP_LABELS[onboardingData.goalCapacity]}</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Nutrition */}
              <div className="space-y-2">
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Nutrición</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-sans">
                  <span className="text-ink-2">Dieta: <span className="text-white font-bold">{DIET_LABELS[onboardingData.dietType]}</span></span>
                  <span className="text-ink-2">Calorías: <span className="text-accent font-bold">{onboardingData.targetCalories} kcal/día</span></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: 'HC',    g: onboardingData.macroGrams.hc,    pct: onboardingData.macroSplit.hc,    ef: 25, color: 'var(--color-warning)' },
                    { label: 'PROT',  g: onboardingData.macroGrams.prot,  pct: onboardingData.macroSplit.prot,  ef: 25, color: 'var(--color-data)' },
                    { label: 'GRASA', g: onboardingData.macroGrams.grasa, pct: onboardingData.macroSplit.grasa, ef: 11, color: 'var(--color-danger)' },
                  ]).map(m => (
                    <div key={m.label} className="bg-raised border border-hairline rounded-surface px-3 py-2 text-center">
                      <p className="font-sans text-caption uppercase" style={{ color: m.color }}>{m.label}</p>
                      <p className="font-mono font-bold text-white text-body-s">{m.g}g</p>
                      <p className="font-mono text-caption text-ink-3">{m.pct}% · {fmtExch(m.g, m.ef)} int</p>
                    </div>
                  ))}
                </div>
                {onboardingData.allergies.length > 0 && (
                  <p className="font-mono text-caption text-amber-400 pt-1">
                    <span className="material-symbols-outlined text-label align-middle mr-1">warning</span>
                    Alergias: {onboardingData.allergies.join(', ')}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1 font-mono text-caption text-ink-3">
                  <span className="text-amber-400">⭐ {onboardingData.likedFoods.length} favoritos</span>
                  <span className="text-red-400">➖ {onboardingData.dislikedFoods.length} no quiero</span>
                  <span className="text-ink-3">· editar abajo</span>
                </div>
              </div>

              {/* Comidas */}
              {onboardingData.meals && onboardingData.meals.length > 0 && (
                <div className="space-y-2">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Comidas ({onboardingData.mealCount ?? onboardingData.meals.length} ingestas)</p>
                  <div className="flex flex-wrap gap-2">
                    {onboardingData.meals.map(m => (
                      <div key={m.intakeType} className="flex items-center gap-2 bg-raised border border-hairline rounded-surface px-3 py-2">
                        <span className="font-sans text-caption text-ink-2">{m.name}</span>
                        {m.needsTupper && (
                          <span className="font-mono text-caption bg-data/10 border border-data/30 text-data rounded-control px-2 ">tupper</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cocina */}
              {(onboardingData.cookingLevel || onboardingData.cookingMaxTime) && (
                <div className="space-y-1">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Cocina</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.cookingLevel && (
                      <span className="text-ink-2">Nivel: <span className="text-white font-bold">{onboardingData.cookingLevel}/5</span></span>
                    )}
                    {onboardingData.cookingMaxTime && (
                      <span className="text-ink-2">Tiempo máx: <span className="text-white font-bold">{onboardingData.cookingMaxTime} min</span></span>
                    )}
                    {onboardingData.breakfastVariety && (
                      <span className="text-ink-2">Variedad desayunos: <span className="text-white font-bold">{onboardingData.breakfastVariety}/5</span></span>
                    )}
                    {onboardingData.lunchVariety && (
                      <span className="text-ink-2">Variedad almuerzos: <span className="text-white font-bold">{onboardingData.lunchVariety}/5</span></span>
                    )}
                  </div>
                </div>
              )}

              {/* Training */}
              <div className="space-y-2">
                <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Entrenamiento</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-sans">
                  <span className="text-ink-2">Nivel: <span className="text-white font-bold">{EXP_LABELS[onboardingData.experienceLevel]}</span></span>
                </div>
                {onboardingData.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {onboardingData.equipment.map(e => (
                      <span key={e} className="bg-raised border border-hairline text-ink-2 px-2 rounded-full text-caption font-mono">{e}</span>
                    ))}
                  </div>
                )}
                {onboardingData.favoriteExercises.length > 0 && (
                  <p className="font-mono text-caption text-ink-2">
                    <span className="text-ink-3 mr-1">Favoritos:</span>{onboardingData.favoriteExercises.join(', ')}
                  </p>
                )}
                {onboardingData.hatedExercises.length > 0 && (
                  <p className="font-mono text-caption text-ink-2">
                    <span className="text-ink-3 mr-1">Evita:</span>{onboardingData.hatedExercises.join(', ')}
                  </p>
                )}
                {onboardingData.injuries && (
                  <p className="font-mono text-caption text-amber-300">
                    <span className="material-symbols-outlined text-label align-middle mr-1">personal_injury</span>
                    {onboardingData.injuries}
                  </p>
                )}
              </div>

              {/* Datos personales adicionales */}
              {(onboardingData.occupation || onboardingData.referralSource || onboardingData.goalFreeText) && (
                <div className="space-y-1 pt-3 border-t border-hairline">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Datos personales</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.occupation && (
                      <span className="text-ink-2">Ocupación: <span className="text-white font-bold">{onboardingData.occupation}</span></span>
                    )}
                    {onboardingData.referralSource && (
                      <span className="text-ink-2">Nos conoció por: <span className="text-white font-bold">{onboardingData.referralSource}</span></span>
                    )}
                  </div>
                  {onboardingData.goalFreeText && (
                    <p className="font-sans text-caption text-ink-2 italic">"{onboardingData.goalFreeText}"</p>
                  )}
                </div>
              )}

              {/* Salud */}
              {(onboardingData.hasCurrentInjury || onboardingData.hadPastInjuries || onboardingData.takesMedication ||
                onboardingData.recentSurgery || onboardingData.smokesAlcoholSubstances || onboardingData.sunExposureWeekly) && (
                <div className="space-y-1 pt-3 border-t border-hairline">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Salud</p>
                  <div className="space-y-1">
                    {onboardingData.hasCurrentInjury && (
                      <p className="font-mono text-caption text-amber-300">
                        <span className="material-symbols-outlined text-label align-middle mr-1">personal_injury</span>
                        Lesión actual en {onboardingData.currentInjuryLocation || '—'} (intensidad {onboardingData.currentInjuryIntensity ?? '—'}/10)
                        {onboardingData.currentInjuryMovements && ` — duele al: ${onboardingData.currentInjuryMovements}`}
                      </p>
                    )}
                    {onboardingData.hadPastInjuries && (
                      <p className="font-sans text-caption text-ink-2">
                        <span className="text-ink-3 mr-1">Lesiones anteriores:</span>{onboardingData.pastInjuriesDetail || '—'}
                      </p>
                    )}
                    {onboardingData.takesMedication && (
                      <p className="font-mono text-caption text-ink-2">
                        <span className="text-ink-3 mr-1">Medicación:</span>{onboardingData.medicationDetail || '—'}
                      </p>
                    )}
                    {onboardingData.recentSurgery && (
                      <p className="font-sans text-caption text-ink-2">
                        <span className="text-ink-3 mr-1">Cirugía reciente:</span>{onboardingData.recentSurgeryDetail || '—'}
                      </p>
                    )}
                    {onboardingData.smokesAlcoholSubstances && (
                      <p className="font-sans text-caption text-ink-2">
                        <span className="text-ink-3 mr-1">Tabaco/alcohol/otras sustancias:</span>{onboardingData.smokesAlcoholSubstances}
                      </p>
                    )}
                    {onboardingData.sunExposureWeekly && (
                      <p className="font-sans text-caption text-ink-2">
                        <span className="text-ink-3 mr-1">Exposición al sol:</span>{onboardingData.sunExposureWeekly}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Nutrición — detalle adicional */}
              {(onboardingData.appetitePeakTime || onboardingData.hadOverweightHistory || !onboardingData.foodRelationshipGood ||
                onboardingData.eatsTooFast || (onboardingData.supplements?.length ?? 0) > 0 || onboardingData.weightTendency ||
                onboardingData.neckCm || onboardingData.waistCm || onboardingData.hipCm) && (
                <div className="space-y-1 pt-3 border-t border-hairline">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Nutrición — detalle</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.appetitePeakTime && (
                      <span className="text-ink-2">Más apetito: <span className="text-white font-bold">{onboardingData.appetitePeakTime}</span></span>
                    )}
                    {onboardingData.hadOverweightHistory && (
                      <span className="text-amber-300">Historial de sobrepeso</span>
                    )}
                    {!onboardingData.foodRelationshipGood && (
                      <span className="text-amber-300">Relación con la comida: mala{onboardingData.foodRelationshipReason ? ` (${onboardingData.foodRelationshipReason})` : ''}</span>
                    )}
                    {onboardingData.eatsTooFast && <span className="text-ink-2">Come deprisa</span>}
                    {onboardingData.neckCm && <span className="text-ink-2">Cuello: <span className="text-white font-bold">{onboardingData.neckCm}cm</span></span>}
                    {onboardingData.waistCm && <span className="text-ink-2">Cintura: <span className="text-white font-bold">{onboardingData.waistCm}cm</span></span>}
                    {onboardingData.hipCm && <span className="text-ink-2">Cadera: <span className="text-white font-bold">{onboardingData.hipCm}cm</span></span>}
                  </div>
                  {onboardingData.weightTendency && (
                    <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">Tendencia de peso:</span>{onboardingData.weightTendency}</p>
                  )}
                  {(onboardingData.supplements?.length ?? 0) > 0 && (
                    <div className="pt-1">
                      <p className="font-mono text-caption text-ink-3 mb-1">Suplementación</p>
                      {onboardingData.supplements!.map((s, i) => (
                        <p key={i} className="font-mono text-caption text-ink-2">{s.name} — {s.dose} — {s.frequency}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Entrenamiento — detalle adicional */}
              {(onboardingData.oneRepMaxTotal || onboardingData.progressFrequency || onboardingData.techniqueLevel ||
                onboardingData.currentMotivation || onboardingData.muscleGroupsToImprove || onboardingData.restDayActive ||
                onboardingData.sittingHoursPerDay || onboardingData.stressReason) && (
                <div className="space-y-1 pt-3 border-t border-hairline">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Entrenamiento — detalle</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.oneRepMaxTotal && (
                      <span className="text-ink-2">Total 1RM: <span className="text-white font-bold">{onboardingData.oneRepMaxTotal}kg</span></span>
                    )}
                    {onboardingData.progressFrequency && (
                      <span className="text-ink-2">Progresa: <span className="text-white font-bold">{PROGRESS_FREQ_LABELS[onboardingData.progressFrequency]}</span></span>
                    )}
                    {onboardingData.techniqueLevel && (
                      <span className="text-ink-2">Técnica: <span className="text-white font-bold">{TECHNIQUE_LABELS[onboardingData.techniqueLevel]}</span></span>
                    )}
                    {onboardingData.currentMotivation && (
                      <span className="text-ink-2">Motivación: <span className="text-white font-bold">{onboardingData.currentMotivation}/10</span></span>
                    )}
                    {onboardingData.sittingHoursPerDay && (
                      <span className="text-ink-2">Horas sentado/día: <span className="text-white font-bold">{onboardingData.sittingHoursPerDay}h</span></span>
                    )}
                    {onboardingData.restDayActive && <span className="text-ink-2">Activo en descanso{onboardingData.restDayActiveDetail ? ` (${onboardingData.restDayActiveDetail})` : ''}</span>}
                  </div>
                  {onboardingData.muscleGroupsToImprove && (
                    <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">A mejorar:</span>{onboardingData.muscleGroupsToImprove}</p>
                  )}
                  {onboardingData.stressReason && (
                    <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">Motivo de estrés:</span>{onboardingData.stressReason}</p>
                  )}
                </div>
              )}

              {/* Descanso — detalle adicional */}
              {((onboardingData.sleepDeficitCauses?.length ?? 0) > 0 || onboardingData.sleepRoutineOrScreen || onboardingData.sleepMedication) && (
                <div className="space-y-1 pt-3 border-t border-hairline">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">Descanso — detalle</p>
                  {(onboardingData.sleepDeficitCauses?.length ?? 0) > 0 && (
                    <p className="font-sans text-caption text-ink-2"><span className="text-ink-3 mr-1">Causas del déficit:</span>{onboardingData.sleepDeficitCauses!.join(', ')}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-label font-mono">
                    {onboardingData.sleepRoutineOrScreen && (
                      <span className="text-ink-2">Antes de dormir: <span className="text-white font-bold">{onboardingData.sleepRoutineOrScreen === 'rutina' ? 'Rutina' : 'Pantalla'}</span></span>
                    )}
                    {onboardingData.sleepMedication && (
                      <span className="text-amber-300">Medicación para dormir{onboardingData.sleepMedicationDetail ? `: ${onboardingData.sleepMedicationDetail}` : ''}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Extra answers from template */}
              {onboardingTemplate.length > 0 && onboardingData.extraAnswers && Object.keys(onboardingData.extraAnswers).length > 0 && (
                <div className="space-y-3 pt-3 border-t border-hairline">
                  {(['entrenamiento', 'nutricion', 'descanso'] as const).map(section => {
                    const sqs = onboardingTemplate.filter(q => q.section === section);
                    const answered = sqs.filter(q => {
                      const v = onboardingData.extraAnswers?.[q.id];
                      return v !== undefined && v !== '' && v !== 0;
                    });
                    if (answered.length === 0) return null;
                    return (
                      <div key={section} className="space-y-1">
                        <p className="font-mono text-caption text-ink-2 uppercase tracking-wide">{SECTION_LABELS[section]}</p>
                        {answered.map(q => {
                          const val = onboardingData.extraAnswers![q.id];
                          const display = q.type === 'scale'
                            ? `${val} / ${q.scaleMax ?? 10}`
                            : `${val}${q.unit ? ` ${q.unit}` : ''}`;
                          return (
                            <p key={q.id} className="font-sans text-caption text-ink-2">
                              <span className="text-ink-3 mr-1">{q.label}:</span>
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
                <p className="font-sans font-bold text-body-s text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-ink-3 text-title-s">person_check</span>
                  Ficha de iniciación
                </p>
                <p className="font-sans text-label text-ink-2 mt-1">El atleta no ha completado su ficha todavía.</p>
              </div>
              <button
                onClick={() => setEditingOnboarding(true)}
                className="shrink-0 flex items-center gap-2 px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-body-s">add</span>Crear ficha
              </button>
            </div>
          )}
        </div>

        {/* ── Preferencias alimentarias ────────────────────────────────── */}
        {onboardingData && (
          <div className="bg-surface border border-hairline rounded-surface p-5">
            <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-accent text-title-s">restaurant</span>
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
          <div className="bg-surface border border-hairline rounded-surface p-5 space-y-3">
            {[
              { label: 'Correo',     value: athlete.email,                                        color: 'text-white'     },
              { label: 'Racha',      value: `${athlete.currentStreak || 0} Semanas`,              color: 'text-orange-400'},
              { label: 'Nivel',      value: `Nivel ${athlete.level || 1}`,                        color: 'text-data' },
              { label: 'XP',         value: `${athlete.xp || 0} / 400`,                          color: 'text-slate-300' },
              { label: 'Peso actual',value: `${athlete.actualWeight || athlete.initialWeight} kg`,color: 'text-accent' },
              { label: 'Meta',       value: `${athlete.targetWeight} kg`,                         color: 'text-success' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-baseline text-label font-sans">
                <span className="text-ink-2 uppercase">{row.label}:</span>
                <span className={`font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
            <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-data text-body-s">assignment_turned_in</span>
              Cumplimiento Semanal
            </h3>
            {weekTotal === 0 ? (
              <p className="font-sans text-caption text-ink-2">Sin entrenamientos esta semana</p>
            ) : (
              <div className="flex items-center gap-4">
                <ProgressRing pct={weekPct} color="var(--color-data)" />
                <div className="flex-1 font-mono text-caption">
                  <span className="text-ink-2 uppercase block mb-1">Entrenamientos</span>
                  <span className="text-white text-body-s font-bold">{weekCompleted} / {weekTotal}</span>
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
              <div className="bg-surface border border-dashed border-hairline rounded-surface p-12 text-center text-ink-2">
                <span className="material-symbols-outlined text-display text-ink-3 block mb-2">history_edu</span>
                <p className="text-body-s font-bold text-white">Sin revisiones todavía</p>
                <p className="text-label mt-1">Los check-ins y respuestas del atleta aparecerán aquí.</p>
              </div>
            );
          }

          return (
            <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
              <div className="p-4 border-b border-hairline bg-raised flex items-center gap-2">
                <span className="material-symbols-outlined text-accent text-body-s">history_edu</span>
                <h3 className="font-sans font-bold text-title-s text-white uppercase tracking-wide">Historial unificado</h3>
                <span className="font-mono text-caption text-ink-2 ml-1">({items.length} entradas)</span>
              </div>
              <div className="divide-y divide-hairline/40">
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
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-raised ${isExpanded ? 'bg-raised' : ''}`}
                        >
                          <span
                            className="material-symbols-outlined flex-shrink-0 text-title-m"
                            style={{ color: c.approved ? 'var(--color-accent)' : 'var(--color-warning)', fontVariationSettings: "'FILL' 1" }}
                          >rate_review</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-sans font-bold text-white text-label">Check-in</span>
                              <span className="font-mono text-caption text-ink-2">{c.dateStr}</span>
                              <span className={`text-caption font-sans font-bold uppercase px-2 rounded-surface flex-shrink-0 ${
                                c.approved ? 'bg-emerald-500/10 text-emerald-300' : 'bg-orange-500/10 text-orange-300'
                              }`}>
                                {c.approved ? 'Revisado' : 'Pendiente'}
                              </span>
                            </div>
                            <p className="font-mono text-caption text-ink-2 ">
                              {c.weight} kg · {c.adherence} · {c.mood}
                            </p>
                          </div>
                          <span className="material-symbols-outlined text-ink-2 text-body-s transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                        </div>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 bg-bg space-y-3 border-t border-hairline">
                            {/* R7 action bar */}
                            {editingReviewKey !== key && (
                              <div className="flex items-center gap-2 pb-1">
                                <button
                                  onClick={() => handleStartEditCheckin(c, key)}
                                  className="flex items-center gap-1 font-mono text-caption uppercase px-3 py-2 bg-raised border border-hairline text-data hover:border-data/40 rounded-control transition-all"
                                >
                                  <span className="material-symbols-outlined text-label">edit</span>Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteCheckin(c.id, key)}
                                  disabled={deletingReviewKey === key}
                                  className="flex items-center gap-1 font-mono text-caption uppercase px-3 py-2 bg-raised border border-hairline text-red-400 hover:border-red-500/40 rounded-control transition-all disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-label">{deletingReviewKey === key ? 'progress_activity' : 'delete'}</span>Eliminar
                                </button>
                              </div>
                            )}
                            {/* Inline edit form */}
                            {editingReviewKey === key && checkinEditForm ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Peso (kg)</label>
                                    <input type="number" step="0.1" value={checkinEditForm.weight}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, weight: parseFloat(e.target.value) || 0 }))}
                                      className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-body-s text-white focus:outline-none focus:border-data/50 font-mono" />
                                  </div>
                                  <div>
                                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Fecha</label>
                                    <input type="text" value={checkinEditForm.dateStr}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, dateStr: e.target.value }))}
                                      className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-body-s text-white focus:outline-none focus:border-data/50 font-mono" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Adherencia</label>
                                    <select value={checkinEditForm.adherence}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, adherence: e.target.value as WeightCheckIn['adherence'] }))}
                                      className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-body-s text-white focus:outline-none focus:border-data/50 font-mono">
                                      {['Sí', 'Parcial', 'No'].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Humor</label>
                                    <select value={checkinEditForm.mood}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, mood: e.target.value }))}
                                      className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-body-s text-white focus:outline-none focus:border-data/50 font-mono">
                                      {['😩', '😴', '😐', '😊', '🔥'].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Notas</label>
                                  <textarea value={checkinEditForm.notes}
                                    onChange={e => setCheckinEditForm(f => f && ({ ...f, notes: e.target.value }))}
                                    className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-body-s text-white focus:outline-none focus:border-data/50 font-sans resize-none min-h-[60px]" />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveCheckinEdit(c.id)} disabled={savingEdit}
                                    className="flex items-center gap-1 px-3 py-2 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 disabled:opacity-50 transition-all">
                                    <span className="material-symbols-outlined text-label">save</span>{savingEdit ? 'Guardando…' : 'Guardar'}
                                  </button>
                                  <button onClick={() => { setEditingReviewKey(null); setCheckinEditForm(null); }}
                                    className="px-3 py-2 font-mono text-caption uppercase text-ink-2 border border-hairline rounded-control hover:border-ink-2/40 transition-all">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                            <>
                            <div className="grid grid-cols-3 gap-3 font-mono text-label">
                              {[
                                { label: 'Peso', value: `${c.weight} kg`, color: 'text-white' },
                                { label: 'Adherencia', value: c.adherence, color: 'text-accent' },
                                { label: 'Humor', value: c.mood || '😊', color: 'text-white' },
                              ].map(cell => (
                                <div key={cell.label} className="bg-raised p-3 rounded-surface border border-hairline">
                                  <span className="block text-ink-2 text-caption uppercase">{cell.label}</span>
                                  <strong className={`${cell.color}`}>{cell.value}</strong>
                                </div>
                              ))}
                            </div>
                            {c.notes && (
                              <div className="bg-surface p-3 rounded-surface border border-hairline">
                                <span className="block font-mono text-caption text-ink-2 uppercase mb-1">Notas del atleta</span>
                                <p className="text-label text-slate-300 font-sans italic">"{c.notes}"</p>
                              </div>
                            )}
                            {unifiedFeedbackSuccess && expandedReviewId === key && (
                              <div className="bg-accent/15 border border-accent/30 text-white p-3 rounded-surface text-label flex items-center gap-2">
                                <span className="material-symbols-outlined text-accent text-body-s">check_circle</span>
                                {unifiedFeedbackSuccess}
                              </div>
                            )}
                            {unifiedFeedbackError && expandedReviewId === key && (
                              <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-surface text-label font-sans">{unifiedFeedbackError}</div>
                            )}
                            <form onSubmit={(e) => handleUnifiedSendFeedback(c.id, e)} className="space-y-2">
                              <textarea
                                value={expandedReviewId === key ? unifiedFeedbackText : (c.coachFeedback || '')}
                                onChange={e => setUnifiedFeedbackText(e.target.value)}
                                placeholder="Ajustes nutricionales, indicaciones de cargas, observaciones motivacionales..."
                                className="w-full bg-raised border border-hairline rounded-control p-3 text-body-s text-white focus:ring-1 focus:ring-accent focus:outline-none min-h-[80px] resize-none font-sans"
                              />
                              <button
                                type="submit"
                                disabled={unifiedSubmitting}
                                className="h-[36px] px-5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control flex items-center gap-2 hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
                              >
                                {unifiedSubmitting ? 'Guardando...' : 'Enviar y Aprobar'}
                                <span className="material-symbols-outlined text-body-s">send</span>
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
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-raised ${isExpanded ? 'bg-raised' : ''}`}
                      >
                        <span
                          className="material-symbols-outlined flex-shrink-0 text-title-m"
                          style={{ color: 'var(--color-data)', fontVariationSettings: "'FILL' 1" }}
                        >quiz</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-sans font-bold text-white text-label">{q?.title ?? 'Cuestionario'}</span>
                            <span className="font-mono text-caption text-ink-2">{submittedDate}</span>
                          </div>
                          {previewAnswers && (
                            <p className="font-mono text-caption text-ink-2 truncate">{previewAnswers}</p>
                          )}
                        </div>
                        <span className="material-symbols-outlined text-ink-2 text-body-s transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 bg-bg border-t border-hairline space-y-2">
                          {/* R7 action bar */}
                          {editingReviewKey !== key && (
                            <div className="flex items-center gap-2 pb-1">
                              <button
                                onClick={() => handleStartEditResponse(r, key)}
                                className="flex items-center gap-1 font-mono text-caption uppercase px-3 py-2 bg-raised border border-hairline text-data hover:border-data/40 rounded-control transition-all"
                              >
                                <span className="material-symbols-outlined text-label">edit</span>Editar
                              </button>
                              <button
                                onClick={() => handleDeleteResponse(r.id, key)}
                                disabled={deletingReviewKey === key}
                                className="flex items-center gap-1 font-mono text-caption uppercase px-3 py-2 bg-raised border border-hairline text-red-400 hover:border-red-500/40 rounded-control transition-all disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-label">{deletingReviewKey === key ? 'progress_activity' : 'delete'}</span>Eliminar
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
                                    <span className="font-sans text-caption text-ink-2 flex-1">{question?.label ?? ans.questionId}</span>
                                    {isChoice && question?.options ? (
                                      <select value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                                        className="bg-raised border border-hairline rounded-control px-2 py-1 text-label text-white focus:outline-none focus:border-data/50 font-mono w-32">
                                        {question.options.map(o => <option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : isBool ? (
                                      <select value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value === 'true' } : a))}
                                        className="bg-raised border border-hairline rounded-control px-2 py-1 text-label text-white focus:outline-none focus:border-data/50 font-sans w-24">
                                        <option value="true">{question?.labelTrue ?? 'Sí'}</option>
                                        <option value="false">{question?.labelFalse ?? 'No'}</option>
                                      </select>
                                    ) : isNum ? (
                                      <input type="number" value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: parseFloat(e.target.value) || 0 } : a))}
                                        className="bg-raised border border-hairline rounded-control px-2 py-1 text-label text-white focus:outline-none focus:border-data/50 font-mono w-24 text-right" />
                                    ) : (
                                      <input type="text" value={String(ans.value)}
                                        onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                                        className="bg-raised border border-hairline rounded-control px-2 py-1 text-label text-white focus:outline-none focus:border-data/50 font-mono flex-1 min-w-0" />
                                    )}
                                  </div>
                                );
                              })}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => handleSaveResponseEdit(r.id)} disabled={savingEdit}
                                  className="flex items-center gap-1 px-3 py-2 bg-accent text-black font-sans text-caption font-bold uppercase rounded-control hover:bg-accent-press active:scale-95 disabled:opacity-50 transition-all">
                                  <span className="material-symbols-outlined text-label">save</span>{savingEdit ? 'Guardando…' : 'Guardar'}
                                </button>
                                <button onClick={() => { setEditingReviewKey(null); setResponseEditAnswers([]); }}
                                  className="px-3 py-2 font-mono text-caption uppercase text-ink-2 border border-hairline rounded-control hover:border-ink-2/40 transition-all">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            r.answers.map(ans => {
                              const question = q?.questions.find(qq => qq.id === ans.questionId);
                              return (
                                <div key={ans.questionId} className="flex items-start gap-3">
                                  <span className="font-sans text-caption text-ink-2 flex-1 ">{question?.label ?? ans.questionId}</span>
                                  <span className="font-mono text-label text-white font-bold text-right">
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
            <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-body-s">quiz</span>
                  Asignar cuestionario
                </h3>
                <button
                  onClick={() => { setNewQForm(blankQForm()); setShowNewQEditor(true); }}
                  className="flex items-center gap-2 px-3 py-2 bg-raised border border-accent/40 text-accent font-mono text-caption uppercase rounded-control hover:border-accent/70 transition-all flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-body-s">add</span>Crear cuestionario nuevo
                </button>
              </div>

              {/* Inline new-questionnaire editor modal — bottom-sheet on mobile, centered dialog on desktop */}
              {showNewQEditor && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4">
                  <div className="relative w-full sm:max-w-2xl bg-bg border border-hairline rounded-t-surface sm:rounded-surface p-6 shadow-2xl max-h-[92vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
                    <button
                      onClick={() => setShowNewQEditor(false)}
                      className="absolute top-4 right-4 p-2 text-ink-2 hover:text-white transition-colors"
                      aria-label="Cerrar"
                    >
                      <span className="material-symbols-outlined text-title-m">close</span>
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
                  <p className="text-caption font-sans text-ink-2">
                    Todavía no hay cuestionarios. Usa el botón de arriba para crear uno.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={assignQId}
                    onChange={e => setAssignQId(e.target.value)}
                    className="w-full bg-bg border border-hairline rounded-control px-3 py-3 text-body-s text-white font-sans focus:outline-none focus:ring-1 focus:ring-accent"
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
                    className="px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40 shadow-sm"
                  >
                    {assigningQ ? '…' : 'Asignar'}
                  </button>
                </div>
              )}

              {/* Active assignments list */}
              {athleteQAssignments.filter(a => a.active).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-hairline">
                  <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">Asignados activos</p>
                  {athleteQAssignments.filter(a => a.active).map(a => {
                    const tmpl = coachQuestionnaires.find(q => q.id === a.questionnaireId);
                    const schedLabel = scheduleLabel(a.schedule);
                    return (
                      <div key={a.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
                        <span className="material-symbols-outlined text-accent text-body-s">quiz</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-sans font-bold text-white text-label truncate">{tmpl?.title ?? a.questionnaireId}</p>
                          <p className="font-mono text-caption text-ink-2">{schedLabel} · desde {a.startDate}</p>
                        </div>
                        <button onClick={() => handleDeactivateQ(a.id)} className="text-ink-2 hover:text-red-400 transition-colors" title="Desactivar">
                          <span className="material-symbols-outlined text-body-s">close</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Peso corporal (coach view) ────────────────────────────── */}
            <div className="bg-surface border border-hairline rounded-surface p-5">
              <BodyweightPanel athleteEmail={athlete.email} readOnly />
            </div>

            {/* ── Gráficas de evolución ──────────────────────────────────── */}
            {athleteQResponses.length > 0 && coachQuestionnaires.length > 0 && (
              <div className="bg-surface border border-hairline rounded-surface p-5">
                <QuestionnaireChartsPanel
                  questionnaires={coachQuestionnaires}
                  responses={athleteQResponses}
                />
              </div>
            )}

            {/* ── Respuestas del atleta ──────────────────────────────────── */}
            {athleteQResponses.length > 0 && (
              <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
                <h3 className="font-sans font-bold text-title-s text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-data text-body-s">assignment_turned_in</span>
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
                        <details key={r.id} className="bg-raised border border-hairline rounded-surface overflow-hidden">
                          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-raised">
                            <span className="material-symbols-outlined text-ink-2 text-body-s">expand_more</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-sans font-bold text-white text-label">{tmpl?.title ?? r.questionnaireId}</p>
                              <p className="font-mono text-caption text-ink-2">
                                {date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' · '}{r.answers.length} respuestas
                              </p>
                            </div>
                          </summary>
                          <div className="px-4 pb-3 pt-1 space-y-2 border-t border-hairline">
                            {r.answers.map(ans => {
                              const q = tmpl?.questions.find(q => q.id === ans.questionId);
                              return (
                                <div key={ans.questionId} className="flex items-start gap-3">
                                  <span className="font-sans text-caption text-ink-2 flex-1 ">{q?.label ?? ans.questionId}</span>
                                  <span className="font-mono text-label text-white font-bold text-right">
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
  );
}
