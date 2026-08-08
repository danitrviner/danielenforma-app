import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, Questionnaire, BodyweightLog, PhotoAssignment, ProgressPhoto, PhotoView } from '../types';
import { createNotificationDeduped, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, addBodyweight, getBodyweightForAthlete, updateBodyweight, getPhotoAssignmentsForAthlete, getProgressPhotos, getMesocycles } from '../dbService';
import { todayStr, isDueToday, hasAnsweredThisOccurrence, isUpcoming, isOverdue, ScheduleContext } from '../utils/questionnaireSchedule';
import { hasUploadedThisOccurrence } from '../utils/photoSchedule';
import { scheduleLabel } from '../utils/scheduleEngine';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import PhotosScreen from './PhotosScreen';
import QuestionnaireForm from './QuestionnaireForm';

const PHOTO_VIEW_LABELS: Record<PhotoView, string> = { front: 'Frente', side: 'Lateral', back: 'Espalda' };

const COACH_EMAIL = 'danitrviner@gmail.com';

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
  // bwLogs viene ascendente por fecha (getBodyweightForAthlete) — el último es
  // el peso más reciente, usado para prefill de la pregunta 'metric' bodyweight.
  const latestWeight = bwLogs.length > 0 ? bwLogs[bwLogs.length - 1].weight : undefined;
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
  // Mesociclos del atleta — contexto para los disparadores 'plan_week' y
  // 'mesocycle_end' (scheduleEngine no conoce el plan de entreno por sí solo).
  const { data: mesocycles = [] } = useQuery({
    queryKey: ['mesocyclesForAthlete', profile.email],
    queryFn: () => getMesocycles(profile.email),
  });
  const scheduleCtx: ScheduleContext = useMemo(() => ({ mesocycles }), [mesocycles]);

  const loadingQ = loadingAssignments || loadingResponses
    || (activeQuestionnaireIds.length > 0 && questionnaireQueries.some(q => q.isPending));

  const [activeAssignment, setActiveAssignment] = useState<QuestionnaireAssignment | null>(null);

  // "Vencido y sin responder" (isOverdue) en vez de isDueToday: para
  // interval/plan_week/mesocycle_end, isOverdue se queda true desde la fecha
  // objetivo hasta que se responde, no solo el día exacto — así un
  // cuestionario sin responder no desaparece de "pendientes" al día siguiente.
  const pendingAssignments = assignments.filter(
    a => isOverdue(a, scheduleCtx) && !hasAnsweredThisOccurrence(a, responses, scheduleCtx)
  );
  const upcomingAssignments = assignments.filter(a => !isOverdue(a, scheduleCtx) && isUpcoming(a, scheduleCtx));

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
        <h1 className="font-sans font-extrabold text-3xl tracking-tight text-white">Check-in Semanal</h1>
        <p className="text-[#c6c9ab] text-sm mt-1">Registra tu peso y responde los cuestionarios del entrenador.</p>
      </div>

      {/* ── Quick bodyweight widget ─────────────────────────────────────────── */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl px-4 py-3 space-y-3">
        {/* Modo: día a día vs. media semanal ya calculada por el atleta */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => changeBwMode('daily')}
            className={`px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wide border transition-all ${
              bwMode === 'daily' ? 'bg-[#00eefc]/15 border-[#00eefc]/40 text-[#00eefc]' : 'border-white/7 text-[#c6c9ab]'
            }`}
          >
            Me peso cada día
          </button>
          <button
            type="button"
            onClick={() => changeBwMode('weekly_avg')}
            className={`px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wide border transition-all ${
              bwMode === 'weekly_avg' ? 'bg-[#00eefc]/15 border-[#00eefc]/40 text-[#00eefc]' : 'border-white/7 text-[#c6c9ab]'
            }`}
          >
            Llevo yo la media semanal
          </button>
        </div>

        <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#00eefc]/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[#00eefc] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>scale</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">
            {bwMode === 'weekly_avg' ? 'Media semanal' : 'Peso de hoy'}
          </p>
          {!bwEditing && bwToday ? (
            <p className="font-mono text-lg font-bold text-white leading-tight">
              {bwToday.weight} <span className="text-xs text-[#c6c9ab] font-normal">kg</span>
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
                className="w-24 bg-[#1e1e1b] border border-white/7 rounded-xl px-2.5 py-1.5 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#00eefc] placeholder-[#444]"
              />
              <span className="font-mono text-xs text-[#555]">kg</span>
            </div>
          )}
          {bwError && <p className="font-mono text-[10px] text-red-400 mt-1">{bwError}</p>}
        </div>

        {!bwEditing && bwToday ? (
          <button
            onClick={() => { setBwInput(String(bwToday.weight)); setBwEditing(true); }}
            className="flex-shrink-0 w-9 h-9 rounded-lg border border-white/7 flex items-center justify-center text-[#c6c9ab] hover:text-white hover:border-[#3a3a3a] transition-all"
            title="Editar"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
          </button>
        ) : (
          <button
            onClick={handleSaveBw}
            disabled={bwSaving}
            className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#00eefc] flex items-center justify-center text-black transition-all hover:bg-[#00d4e0] active:scale-95 disabled:opacity-50"
            title="Guardar peso"
          >
            {bwSaving
              ? <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
              : <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
            }
          </button>
        )}
        </div>

        {bwMode === 'weekly_avg' && (
          <p className="font-mono text-[10px] text-[#c6c9ab]/70 -mt-1">
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
          currentWeight={latestWeight}
          onSubmitted={handleQuestionnaireSubmitted}
          onCancel={() => setActiveAssignment(null)}
        />
      )}

      {/* Pending questionnaires list */}
      {!activeAssignment && !loadingQ && pendingAssignments.length > 0 && (
        <section className="bg-[#181816] border border-[#fbcb1a]/20 rounded-2xl p-4 sm:p-6">
          <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-white/7 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a]">assignment_late</span>
            Cuestionarios pendientes
            <span className="ml-auto bg-[#fbcb1a] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingAssignments.length}</span>
          </h2>
          <div className="space-y-2">
            {pendingAssignments.map(a => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveAssignment(a)}
                  className="w-full flex items-center justify-between bg-[#1e1e1e] border border-white/7 hover:border-[#fbcb1a]/40 rounded-lg p-3.5 text-left transition-all group"
                >
                  <div>
                    <p className="font-sans font-semibold text-sm text-white group-hover:text-[#fbcb1a] transition-colors">{q.title}</p>
                    {q.description && <p className="text-[11px] text-[#c6c9ab] mt-0.5 font-sans">{q.description}</p>}
                    <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">
                      {q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}
                      {(a.schedule.type === 'plan_week' || a.schedule.type === 'mesocycle_end') && ` · ${scheduleLabel(a.schedule)}`}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#fbcb1a] transition-colors flex-shrink-0 ml-3">chevron_right</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming (not-yet-due) recurring questionnaires */}
      {!activeAssignment && !loadingQ && upcomingAssignments.length > 0 && (
        <details className="group bg-[#181816] border border-white/7 rounded-2xl">
          <summary className="cursor-pointer list-none flex items-center justify-between p-4 sm:px-6">
            <h2 className="font-sans font-bold text-sm text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#c6c9ab] text-base">event_upcoming</span>
              Cuestionarios futuros
              <span className="font-mono text-[10px] text-[#c6c9ab]">({upcomingAssignments.length})</span>
            </h2>
            <span className="material-symbols-outlined text-[#c6c9ab] text-sm group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="px-4 sm:px-6 pb-4 space-y-2">
            {upcomingAssignments.map(a => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <div key={a.id} className="flex items-center justify-between bg-[#1e1e1e] border border-white/60 rounded-lg p-3">
                  <p className="font-sans text-xs text-[#c6c9ab]">{q.title}</p>
                  <span className="font-mono text-[9px] text-[#555] uppercase">
                    {scheduleLabel(a.schedule)}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Pending photo check-ins */}
      {!loadingPhotoAssignments && pendingPhotoAssignments.length > 0 && (
        <section className="bg-[#181816] border border-[#fbcb1a]/20 rounded-2xl p-4 sm:p-6">
          <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-white/7 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a]">photo_camera</span>
            Fotos pendientes
            <span className="ml-auto bg-[#fbcb1a] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingPhotoAssignments.length}</span>
          </h2>
          <div className="space-y-2">
            {pendingPhotoAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-[#1e1e1e] border border-white/7 rounded-lg p-3.5">
                <p className="font-sans font-semibold text-sm text-white">
                  {a.views.map(v => PHOTO_VIEW_LABELS[v]).join(', ')}
                </p>
                <p className="font-mono text-[10px] text-[#c6c9ab]">Sube las fotos abajo</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming (not-yet-due) recurring photo check-ins */}
      {!loadingPhotoAssignments && upcomingPhotoAssignments.length > 0 && (
        <details className="group bg-[#181816] border border-white/7 rounded-2xl">
          <summary className="cursor-pointer list-none flex items-center justify-between p-4 sm:px-6">
            <h2 className="font-sans font-bold text-sm text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#c6c9ab] text-base">event_upcoming</span>
              Fotos futuras
              <span className="font-mono text-[10px] text-[#c6c9ab]">({upcomingPhotoAssignments.length})</span>
            </h2>
            <span className="material-symbols-outlined text-[#c6c9ab] text-sm group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="px-4 sm:px-6 pb-4 space-y-2">
            {upcomingPhotoAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-[#1e1e1e] border border-white/60 rounded-lg p-3">
                <p className="font-sans text-xs text-[#c6c9ab]">{a.views.map(v => PHOTO_VIEW_LABELS[v]).join(', ')}</p>
                <span className="font-mono text-[9px] text-[#555] uppercase">
                  {a.schedule.type === 'weekdays' ? 'Semanal' : a.schedule.type === 'interval' ? `Cada ${a.schedule.intervalDays ?? 7}d` : a.schedule.type === 'monthly' ? 'Mensual' : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Fotografías de progreso (centralizado aquí) ──────────────────────── */}
      <section className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-6">
        <h2 className="font-sans font-bold text-lg text-white mb-4 pb-2 border-b border-white/7 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a]">photo_camera</span>
          Fotografías de Progreso
        </h2>
        <PhotosScreen profile={profile} />
      </section>

      {/* ── Historial de Revisiones ──────────────────────────────────────────── */}
      <section className="bg-[#181816] border border-white/7 rounded-2xl p-5">
        <h2 className="font-sans font-bold text-lg text-white mb-4 pb-2 border-b border-white/7 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc]">history</span>
          Historial de Revisiones
        </h2>
        <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
          {checkins.map((item) => (
            <div
              key={item.id}
              className={`bg-[#1e1e1e] border rounded-lg p-4 transition-all hover:bg-[#201f1f] ${item.approved ? 'border-[#00eefc]/30' : 'border-white/7'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[#c6c9ab]">{item.dateStr}</span>
                  <span className="font-mono font-bold text-white text-sm">{item.weight} kg</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.mood}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-mono ${item.adherence === 'Sí' ? 'bg-[#fbcb1a]/10 text-[#fbcb1a]' : item.adherence === 'Parcial' ? 'bg-[#00eefc]/10 text-[#00eefc]' : 'bg-red-400/10 text-red-300'}`}>
                    {item.adherence}
                  </span>
                </div>
              </div>
              {item.notes && (
                <p className="text-xs text-[#c6c9ab] font-sans leading-relaxed mb-3 italic">"{item.notes}"</p>
              )}
              {item.coachFeedback ? (
                <div className="text-xs border-l-2 border-[#fbcb1a] pl-3 py-1 ml-1 bg-black/20 rounded-r p-2">
                  <span className="font-mono font-semibold text-[#fbcb1a] block mb-1">Nota del Entrenador:</span>
                  <p className="text-white leading-relaxed">{item.coachFeedback}</p>
                </div>
              ) : (
                <div className="text-[11px] text-[#c6c9ab]/60 font-mono italic pl-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs animate-spin text-[#fbcb1a]">sync</span>
                  Pendiente de revisión del Entrenador
                </div>
              )}
            </div>
          ))}
          {checkins.length === 0 && (
            <div className="text-[#c6c9ab] text-center italic py-12 text-sm">
              Aún no tienes registros de peso. Envía tu primer check-in.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
