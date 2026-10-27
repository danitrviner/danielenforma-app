import React, { useState, useMemo, Suspense } from 'react';
import { pantallaDiferida } from '../utils/pantallaDiferida';
import { useQueryClient } from '@tanstack/react-query';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, QuestionnaireQuestion, PhotoAssignment, PhotoView } from '../types';
import { createNotificationDeduped } from '../dbService';
import { todayStr, hasAnsweredThisOccurrence, isUpcoming, isOverdue } from '../utils/questionnaireSchedule';
import { cadenciaEnCristiano, proximaOcurrencia, finDeEstaSemana, startOfDay } from '../utils/scheduleEngine';
import { leerSexo } from '../utils/athleteProfileSignals';
import PhotosScreen from './PhotosScreen';
import QuestionnaireWizard from './QuestionnaireWizard';
import RevisionDeLaSemana from './checkin/RevisionDeLaSemana';
import HistorialDeRevisiones from './checkin/HistorialDeRevisiones';
import { historialDeRevisiones, type PasoRevision } from '../utils/revisionSemanal';
import { useRevisionDeLaSemana } from '../hooks/useRevisionDeLaSemana';
import { useToast } from '../hooks/useToast';
import { Badge, Button, EmptyState, Icon, Skeleton } from './ui';

// Diferido: arrastran recharts (344 KB) — igual que hacía ProfileScreen antes
// de que estos paneles se movieran aquí (ver comentario más abajo).
const BodyweightPanel = pantallaDiferida('BodyweightPanel', () => import('./BodyweightPanel'));
const MiObjetivo = pantallaDiferida('MiObjetivo', () => import('./MiObjetivo'));
const BodyMeasurementsPanel = pantallaDiferida('BodyMeasurementsPanel', () => import('./BodyMeasurementsPanel'));
const QuestionnaireChartsPanel = pantallaDiferida('QuestionnaireChartsPanel', () => import('./QuestionnaireChartsPanel'));

const PHOTO_VIEW_LABELS: Record<PhotoView, string> = { front: 'Frente', side: 'Lateral', back: 'Espalda' };

import { COACH_EMAIL } from '../utils/coach';

const ESTADO_CUESTIONARIO = {
  pendiente:  { tono: 'warning' as const, icono: 'assignment_late', texto: 'Pendiente' },
  aldia:      { tono: 'success' as const, icono: 'check',           texto: 'Respondido' },
  programado: { tono: 'neutral' as const, icono: 'schedule',        texto: 'Programado' },
};

/**
 * Fecha corta. El AÑO solo aparece cuando no es el de hoy.
 *
 * Esta pantalla es una lista larga de cosas casi todas recientes, y repetir
 * «2026» en cada línea es ruido que además tapa lo único que ese año querría
 * decir: que una respuesta es del año pasado. Escondiéndolo cuando es el
 * actual, verlo significa algo.
 */
/* ═══════════════════════════════════════════════════════════════════════════
   El índice de la Revisión del atleta.

   Cinco cosas que antes vivían en pantallas distintas acabaron en un solo
   scroll: peso, cuestionarios, fotos, medidas e historial. Está bien que estén
   juntas —es todo lo que le cuenta a su coach— pero el que entra a subir una
   foto no tiene por qué deslizar por sus cuestionarios y sus medidas para
   llegar.

   `scrollIntoView` y no un enlace `#ancla`: un hash cambia la URL, y esta
   pantalla se abre dentro de Perfil además de en su propia ruta, así que
   ensuciaría el historial del navegador y el botón Atrás.
   ═══════════════════════════════════════════════════════════════════════════ */
const SECCIONES_REVISION = [
  { id: 'revision-cuestionarios', icono: 'quiz', label: 'Cuestionarios' },
  { id: 'revision-fotos', icono: 'photo_camera', label: 'Fotos' },
  { id: 'revision-mediciones', icono: 'straighten', label: 'Medidas' },
  { id: 'revision-historial', icono: 'history', label: 'Historial' },
] as const;

/** Lleva la pantalla hasta un bloque de la revisión (con salto directo si el WebView ignora el desplazamiento suave). */
function irAlBloque(id: string) {
  const destino = document.getElementById(id);
  if (!destino) return;
  // Con «reducir movimiento» activado —y en algunos WebView— el desplazamiento
  // suave se ignora SIN error: el botón no hace nada y no hay forma de saber
  // por qué. Se intenta suave y, si al cabo de un momento no se ha movido
  // nada, se salta de golpe. Llegar de golpe es peor que llegar suave; no
  // llegar es mucho peor que las dos.
  const antes = document.scrollingElement?.scrollTop ?? 0;
  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  destino.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  if (!suave) return;
  window.setTimeout(() => {
    if ((document.scrollingElement?.scrollTop ?? 0) === antes) {
      destino.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, 250);
}

function IndiceDeLaRevision({ pendientes }: { pendientes: number }) {
  const irA = irAlBloque;
  return (
    <nav aria-label="Secciones de la revisión" className="-mx-1 flex gap-2 overflow-x-auto hide-scrollbar px-1 pb-1">
      {SECCIONES_REVISION.map(s => (
        <button
          key={s.id}
          type="button"
          onClick={() => irA(s.id)}
          className="flex-none flex items-center gap-1.5 rounded-chip bg-hairline px-3 py-2 font-mono text-caption uppercase text-ink-2 transition-colors hover:bg-strong hover:text-ink"
        >
          <Icon name={s.icono} size="s" />
          {s.label}
          {s.id === 'revision-cuestionarios' && pendientes > 0 && (
            <span className="rounded-full bg-warning/12 px-1.5 font-bold text-warning">{pendientes}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const esteAnio = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short',
    ...(esteAnio ? {} : { year: 'numeric' }),
  });
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

  // Revisión de esta semana (K-01) y todo lo que la alimenta: un solo hook
  // compartido con la hoja del «+» y el contador de la barra (mismas claves de
  // caché, una lectura). El peso más reciente solo sirve aquí para rellenar la
  // pregunta 'metric' bodyweight de los cuestionarios: el registro del peso vive
  // en BodyweightPanel (Perfil).
  const {
    revision, ultimoPeso, rawAssignments, assignments, responses, templates, scheduleCtx, loadingQ,
    photoAssignments, loadingPhotoAssignments,
    progreso, guardarBorrador, marcarEnviada,
  } = useRevisionDeLaSemana(profile.email);
  const latestWeight = ultimoPeso?.weight;
  const responsesKey = ['responsesForAthlete', profile.email] as const;

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
    const finSemana = finDeEstaSemana();
    return assignments
      .map(a => {
        const vencido = isOverdue(a, scheduleCtx);
        const respondido = hasAnsweredThisOccurrence(a, responses, scheduleCtx);
        const estado: 'pendiente' | 'aldia' | 'programado' =
          vencido && !respondido ? 'pendiente' : respondido ? 'aldia' : 'programado';
        return { a, estado, ultima: ultimaPorAsignacion.get(a.id) ?? null };
      })
      // Un "programado" solo interesa al atleta si le toca esta semana — uno
      // que cae dentro de tres meses (p.ej. una revisión de semana 10 del
      // plan) no aporta nada en su lista de hoy, solo la alarga. Vencidos y
      // ya respondidos se quedan siempre: no dependen de una fecha futura.
      .filter(({ a, estado }) => {
        if (estado !== 'programado') return true;
        const proxima = proximaOcurrencia(a, scheduleCtx);
        return proxima !== null && startOfDay(proxima).getTime() <= finSemana.getTime();
      })
      .sort((x, y) => {
        const peso = { pendiente: 0, programado: 1, aldia: 2 } as const;
        if (peso[x.estado] !== peso[y.estado]) return peso[x.estado] - peso[y.estado];
        return (templates.get(x.a.questionnaireId)?.title ?? '').localeCompare(templates.get(y.a.questionnaireId)?.title ?? '');
      });
  }, [assignments, responses, scheduleCtx, templates]);

  // El cuestionario que alimenta la ficha de Mediciones: el que lleva alguna
  // pregunta 'metric' que no sea el peso (ese vive en su propio panel). Se
  // busca entre las asignaciones, NO en `listaCuestionarios`: esa lista esconde
  // los programados que no caen esta semana, y uno mensual (día 26) queda
  // fuera del 1 al 25 de cada mes — justo cuando el atleta mira su ficha y la
  // ve vacía sin ningún botón para rellenarla.
  const cuestionarioMediciones = useMemo(() => {
    const a = assignments.find(x =>
      templates.get(x.questionnaireId)?.questions.some(q => q.type === 'metric' && q.metricKey && q.metricKey !== 'bodyweight')
    );
    return a ? { a, pendiente: pendingAssignments.some(p => p.id === a.id) } : null;
  }, [assignments, templates, pendingAssignments]);

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

  const { showToast } = useToast();
  const historial = useMemo(
    () => historialDeRevisiones(responses, progreso?.incompleta ? [{ ciclo: progreso.ciclo, incompleta: true }] : []),
    [responses, progreso],
  );

  const abrirPaso = (paso: PasoRevision) => {
    if (paso.tipo === 'cuestionario') {
      const a = assignments.find(x => x.id === paso.assignmentId);
      if (a) { setActiveAssignment(a); window.setTimeout(() => irAlBloque('revision-wizard'), 60); }
      return;
    }
    irAlBloque(paso.tipo === 'peso' ? 'revision-peso' : 'revision-fotos');
  };
  const enviarRevision = (incompleta: boolean) => {
    marcarEnviada(incompleta);
    showToast(incompleta ? 'Revisión enviada. Queda incompleta hasta que termines lo que falta.' : 'Revisión enviada. Tu coach ya puede verla.', 'success');
  };

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
    <div className="pantalla pantalla-b space-y-6">
      {/* Tu revisión de esta semana: el recorrido único (K-03). Se oculta sola
          fuera de la ventana de revisión (viernes a lunes). */}
      {!loadingQ && !loadingPhotoAssignments && (
        <div className="protagonista">
        <RevisionDeLaSemana
          revision={revision}
          enviada={!!progreso?.enviadaEn}
          onAbrirPaso={abrirPaso}
          onEnviar={enviarRevision}
        />
        </div>
      )}

      {/* Peso corporal (handoff §1) — primera sección, antes del check-in
          semanal. Vive aquí (no en ProfileScreen) para que sea el mismo
          único sitio para pesarse tanto desde Perfil › Progreso como desde
          la ruta /checkin a la que saltan las tareas pendientes de Home:
          antes esa ruta no tenía ningún input de peso y el atleta no podía
          añadirlo al entrar a responder un cuestionario desde ahí. */}
      <div id="revision-peso" className="scroll-mt-20">
        <Suspense fallback={<Skeleton className="w-full h-48 rounded-surface" />}>
          <BodyweightPanel athleteEmail={profile.email} />
        </Suspense>
      </div>

      {/* Su objetivo y cómo va, justo debajo del peso que lo alimenta. Solo
          aparece si el coach ha confirmado el objetivo de la fase. */}
      <Suspense fallback={null}>
        <MiObjetivo athleteEmail={profile.email} />
      </Suspense>

      <div>
        <h1 className="font-display font-black text-title-l uppercase tracking-tight text-ink">Revisión</h1>
        <p className="text-ink-2 text-body-s mt-1">Tu peso, tus cuestionarios, tus fotos y tus medidas: todo lo que le cuentas a tu coach, en un solo sitio.</p>
      </div>

      {/* Índice. Esta pantalla juntó cinco cosas que antes vivían en sitios
          distintos y quedó muy larga: el atleta que entra a subir una foto
          tiene que deslizar por sus cuestionarios, su peso y sus medidas para
          encontrarla. Con esto va directo. No se pliegan los bloques a
          propósito: plegar esconde lo que sí venía a ver de paso. */}
      <IndiceDeLaRevision pendientes={pendingAssignments.length} />

      {/* Questionnaire active form */}
      {activeAssignment && templates.get(activeAssignment.questionnaireId) && (
        <div id="revision-wizard" className="scroll-mt-20">
          <QuestionnaireWizard
            questionnaire={templates.get(activeAssignment.questionnaireId)!}
            assignment={activeAssignment}
            athleteEmail={profile.email}
            currentWeight={latestWeight}
            borrador={progreso?.respuestas[activeAssignment.id] ?? null}
            onBorrador={b => guardarBorrador(activeAssignment.id, b)}
            onSubmitted={handleQuestionnaireSubmitted}
            onCancel={() => setActiveAssignment(null)}
          />
        </div>
      )}

      {/* ── Cuestionarios (todos, no solo los vencidos) ──────────────────────
          Antes solo se pintaba la lista de VENCIDOS y un desplegable de solo
          lectura con los futuros: los ya respondidos y los programados no se
          podían ni ver ni abrir desde ninguna parte del perfil del atleta. */}
      {!activeAssignment && (
        <section id="revision-cuestionarios" className="space-y-3 scroll-mt-20">
          <div className="flex items-center gap-2">
            <Icon name="quiz" size="m" className="text-accent-ink" />
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
                      <span className={`material-symbols-outlined text-title-m ${estado === 'pendiente' ? 'text-warning' : estado === 'aldia' ? 'text-success' : 'text-ink-2'}`}>{info.icono}</span>
                    </span>
                    {/* El estado va DEBAJO del título, no a su derecha: en
                        móvil una insignia de ~110 px dejaba el título en
                        «DOM's o "ag…» y la periodicidad en un guion. */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-sans font-semibold text-body-s text-ink">{q.title}</p>
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
                    <span className="material-symbols-outlined text-ink-3 group-hover:text-accent-ink transition-colors shrink-0 self-center">chevron_right</span>
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
                <span className="font-sans font-bold text-body-s text-ink">
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
                        <p className="font-sans font-bold text-ink text-label truncate">
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
                              <p className="font-sans text-label text-ink leading-relaxed">{textoRespuesta(pregunta, ans.value)}</p>
                            </div>
                          );
                        }
                        return (
                          <div key={ans.questionId} className="flex items-start gap-3">
                            <span className="font-sans text-caption text-ink-2 flex-1">{pregunta?.label ?? ans.questionId}</span>
                            <span className="font-mono text-label text-ink font-bold text-right shrink-0">
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

      {/* Historial de revisiones (K-04): qué semanas se enviaron y cómo quedaron. */}
      {!activeAssignment && <HistorialDeRevisiones revisiones={historial} />}

      {/* Upcoming (not-yet-due) recurring photo check-ins */}
      {!loadingPhotoAssignments && upcomingPhotoAssignments.length > 0 && (
        <details className="group bg-surface border border-hairline rounded-field p-4">
          <summary className="cursor-pointer list-none flex items-center justify-between">
            <span className="font-sans font-bold text-body-s text-ink">
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
      <section id="revision-fotos" className="scroll-mt-20">
        <h2 className="font-sans font-bold text-body-s text-ink mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-ink text-title-m">photo_camera</span>
          Fotografías de progreso
        </h2>
        <PhotosScreen profile={profile} />
      </section>

      {/* ── Mediciones y evolución (antes vivían en ProfileScreen) ───────────
          Se mueven aquí para que la ruta /checkin —a la que saltan las tareas
          pendientes de Inicio— enseñe lo mismo que Perfil › Revisión, y para
          que todo lo que el atleta apunta o consulta de su seguimiento esté
          en una sola pantalla. */}
      <section id="revision-mediciones" className="space-y-3 scroll-mt-20">
        <div className="flex items-center gap-2">
          <Icon name="straighten" size="m" className="text-accent-ink" />
          <h2 className="font-sans font-bold text-body-s text-ink flex-1">Mediciones</h2>
          {cuestionarioMediciones?.pendiente && <Badge tone="warning">Pendiente</Badge>}
        </div>
        {cuestionarioMediciones && (
          <Button
            variant="secondary"
            icon="straighten"
            fullWidth
            onClick={() => {
              setActiveAssignment(cuestionarioMediciones.a);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {cuestionarioMediciones.pendiente ? 'Responder cuestionario de mediciones' : 'Registrar mis medidas'}
          </Button>
        )}
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
      <section id="revision-historial" className="scroll-mt-20">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="material-symbols-outlined text-accent-ink text-title-m">history</span>
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
                          <span className="material-symbols-outlined animate-spin text-accent-ink text-label">sync</span>
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
