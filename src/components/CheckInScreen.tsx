import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, Questionnaire, QuestionnaireQuestion, BodyweightLog, PhotoAssignment, ProgressPhoto, PhotoView } from '../types';
import { createNotificationDeduped, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, submitResponse, addBodyweight, getBodyweightForAthlete, updateBodyweight, getPhotoAssignmentsForAthlete, getProgressPhotos } from '../dbService';
import { todayStr, isDueToday, hasAnsweredThisOccurrence, isUpcoming } from '../utils/questionnaireSchedule';
import { hasUploadedThisOccurrence } from '../utils/photoSchedule';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import PhotosScreen from './PhotosScreen';
import { EmptyState } from './ui';

const PHOTO_VIEW_LABELS: Record<PhotoView, string> = { front: 'Frente', side: 'Lateral', back: 'Espalda' };

const COACH_EMAIL = 'danitrviner@gmail.com';

// ── Inline questionnaire form ─────────────────────────────────────────────────

function QuestionnaireForm({
  questionnaire,
  assignment,
  athleteEmail,
  onSubmitted,
  onCancel,
}: {
  questionnaire: Questionnaire;
  assignment: QuestionnaireAssignment;
  athleteEmail: string;
  onSubmitted: (r: QuestionnaireResponse) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setAnswer = (qId: string, value: string | number | boolean) =>
    setAnswers(prev => ({ ...prev, [qId]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = questionnaire.questions.filter(q => q.required && answers[q.id] === undefined);
    if (missing.length > 0) {
      setErr(`Por favor responde: ${missing.map(q => q.label).join(', ')}`);
      return;
    }
    setErr('');
    setSaving(true);
    try {
      const payload = questionnaire.questions
        .filter(q => answers[q.id] !== undefined)
        .map(q => ({ questionId: q.id, value: answers[q.id] }));
      const response = await submitResponse({
        questionnaireId: questionnaire.id,
        assignmentId: assignment.id,
        athleteId: athleteEmail,
        submittedAt: new Date().toISOString(),
        answers: payload,
      });
      onSubmitted(response);
    } catch (e) {
      console.error(e);
      setErr('Error al enviar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5 pb-2 border-b border-hairline">
        <h2 className="font-sans font-bold text-title-m text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-data">assignment</span>
          {questionnaire.title}
        </h2>
        <button onClick={onCancel} className="text-ink-2 hover:text-white transition-colors p-1">
          <span className="material-symbols-outlined text-title-s">close</span>
        </button>
      </div>

      {questionnaire.description && (
        <p className="text-label text-ink-2 mb-4 font-sans">{questionnaire.description}</p>
      )}

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-surface text-label mb-4">{err}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {questionnaire.questions.map((q: QuestionnaireQuestion) => (
          <div key={q.id}>
            <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider mb-2">
              {q.label}{q.required && ' *'}{q.unit && ` (${q.unit})`}
            </label>
            {q.helpText && <p className="text-caption text-ink-2/70 mb-2">{q.helpText}</p>}

            {q.type === 'text' && (
              <textarea
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                maxLength={q.maxChars}
                placeholder="Escribe aquí..."
                className="w-full bg-raised border-0 border-b border-hairline text-ink text-label p-3 focus:ring-0 focus:border-accent transition-colors min-h-[60px]"
              />
            )}

            {q.type === 'numeric' && (
              <input
                type="number"
                step={q.decimals ? Math.pow(10, -q.decimals) : 1}
                min={q.min}
                max={q.max}
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, parseFloat(e.target.value))}
                className="w-full bg-raised border-0 border-b border-hairline text-white font-mono p-3 focus:ring-0 focus:border-accent transition-colors"
              />
            )}

            {q.type === 'scale' && (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: (q.scaleMax ?? 10) - (q.scaleMin ?? 1) + 1 }, (_, i) => (q.scaleMin ?? 1) + i).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnswer(q.id, v)}
                      className={`w-9 h-9 rounded-control font-mono text-label font-bold transition-all ${
                        answers[q.id] === v
                          ? 'bg-accent text-black'
                          : 'bg-raised text-ink-2 border border-hairline hover:border-accent/50'
                      }`}
                    >{v}</button>
                  ))}
                </div>
                {(q.scaleMinLabel || q.scaleMaxLabel) && (
                  <div className="flex justify-between text-caption font-mono text-ink-2">
                    <span>{q.scaleMin ?? 1} – {q.scaleMinLabel}</span>
                    <span>{q.scaleMaxLabel} – {q.scaleMax ?? 10}</span>
                  </div>
                )}
              </div>
            )}

            {q.type === 'boolean' && (
              <div className="flex gap-2">
                {([true, false] as const).map(v => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setAnswer(q.id, v)}
                    className={`flex-1 py-3 font-sans text-label rounded-control border transition-all min-h-[44px] ${
                      answers[q.id] === v
                        ? 'bg-accent text-black font-bold border-transparent'
                        : 'bg-raised text-ink border-hairline'
                    }`}
                  >{v ? (q.labelTrue ?? 'Sí') : (q.labelFalse ?? 'No')}</button>
                ))}
              </div>
            )}

            {q.type === 'choice' && q.options && (
              <div className="flex flex-col gap-2">
                {q.options.map(opt => {
                  const curSelected: string[] = q.multiSelect
                    ? ((answers[q.id] as string | undefined) ?? '').split(',').filter(Boolean)
                    : [];
                  const isSelected = q.multiSelect ? curSelected.includes(opt) : answers[q.id] === opt;
                  return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      if (q.multiSelect) {
                        const next = isSelected ? curSelected.filter(o => o !== opt) : [...curSelected, opt];
                        setAnswer(q.id, next.join(','));
                      } else {
                        setAnswer(q.id, opt);
                      }
                    }}
                    className={`w-full py-3 px-3 text-label font-mono rounded-control border text-left transition-all min-h-[44px] ${
                      isSelected
                        ? 'bg-accent text-black border-transparent font-bold'
                        : 'bg-raised text-ink border-hairline'
                    }`}
                  >{opt}</button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-[44px] bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {saving ? 'Enviando...' : 'Enviar Respuesta'}
          <span className="material-symbols-outlined text-body-s">send</span>
        </button>
      </form>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface CheckInScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
}

// Modo de registro de peso: día a día, o una media semanal que el atleta ya
// calcula por su cuenta y solo vuelca como un valor. Se recuerda por atleta
// (preferencia de UI, no dato crítico — de ahí que viva solo en localStorage).
type BwMode = 'daily' | 'weekly_avg';
const bwModeKey = (email: string) => `enforma_bw_mode_${email}`;

export default function CheckInScreen({ profile, checkins }: CheckInScreenProps) {
  const queryClient = useQueryClient();

  // ── Quick bodyweight widget ────────────────────────────────────────────────
  // Shared cache key with BodyweightPanel (ProfileScreen) — writes here show up
  // there and vice versa without either side knowing about the other.
  const bwKey = bodyweightForAthleteKey(profile.email);
  const { data: bwLogs = [], isPending: loadingBw } = useQuery({
    queryKey: bwKey,
    queryFn: () => getBodyweightForAthlete(profile.email),
  });
  const bwToday = useMemo(() => bwLogs.find(l => l.date === todayStr()) ?? null, [bwLogs]);
  const [bwInput, setBwInput]   = useState('');
  const [bwEditing, setBwEditing] = useState(false);
  const [bwSaving, setBwSaving] = useState(false);
  const [bwError, setBwError]   = useState('');
  const [bwMode, setBwMode] = useState<BwMode>(
    () => (localStorage.getItem(bwModeKey(profile.email)) as BwMode | null) ?? 'daily'
  );
  const bwInputRef = useRef<HTMLInputElement>(null);

  // Igual que el .then() original: abre el editor / adopta el kind de hoy una
  // sola vez por atleta cuando el registro de peso ya cargó, no en cada
  // refetch de fondo — mismo patrón de guard con ref que StepsWidget.
  const bwInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadingBw || bwInitFor.current === profile.email) return;
    bwInitFor.current = profile.email;
    if (!bwToday) setBwEditing(true); // start in input mode if nothing logged yet
    else if (bwToday.kind) setBwMode(bwToday.kind); // refleja cómo se registró hoy
  }, [loadingBw, profile.email, bwToday]);

  useEffect(() => {
    if (bwEditing) bwInputRef.current?.focus();
  }, [bwEditing]);

  const changeBwMode = (mode: BwMode) => {
    setBwMode(mode);
    localStorage.setItem(bwModeKey(profile.email), mode);
  };

  const handleSaveBw = async () => {
    const val = parseFloat(bwInput);
    if (!bwInput || isNaN(val) || val < 20 || val > 300) {
      setBwError('Introduce un peso válido (20–300 kg).');
      return;
    }
    setBwError('');
    setBwSaving(true);
    try {
      const today = todayStr();
      if (bwToday) {
        await updateBodyweight(bwToday.id, { weight: val, kind: bwMode });
        const bwTodayId = bwToday.id;
        queryClient.setQueryData<BodyweightLog[]>(bwKey, prev =>
          prev?.map(b => b.id === bwTodayId ? { ...b, weight: val, kind: bwMode } : b));
      } else {
        const entry = await addBodyweight({
          athleteId: profile.email,
          date: today,
          weight: val,
          kind: bwMode,
          createdAt: new Date().toISOString(),
        });
        queryClient.setQueryData<BodyweightLog[]>(bwKey, prev => [...(prev ?? []), entry]);
      }
      setBwInput('');
      setBwEditing(false);
    } catch (err) {
      console.error(err);
      setBwError('Error al guardar. Inténtalo de nuevo.');
    } finally {
      setBwSaving(false);
    }
  };

  // Questionnaire state
  const responsesKey = ['responsesForAthlete', profile.email] as const;
  const { data: rawAssignments = [], isPending: loadingAssignments } = useQuery({
    queryKey: ['assignmentsForAthlete', profile.email],
    queryFn: () => getAssignmentsForAthlete(profile.email),
  });
  const { data: responses = [], isPending: loadingResponses } = useQuery({
    queryKey: responsesKey,
    queryFn: () => getResponsesForAthlete(profile.email),
  });
  const assignments = useMemo(() => rawAssignments.filter(a => a.active), [rawAssignments]);
  const activeQuestionnaireIds = useMemo(
    () => [...new Set(assignments.map(a => a.questionnaireId))],
    [assignments]
  );
  // One cache entry per questionnaire id, same key PendingTasksPanel/ProfileScreen
  // use for the same lookup — reuses/gets reused by them instead of refetching.
  const questionnaireQueries = useQueries({
    queries: activeQuestionnaireIds.map(id => ({
      queryKey: ['questionnaireById', id],
      queryFn: (): Promise<Questionnaire | null> => getQuestionnaireById(id),
    })),
  });
  const templates = useMemo(() => {
    const tMap = new Map<string, Questionnaire>();
    for (const q of questionnaireQueries) {
      const t = q.data as Questionnaire | null | undefined;
      if (t) tMap.set(t.id, t);
    }
    return tMap;
  }, [questionnaireQueries]);
  const loadingQ = loadingAssignments || loadingResponses
    || (activeQuestionnaireIds.length > 0 && questionnaireQueries.some(q => q.isPending));

  const [activeAssignment, setActiveAssignment] = useState<QuestionnaireAssignment | null>(null);

  const pendingAssignments = assignments.filter(
    a => isDueToday(a) && !hasAnsweredThisOccurrence(a, responses)
  );
  const upcomingAssignments = assignments.filter(a => isUpcoming(a));

  // Photo check-in state
  const { data: rawPhotoAssignments = [], isPending: loadingPhotoAssignmentsQ } = useQuery({
    queryKey: ['photoAssignmentsForAthlete', profile.email],
    queryFn: () => getPhotoAssignmentsForAthlete(profile.email),
  });
  // Same cache key PhotosScreen (rendered below) uses for the same athlete's photos.
  const { data: progressPhotos = [], isPending: loadingProgressPhotos } = useQuery({
    queryKey: ['progressPhotos', profile.email],
    queryFn: () => getProgressPhotos(profile.email),
  });
  const photoAssignments = useMemo(() => rawPhotoAssignments.filter(a => a.active), [rawPhotoAssignments]);
  const loadingPhotoAssignments = loadingPhotoAssignmentsQ || loadingProgressPhotos;

  const pendingPhotoAssignments = photoAssignments.filter(
    a => isDueToday(a) && !hasUploadedThisOccurrence(a, progressPhotos)
  );
  const upcomingPhotoAssignments = photoAssignments.filter(a => isUpcoming(a));

  const handleQuestionnaireSubmitted = (r: QuestionnaireResponse) => {
    queryClient.setQueryData<QuestionnaireResponse[]>(responsesKey, prev => [...(prev ?? []), r]);
    setActiveAssignment(null);
    createNotificationDeduped(`notif_qr_${r.id}`, {
      recipientEmail: COACH_EMAIL,
      type: 'questionnaire_submitted',
      title: `Cuestionario de ${profile.displayName}`,
      body: `${templates.get(r.questionnaireId)?.title ?? 'Respuesta'} enviada`,
      link: 'clients',
      createdAt: new Date().toISOString(),
      read: false,
    }).catch(console.error);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans font-extrabold text-display tracking-tight text-white">Check-in Semanal</h1>
        <p className="text-ink-2 text-body-s mt-1">Registra tu peso y responde los cuestionarios del entrenador.</p>
      </div>

      {/* ── Quick bodyweight widget ─────────────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface px-4 py-3 space-y-3">
        {/* Modo: día a día vs. media semanal ya calculada por el atleta */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeBwMode('daily')}
            className={`px-3 py-1 rounded-control font-sans text-caption uppercase tracking-wide border transition-all ${
              bwMode === 'daily' ? 'bg-data/15 border-data/40 text-data' : 'border-hairline text-ink-2'
            }`}
          >
            Me peso cada día
          </button>
          <button
            type="button"
            onClick={() => changeBwMode('weekly_avg')}
            className={`px-3 py-1 rounded-control font-sans text-caption uppercase tracking-wide border transition-all ${
              bwMode === 'weekly_avg' ? 'bg-data/15 border-data/40 text-data' : 'border-hairline text-ink-2'
            }`}
          >
            Llevo yo la media semanal
          </button>
        </div>

        <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-surface bg-data/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-data text-title-s" style={{ fontVariationSettings: "'FILL' 1" }}>scale</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            {bwMode === 'weekly_avg' ? 'Media semanal' : 'Peso de hoy'}
          </p>
          {!bwEditing && bwToday ? (
            <p className="font-mono text-title-m font-bold text-white leading-tight">
              {bwToday.weight} <span className="text-label text-ink-2 font-normal">kg</span>
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <input
                ref={bwInputRef}
                type="number"
                step="0.1"
                min="20"
                max="300"
                value={bwInput}
                onChange={e => { setBwInput(e.target.value); setBwError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveBw(); }}
                placeholder={bwToday ? String(bwToday.weight) : '0.0'}
                className="w-24 bg-raised border border-hairline rounded-control px-3 py-2 text-white font-mono text-body-s focus:outline-none focus:ring-1 focus:ring-data placeholder-ink-3"
              />
              <span className="font-mono text-label text-ink-3">kg</span>
            </div>
          )}
          {bwError && <p className="font-sans text-caption text-red-400 mt-1">{bwError}</p>}
        </div>

        {!bwEditing && bwToday ? (
          <button
            onClick={() => { setBwInput(String(bwToday.weight)); setBwEditing(true); }}
            className="flex-shrink-0 w-9 h-9 rounded-control border border-hairline flex items-center justify-center text-ink-2 hover:text-white hover:border-hairline transition-all"
            title="Editar"
          >
            <span className="material-symbols-outlined text-body-s">edit</span>
          </button>
        ) : (
          <button
            onClick={handleSaveBw}
            disabled={bwSaving}
            className="flex-shrink-0 w-9 h-9 rounded-control bg-data flex items-center justify-center text-black transition-all hover:bg-data active:scale-95 disabled:opacity-50"
            title="Guardar peso"
          >
            {bwSaving
              ? <span className="material-symbols-outlined text-body-s animate-spin">refresh</span>
              : <span className="material-symbols-outlined text-body-s" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
            }
          </button>
        )}
        </div>

        {bwMode === 'weekly_avg' && (
          <p className="font-sans text-caption text-ink-2/70 -mt-1">
            Pon un único valor con la media que ya llevas calculada de la semana — no hace falta que te peses aquí a diario.
          </p>
        )}
      </div>

      {/* Questionnaire active form */}
      {activeAssignment && templates.get(activeAssignment.questionnaireId) && (
        <QuestionnaireForm
          questionnaire={templates.get(activeAssignment.questionnaireId)!}
          assignment={activeAssignment}
          athleteEmail={profile.email}
          onSubmitted={handleQuestionnaireSubmitted}
          onCancel={() => setActiveAssignment(null)}
        />
      )}

      {/* Pending questionnaires list */}
      {!activeAssignment && !loadingQ && pendingAssignments.length > 0 && (
        <section className="bg-surface border border-accent/20 rounded-surface p-4 sm:p-6">
          <h2 className="font-sans font-bold text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
            <span className="material-symbols-outlined text-accent">assignment_late</span>
            Cuestionarios pendientes
            <span className="ml-auto bg-accent text-black text-caption font-bold px-2 rounded-full">{pendingAssignments.length}</span>
          </h2>
          <div className="space-y-2">
            {pendingAssignments.map(a => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveAssignment(a)}
                  className="w-full flex items-center justify-between bg-raised border border-hairline hover:border-accent/40 rounded-control p-4 text-left transition-all group"
                >
                  <div>
                    <p className="font-sans font-bold text-body-s text-white group-hover:text-accent transition-colors">{q.title}</p>
                    {q.description && <p className="text-caption text-ink-2 font-sans">{q.description}</p>}
                    <p className="font-mono text-caption text-ink-2 mt-1">{q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="material-symbols-outlined text-ink-2 group-hover:text-accent transition-colors flex-shrink-0 ml-3">chevron_right</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming (not-yet-due) recurring questionnaires */}
      {!activeAssignment && !loadingQ && upcomingAssignments.length > 0 && (
        <details className="group bg-surface border border-hairline rounded-surface">
          <summary className="cursor-pointer list-none flex items-center justify-between p-4 sm:px-6">
            <h2 className="font-sans font-bold text-body-s text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-ink-2 text-title-s">event_upcoming</span>
              Cuestionarios futuros
              <span className="font-mono text-caption text-ink-2">({upcomingAssignments.length})</span>
            </h2>
            <span className="material-symbols-outlined text-ink-2 text-body-s group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="px-4 sm:px-6 pb-4 space-y-2">
            {upcomingAssignments.map(a => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <div key={a.id} className="flex items-center justify-between bg-raised border border-hairline rounded-surface p-3">
                  <p className="font-sans text-label text-ink-2">{q.title}</p>
                  <span className="font-sans text-caption text-ink-3 uppercase">
                    {a.schedule.type === 'weekdays' ? 'Semanal' : a.schedule.type === 'interval' ? `Cada ${a.schedule.intervalDays ?? 7}d` : a.schedule.type === 'monthly' ? 'Mensual' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Pending photo check-ins */}
      {!loadingPhotoAssignments && pendingPhotoAssignments.length > 0 && (
        <section className="bg-surface border border-accent/20 rounded-surface p-4 sm:p-6">
          <h2 className="font-sans font-bold text-title-s text-white mb-3 pb-2 border-b border-hairline flex items-center gap-2">
            <span className="material-symbols-outlined text-accent">photo_camera</span>
            Fotos pendientes
            <span className="ml-auto bg-accent text-black text-caption font-bold px-2 rounded-full">{pendingPhotoAssignments.length}</span>
          </h2>
          <div className="space-y-2">
            {pendingPhotoAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-raised border border-hairline rounded-surface p-4">
                <p className="font-sans font-bold text-body-s text-white">
                  {a.views.map(v => PHOTO_VIEW_LABELS[v]).join(', ')}
                </p>
                <p className="font-sans text-caption text-ink-2">Sube las fotos abajo</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming (not-yet-due) recurring photo check-ins */}
      {!loadingPhotoAssignments && upcomingPhotoAssignments.length > 0 && (
        <details className="group bg-surface border border-hairline rounded-surface">
          <summary className="cursor-pointer list-none flex items-center justify-between p-4 sm:px-6">
            <h2 className="font-sans font-bold text-body-s text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-ink-2 text-title-s">event_upcoming</span>
              Fotos futuras
              <span className="font-mono text-caption text-ink-2">({upcomingPhotoAssignments.length})</span>
            </h2>
            <span className="material-symbols-outlined text-ink-2 text-body-s group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="px-4 sm:px-6 pb-4 space-y-2">
            {upcomingPhotoAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-raised border border-hairline rounded-surface p-3">
                <p className="font-sans text-label text-ink-2">{a.views.map(v => PHOTO_VIEW_LABELS[v]).join(', ')}</p>
                <span className="font-sans text-caption text-ink-3 uppercase">
                  {a.schedule.type === 'weekdays' ? 'Semanal' : a.schedule.type === 'interval' ? `Cada ${a.schedule.intervalDays ?? 7}d` : a.schedule.type === 'monthly' ? 'Mensual' : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Fotografías de progreso (centralizado aquí) ──────────────────────── */}
      <section className="bg-surface border border-hairline rounded-surface p-4 sm:p-6">
        <h2 className="font-sans font-bold text-title-m text-white mb-4 pb-2 border-b border-hairline flex items-center gap-2">
          <span className="material-symbols-outlined text-accent">photo_camera</span>
          Fotografías de Progreso
        </h2>
        <PhotosScreen profile={profile} />
      </section>

      {/* ── Historial de Revisiones ──────────────────────────────────────────── */}
      <section className="bg-surface border border-hairline rounded-surface p-5">
        <h2 className="font-sans font-bold text-title-m text-white mb-4 pb-2 border-b border-hairline flex items-center gap-2">
          <span className="material-symbols-outlined text-data">history</span>
          Historial de Revisiones
        </h2>
        <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
          {checkins.map((item) => (
            <div
              key={item.id}
              className={`bg-raised border rounded-surface p-4 transition-all hover:bg-raised ${item.approved ? 'border-data/30' : 'border-hairline'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-label text-ink-2">{item.dateStr}</span>
                  <span className="font-mono font-bold text-white text-body-s">{item.weight} kg</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-title-s">{item.mood}</span>
                  <span className={`text-caption px-2 rounded-control uppercase font-mono ${item.adherence === 'Sí' ? 'bg-accent/10 text-accent' : item.adherence === 'Parcial' ? 'bg-data/10 text-data' : 'bg-red-400/10 text-red-300'}`}>
                    {item.adherence}
                  </span>
                </div>
              </div>
              {item.notes && (
                <p className="text-label text-ink-2 font-sans leading-relaxed mb-3 italic">"{item.notes}"</p>
              )}
              {item.coachFeedback ? (
                <div className="text-label border-l-2 border-accent pl-3 py-1 ml-1 bg-black/20 rounded-r-control p-2">
                  <span className="font-sans font-bold text-accent block mb-1">Nota del Entrenador:</span>
                  <p className="text-white leading-relaxed">{item.coachFeedback}</p>
                </div>
              ) : (
                <div className="text-caption text-ink-2/60 font-mono italic pl-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-label animate-spin text-accent">sync</span>
                  Pendiente de revisión del Entrenador
                </div>
              )}
            </div>
          ))}
          {checkins.length === 0 && (
            <EmptyState icon="monitor_weight" title="Aún no tienes registros de peso. Envía tu primer check-in." />
          )}
        </div>
      </section>
    </div>
  );
}
