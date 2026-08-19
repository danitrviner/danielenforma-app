import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, Questionnaire, BodyweightLog, PhotoAssignment, ProgressPhoto, PhotoView } from '../types';
import { createNotificationDeduped, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, addBodyweight, getBodyweightForAthlete, updateBodyweight, getPhotoAssignmentsForAthlete, getProgressPhotos, getMesocycles } from '../dbService';
import { todayStr, isDueToday, hasAnsweredThisOccurrence, isUpcoming, isOverdue, ScheduleContext } from '../utils/questionnaireSchedule';
import { hasUploadedThisOccurrence } from '../utils/photoSchedule';
import { scheduleLabel } from '../utils/scheduleEngine';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import PhotosScreen from './PhotosScreen';
import QuestionnaireWizard from './QuestionnaireWizard';
import { EmptyState, WeightWheelPicker } from './ui';

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

  // Sin asignación explícita del coach (ya no es configurable desde su UI):
  // por defecto se piden las 3 vistas cada semana, para que el flujo de fotos
  // de check-in nunca dependa de que alguien lo active a mano.
  const effectivePhotoAssignments = useMemo<PhotoAssignment[]>(() => {
    if (photoAssignments.length > 0) return photoAssignments;
    return [{
      id: 'implicit-default',
      athleteId: profile.email,
      schedule: { type: 'interval', intervalDays: 7 },
      startDate: todayStr(),
      views: ['front', 'side', 'back'],
      active: true,
      createdAt: new Date().toISOString(),
    }];
  }, [photoAssignments, profile.email]);

  const pendingPhotoAssignments = effectivePhotoAssignments.filter(
    a => isDueToday(a) && !hasUploadedThisOccurrence(a, progressPhotos)
  );
  const upcomingPhotoAssignments = effectivePhotoAssignments.filter(a => isUpcoming(a));

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
            <div className="mt-1">
              <WeightWheelPicker
                value={bwInput && !isNaN(parseFloat(bwInput)) ? parseFloat(bwInput) : (bwToday?.weight ?? latestWeight ?? 70)}
                onChange={v => { setBwInput(String(v)); setBwError(''); }}
              />
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
        <QuestionnaireWizard
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
                    <p className="font-mono text-caption text-ink-2 mt-1">
                      {q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}
                      {(a.schedule.type === 'plan_week' || a.schedule.type === 'mesocycle_end') && ` · ${scheduleLabel(a.schedule)}`}
                    </p>
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

      {/* ── El hilo de revisiones (F3.13c) ───────────────────────────────────── */}
      <section className="bg-surface border border-hairline rounded-surface p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-hairline">
          <h2 className="font-sans font-bold text-title-m text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-accent">history</span>
            Revisiones
          </h2>
          {checkins.length > 0 && (
            <span className="font-mono text-caption text-ink-3 uppercase tracking-wider">
              {checkins.length} enviada{checkins.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {checkins.length === 0 ? (
          <EmptyState
            icon="history_edu"
            title="Cada domingo, dos minutos"
            description="Tú cuentas cómo ha ido la semana y tu coach ajusta el plan con eso. Aquí quedará todo el hilo, revisión a revisión."
          />
        ) : (() => {
          const ordenado = [...checkins].sort((a, b) => {
            const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime();
            const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime();
            return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
          });
          return (
            <div className="relative max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gradient-to-b from-accent-line to-transparent" aria-hidden />
              {ordenado.map((item, idx) => {
                const esUltima = idx === 0;
                const tieneRespuesta = !!item.coachFeedback;
                return (
                  <div key={item.id} className="relative flex gap-4 pb-4 last:pb-0">
                    <span
                      className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${esUltima ? 'bg-accent animate-pulse-dot' : 'bg-ink-4'}`}
                      aria-hidden
                    />
                    <div
                      className={`min-w-0 flex-1 space-y-2 rounded-field border p-4 ${
                        esUltima && tieneRespuesta ? 'border-accent-line bg-raised' : 'border-hairline bg-field'
                      }`}
                    >
                      {esUltima && tieneRespuesta && (
                        <span className="inline-block rounded-chip bg-accent px-2 py-1 font-mono text-caption font-bold uppercase tracking-wide text-on-accent">
                          Respuesta nueva
                        </span>
                      )}
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-sans text-body-s text-ink">{item.dateStr}</span>
                        <span className="font-mono text-caption text-ink-2">{item.weight} kg · {item.adherence}</span>
                      </div>
                      {item.notes && (
                        <p className="font-sans text-body-s text-ink-2 italic leading-relaxed">"{item.notes}"</p>
                      )}
                      {tieneRespuesta ? (
                        <p className="font-sans text-body-s text-ink leading-relaxed">{item.coachFeedback}</p>
                      ) : (
                        <p className="flex items-center gap-1 font-mono text-caption italic text-ink-3">
                          <span className="material-symbols-outlined animate-spin text-accent text-label">sync</span>
                          Pendiente de revisión
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
