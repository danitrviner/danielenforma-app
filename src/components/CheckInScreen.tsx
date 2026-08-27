import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, Questionnaire, PhotoAssignment, ProgressPhoto, PhotoView } from '../types';
import { createNotificationDeduped, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getPesoExtremo, getPhotoAssignmentsForAthlete, getProgressPhotos, getMesocycles } from '../dbService';
import { todayStr, hasAnsweredThisOccurrence, isUpcoming, isOverdue, ScheduleContext } from '../utils/questionnaireSchedule';
import { scheduleLabel } from '../utils/scheduleEngine';
import { pesoUltimoKey } from '../hooks/useAthleteWeight';
import PhotosScreen from './PhotosScreen';
import QuestionnaireWizard from './QuestionnaireWizard';
import { EmptyState, Skeleton } from './ui';

// Diferido: arrastra recharts (344 KB) — igual que hacía ProfileScreen antes
// de que este panel se moviera aquí (ver comentario más abajo).
const BodyweightPanel = lazy(() => import('./BodyweightPanel'));

const PHOTO_VIEW_LABELS: Record<PhotoView, string> = { front: 'Frente', side: 'Lateral', back: 'Espalda' };

const COACH_EMAIL = 'danitrviner@gmail.com';

// ── Main screen ───────────────────────────────────────────────────────────────

interface CheckInScreenProps {
  profile: UserProfile;
  checkins: WeightCheckIn[];
}

export default function CheckInScreen({ profile, checkins }: CheckInScreenProps) {
  const queryClient = useQueryClient();

  // Solo para prefill de la pregunta 'metric' bodyweight de los cuestionarios
  // — el registro/edición de peso en sí vive en BodyweightPanel (rediseño
  // Fase 3.2, "Perfil"): un único sitio para pesarse, no dos widgets distintos.
  //
  // Y solo hace falta el peso más reciente, no el historial: antes se leían
  // todos los registros del atleta para quedarse con el último de la lista.
  const { data: ultimoPeso = null } = useQuery({
    queryKey: pesoUltimoKey(profile.email),
    queryFn: () => getPesoExtremo(profile.email, 'ultimo'),
  });
  const latestWeight = ultimoPeso?.weight;

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
    // Misma clave que TrainingScreen/HomeScreen/ClientHub — antes llevaba el
    // sufijo "ForAthlete" y pagaba su propia lectura en vez de compartir la
    // de las demás pantallas.
    queryKey: ['mesocycles', profile.email],
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
      {/* Peso corporal (handoff §1) — primera sección, antes del check-in
          semanal. Vive aquí (no en ProfileScreen) para que sea el mismo
          único sitio para pesarse tanto desde Perfil › Progreso como desde
          la ruta /checkin a la que saltan las tareas pendientes de Home:
          antes esa ruta no tenía ningún input de peso y el atleta no podía
          añadirlo al entrar a responder un cuestionario desde ahí. */}
      <Suspense fallback={<Skeleton className="w-full h-48 rounded-surface" />}>
        <BodyweightPanel athleteEmail={profile.email} />
      </Suspense>

      <div>
        <h1 className="font-display font-black text-title-l uppercase tracking-tight text-white">Check-in Semanal</h1>
        <p className="text-ink-2 text-body-s mt-1">Registra tu peso y responde los cuestionarios del entrenador.</p>
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
        <section className="bg-surface border border-hairline rounded-field overflow-hidden">
          <h2 className="font-sans font-bold text-body-s text-white p-4 pb-3 border-b border-hairline flex items-center gap-2">
            <span className="material-symbols-outlined text-warning text-[17px]">assignment_late</span>
            Cuestionarios pendientes
            <span className="ml-auto bg-warning text-on-accent text-caption font-mono font-bold px-2 py-0.5 rounded-full">{pendingAssignments.length}</span>
          </h2>
          <div>
            {pendingAssignments.map((a, i) => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveAssignment(a)}
                  className={`w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-raised group ${i < pendingAssignments.length - 1 ? 'border-b border-hairline' : ''}`}
                >
                  <span className="w-9 h-9 rounded-control bg-warning/12 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-warning text-[18px]">quiz</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-sans font-semibold text-body-s text-white truncate">{q.title}</p>
                    <p className="font-mono text-caption text-ink-2 mt-0.5">
                      {q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}
                      {(a.schedule.type === 'plan_week' || a.schedule.type === 'mesocycle_end') && ` · ${scheduleLabel(a.schedule)}`}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-ink-3 group-hover:text-accent transition-colors shrink-0">chevron_right</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming (not-yet-due) recurring questionnaires */}
      {!activeAssignment && !loadingQ && upcomingAssignments.length > 0 && (
        <details className="group bg-surface border border-hairline rounded-field p-4">
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <span className="font-sans font-bold text-body-s text-white">
              Cuestionarios futuros <span className="font-mono text-caption text-ink-2 font-normal">({upcomingAssignments.length})</span>
            </span>
            <span className="material-symbols-outlined text-ink-2 text-body-s group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="mt-3 space-y-2">
            {upcomingAssignments.map(a => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <div key={a.id} className="flex items-center justify-between gap-3">
                  <p className="font-sans text-body-s text-ink-2">{q.title}</p>
                  <span className="font-mono text-caption text-ink-2 shrink-0">
                    {scheduleLabel(a.schedule)}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Upcoming (not-yet-due) recurring photo check-ins */}
      {!loadingPhotoAssignments && upcomingPhotoAssignments.length > 0 && (
        <details className="group bg-surface border border-hairline rounded-field p-4">
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <span className="font-sans font-bold text-body-s text-white">
              Fotos futuras <span className="font-mono text-caption text-ink-2 font-normal">({upcomingPhotoAssignments.length})</span>
            </span>
            <span className="material-symbols-outlined text-ink-2 text-body-s group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="mt-3 space-y-2">
            {upcomingPhotoAssignments.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3">
                <p className="font-sans text-body-s text-ink-2">{a.views.map(v => PHOTO_VIEW_LABELS[v]).join(', ')}</p>
                <span className="font-mono text-caption text-ink-2 shrink-0">
                  {a.schedule.type === 'weekdays' ? 'Semanal' : a.schedule.type === 'interval' ? `Cada ${a.schedule.intervalDays ?? 7}d` : a.schedule.type === 'monthly' ? 'Mensual' : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── Fotografías de progreso (centralizado aquí) ──────────────────────── */}
      <section>
        <h2 className="font-sans font-bold text-body-s text-white mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-[18px]">photo_camera</span>
          Fotografías de progreso
        </h2>
        <PhotosScreen profile={profile} />
      </section>

      {/* ── El hilo de revisiones (F3.13c) ───────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3.5">
          <span className="material-symbols-outlined text-accent text-[18px]">history</span>
          <h2 className="font-sans font-bold text-body-s text-ink flex-1">Revisiones</h2>
          {checkins.length > 0 && (
            <span className="font-mono text-label text-ink-2">
              {checkins.length} enviada{checkins.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {checkins.length === 0 ? (
          <div className="border border-dashed border-hairline rounded-field">
            <EmptyState
              icon="history_edu"
              title="Cada domingo, dos minutos"
              description="Tú cuentas cómo ha ido la semana y tu coach ajusta el plan con eso. Aquí quedará todo el hilo, revisión a revisión."
            />
          </div>
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
