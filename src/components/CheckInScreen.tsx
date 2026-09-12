import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { pantallaDiferida } from '../utils/pantallaDiferida';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, Questionnaire, QuestionnaireQuestion, PhotoAssignment, ProgressPhoto, PhotoView } from '../types';
import { createNotificationDeduped, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, getPesoExtremo, getPhotoAssignmentsForAthlete, getProgressPhotos, getMesocycles } from '../dbService';
import { todayStr, hasAnsweredThisOccurrence, isUpcoming, isOverdue, ScheduleContext } from '../utils/questionnaireSchedule';
import { cadenciaEnCristiano } from '../utils/scheduleEngine';
import { pesoUltimoKey } from '../hooks/useAthleteWeight';
import { leerSexo } from '../utils/athleteProfileSignals';
import PhotosScreen from './PhotosScreen';
import QuestionnaireWizard from './QuestionnaireWizard';
import { Badge, EmptyState, Icon, Skeleton } from './ui';

// Diferido: arrastran recharts (344 KB) — igual que hacía ProfileScreen antes
// de que estos paneles se movieran aquí (ver comentario más abajo).
const BodyweightPanel = pantallaDiferida('BodyweightPanel', () => import('./BodyweightPanel'));
const BodyMeasurementsPanel = pantallaDiferida('BodyMeasurementsPanel', () => import('./BodyMeasurementsPanel'));
const QuestionnaireChartsPanel = pantallaDiferida('QuestionnaireChartsPanel', () => import('./QuestionnaireChartsPanel'));

const PHOTO_VIEW_LABELS: Record<PhotoView, string> = { front: 'Frente', side: 'Lateral', back: 'Espalda' };

const COACH_EMAIL = 'danitrviner@gmail.com';

const ESTADO_CUESTIONARIO = {
  pendiente:  { tono: 'warning' as const, icono: 'assignment_late', texto: 'Pendiente' },
  aldia:      { tono: 'success' as const, icono: 'check',           texto: 'Respondido' },
  programado: { tono: 'neutral' as const, icono: 'schedule',        texto: 'Programado' },
};

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Cómo se enseña el valor de una respuesta en el historial (mismo criterio
 *  que el visor del coach en ClientReviewsPanel). */
function textoRespuesta(q: QuestionnaireQuestion | undefined, value: string | number | boolean): string {
  if (q?.type === 'boolean') return value ? 'Sí' : 'No';
  return `${String(value)}${q?.unit ? ` ${q.unit}` : ''}`;
}

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
  // Plantillas que hacen falta: las de las asignaciones activas Y las de
  // cualquier respuesta ya enviada — el historial tiene que poder titular
  // respuestas de un cuestionario que el coach desasignó después.
  const activeQuestionnaireIds = useMemo(
    () => [...new Set([
      ...assignments.map(a => a.questionnaireId),
      ...responses.map(r => r.questionnaireId),
    ])],
    [assignments, responses]
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

  // Todas las asignaciones activas, con su estado y su última respuesta. Antes
  // esta pantalla solo listaba las VENCIDAS (y las futuras en un desplegable
  // de solo lectura): un cuestionario ya respondido, o programado para más
  // adelante, no se podía ni abrir ni consultar desde ningún sitio del perfil.
  // Ahora se listan todas y todas se pueden abrir — responder de más nunca
  // rompe nada (cada envío es una respuesta más en el histórico).
  const listaCuestionarios = useMemo(() => {
    const ultimaPorAsignacion = new Map<string, QuestionnaireResponse>();
    for (const r of responses) {
      const prev = ultimaPorAsignacion.get(r.assignmentId);
      if (!prev || r.submittedAt > prev.submittedAt) ultimaPorAsignacion.set(r.assignmentId, r);
    }
    return assignments
      .map(a => {
        const vencido = isOverdue(a, scheduleCtx);
        const respondido = hasAnsweredThisOccurrence(a, responses, scheduleCtx);
        const estado: 'pendiente' | 'aldia' | 'programado' =
          vencido && !respondido ? 'pendiente' : respondido ? 'aldia' : 'programado';
        return { a, estado, ultima: ultimaPorAsignacion.get(a.id) ?? null };
      })
      .sort((x, y) => {
        const peso = { pendiente: 0, programado: 1, aldia: 2 } as const;
        if (peso[x.estado] !== peso[y.estado]) return peso[x.estado] - peso[y.estado];
        return (templates.get(x.a.questionnaireId)?.title ?? '').localeCompare(templates.get(y.a.questionnaireId)?.title ?? '');
      });
  }, [assignments, responses, scheduleCtx, templates]);

  // Historial de respuestas enviadas, de la más reciente a la más antigua.
  const historialRespuestas = useMemo(
    () => [...responses].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [responses]
  );

  // Etiqueta de cada pregunta para el historial: se busca en TODAS las
  // plantillas cargadas más las preguntas exclusivas del atleta que viven en
  // los overrides de su asignación.
  const etiquetasPregunta = useMemo(() => {
    const map = new Map<string, QuestionnaireQuestion>();
    for (const t of templates.values()) for (const q of t.questions) map.set(q.id, q);
    for (const a of rawAssignments) for (const q of a.overrides?.extra ?? []) map.set(q.id, q);
    return map;
  }, [templates, rawAssignments]);

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
        <h1 className="font-display font-black text-title-l uppercase tracking-tight text-white">Revisión</h1>
        <p className="text-ink-2 text-body-s mt-1">Tu peso, tus cuestionarios, tus fotos y tus medidas: todo lo que le cuentas a tu coach, en un solo sitio.</p>
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

      {/* ── Cuestionarios (todos, no solo los vencidos) ──────────────────────
          Antes solo se pintaba la lista de VENCIDOS y un desplegable de solo
          lectura con los futuros: los ya respondidos y los programados no se
          podían ni ver ni abrir desde ninguna parte del perfil del atleta. */}
      {!activeAssignment && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="quiz" size="m" className="text-accent" />
            <h2 className="font-sans font-bold text-body-s text-ink flex-1">Cuestionarios</h2>
            {pendingAssignments.length > 0 && (
              <Badge tone="warning">{pendingAssignments.length} pendiente{pendingAssignments.length === 1 ? '' : 's'}</Badge>
            )}
          </div>

          {loadingQ ? (
            <Skeleton className="w-full h-24 rounded-field" />
          ) : listaCuestionarios.length === 0 ? (
            <div className="border border-dashed border-hairline rounded-field">
              <EmptyState
                icon="quiz"
                title="Sin cuestionarios asignados"
                description="Cuando tu coach te asigne uno aparecerá aquí, con sus fechas y todo lo que ya hayas respondido."
              />
            </div>
          ) : (
            <div className="bg-surface border border-hairline rounded-field overflow-hidden">
              {listaCuestionarios.map(({ a, estado, ultima }, i) => {
                const q = templates.get(a.questionnaireId);
                if (!q) return null;
                const info = ESTADO_CUESTIONARIO[estado];
                return (
                  <button
                    key={a.id}
                    onClick={() => setActiveAssignment(a)}
                    className={`w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-raised group ${i < listaCuestionarios.length - 1 ? 'border-b border-hairline' : ''}`}
                  >
                    <span className={`w-9 h-9 rounded-control flex items-center justify-center shrink-0 mt-0.5 ${estado === 'pendiente' ? 'bg-warning/12' : estado === 'aldia' ? 'bg-success/12' : 'bg-raised'}`}>
                      <span className={`material-symbols-outlined text-[18px] ${estado === 'pendiente' ? 'text-warning' : estado === 'aldia' ? 'text-success' : 'text-ink-2'}`}>{info.icono}</span>
                    </span>
                    {/* El estado va DEBAJO del título, no a su derecha: en
                        móvil una insignia de ~110 px dejaba el título en
                        «DOM's o "ag…» y la periodicidad en un guion. */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-sans font-semibold text-body-s text-white">{q.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={info.tono}>{info.texto}</Badge>
                        <span className="font-mono text-caption text-ink-2">
                          {q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}
                          {` · ${cadenciaEnCristiano(a.schedule)}`}
                        </span>
                      </div>
                      {ultima && (
                        <p className="font-mono text-caption text-ink-3">Última: {fmtFechaCorta(ultima.submittedAt)}</p>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-ink-3 group-hover:text-accent transition-colors shrink-0 self-center">chevron_right</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Respuestas ya enviadas — el atleta no tenía forma de releer lo
              que contestó; el coach sí (ClientReviewsPanel). */}
          {historialRespuestas.length > 0 && (
            <details className="group bg-surface border border-hairline rounded-field p-4">
              <summary className="cursor-pointer list-none flex items-center justify-between">
                <span className="font-sans font-bold text-body-s text-white">
                  Respuestas enviadas <span className="font-mono text-caption text-ink-2 font-normal">({historialRespuestas.length})</span>
                </span>
                <span className="material-symbols-outlined text-ink-2 text-body-s group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {historialRespuestas.map(r => (
                  <details key={r.id} className="bg-raised border border-hairline rounded-surface overflow-hidden">
                    <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                      <span className="material-symbols-outlined text-ink-2 text-body-s">expand_more</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-sans font-bold text-white text-label truncate">
                          {templates.get(r.questionnaireId)?.title ?? 'Cuestionario'}
                        </p>
                        <p className="font-mono text-caption text-ink-2">
                          {fmtFechaCorta(r.submittedAt)} · {r.answers.length} respuesta{r.answers.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </summary>
                    <div className="px-4 pb-3 pt-1 space-y-2 border-t border-hairline">
                      {r.answers.map(ans => {
                        const pregunta = etiquetasPregunta.get(ans.questionId);
                        // Una respuesta libre no cabe en una columna estrecha
                        // a la derecha: va debajo de su pregunta, a renglón
                        // suelto. Las numéricas sí van enfrentadas.
                        const esTexto = pregunta?.type === 'text' || typeof ans.value === 'string';
                        if (esTexto) {
                          return (
                            <div key={ans.questionId}>
                              <p className="font-sans text-caption text-ink-2">{pregunta?.label ?? ans.questionId}</p>
                              <p className="font-sans text-label text-white leading-relaxed">{textoRespuesta(pregunta, ans.value)}</p>
                            </div>
                          );
                        }
                        return (
                          <div key={ans.questionId} className="flex items-start gap-3">
                            <span className="font-sans text-caption text-ink-2 flex-1">{pregunta?.label ?? ans.questionId}</span>
                            <span className="font-mono text-label text-white font-bold text-right shrink-0">
                              {textoRespuesta(pregunta, ans.value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          )}
        </section>
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

      {/* ── Mediciones y evolución (antes vivían en ProfileScreen) ───────────
          Se mueven aquí para que la ruta /checkin —a la que saltan las tareas
          pendientes de Inicio— enseñe lo mismo que Perfil › Revisión, y para
          que todo lo que el atleta apunta o consulta de su seguimiento esté
          en una sola pantalla. */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="straighten" size="m" className="text-accent" />
          <h2 className="font-sans font-bold text-body-s text-ink flex-1">Mediciones</h2>
        </div>
        <Suspense fallback={<Skeleton className="w-full h-48 rounded-surface" />}>
          <BodyMeasurementsPanel
            athleteEmail={profile.email}
            sexo={leerSexo(responses, [...templates.values()])}
            pesoKg={profile.actualWeight || null}
            audiencia="atleta"
          />
        </Suspense>
      </section>

      {templates.size > 0 && responses.length > 0 && (
        <section>
          <Suspense fallback={<Skeleton className="w-full h-48 rounded-surface" />}>
            <QuestionnaireChartsPanel questionnaires={[...templates.values()]} responses={responses} ocultarDoms />
          </Suspense>
        </section>
      )}

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
