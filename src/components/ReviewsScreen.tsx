import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { WeightCheckIn, QuestionnaireResponse, Questionnaire } from '../types';
import { getAllUserProfiles, submitCoachFeedback, getQuestionnairesByCoach, getResponsesByQuestionnaireIds, getQuickReplies, saveQuickReplies } from '../dbService';
import { usePendingReviews } from '../hooks/usePendingReviews';

interface ReviewsScreenProps {
  checkins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  coachId: string;
  coachEmail: string;
}

type UnifiedItem =
  | { kind: 'checkin'; sortKey: number; data: WeightCheckIn }
  | { kind: 'response'; sortKey: number; data: QuestionnaireResponse; questionnaire?: Questionnaire };

export default function ReviewsScreen({ checkins, onRefreshCheckIns, coachId, coachEmail }: ReviewsScreenProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Shared 'userProfiles' cache key (same as CommandPalette/MesocycleManager).
  const { data: athletes = [] } = useQuery({
    queryKey: ['userProfiles'],
    queryFn: getAllUserProfiles,
  });

  const quickRepliesKey = ['quickReplies'] as const;
  const { data: quickReplies = [] } = useQuery({
    queryKey: quickRepliesKey,
    queryFn: getQuickReplies,
  });

  const { data: questionnaires = [], isPending: loadingQuestionnaires } = useQuery({
    queryKey: ['questionnairesByCoach', coachId],
    queryFn: () => getQuestionnairesByCoach(coachId),
    enabled: !!coachId,
  });
  const questionnaireIds = useMemo(() => questionnaires.map(q => q.id), [questionnaires]);
  const { data: allResponses = [], isPending: loadingResponsesQuery } = useQuery({
    queryKey: ['responsesByQuestionnaireIds', questionnaireIds],
    queryFn: () => getResponsesByQuestionnaireIds(questionnaireIds),
    enabled: !!coachId && questionnaireIds.length > 0,
  });
  // Mirrors the old effect's loading flag: true while questionnaires load, and
  // (only if there are any) while their responses load too.
  const loadingResponses = loadingQuestionnaires || (questionnaireIds.length > 0 && loadingResponsesQuery);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  // What feedbackText was pre-filled with when this row was expanded (or just
  // saved to) — compared against the live textarea value to know whether
  // switching/collapsing rows would silently throw away an unsent draft.
  const [feedbackDraftOriginal, setFeedbackDraftOriginal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Plantillas de feedback rápido — se insertan con un clic en vez de
  // escribir la misma directriz una y otra vez para cada atleta.
  const [showQuickReplyManager, setShowQuickReplyManager] = useState(false);
  const [quickReplyDraft, setQuickReplyDraft] = useState<string[]>([]);
  const [savingQuickReplies, setSavingQuickReplies] = useState(false);

  const openQuickReplyManager = () => {
    setQuickReplyDraft(quickReplies.length > 0 ? [...quickReplies] : ['']);
    setShowQuickReplyManager(true);
  };

  const saveQuickReplyManager = async () => {
    const cleaned = quickReplyDraft.map(r => r.trim()).filter(Boolean);
    setSavingQuickReplies(true);
    try {
      await saveQuickReplies(cleaned);
      queryClient.setQueryData(quickRepliesKey, cleaned);
      setShowQuickReplyManager(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingQuickReplies(false);
    }
  };

  const insertQuickReply = (text: string) => {
    setFeedbackText(prev => prev.trim().length > 0 ? `${prev.trim()}\n${text}` : text);
  };

  const getAthleteProfile = (emailOrUserId: string) =>
    athletes.find(a => a.userId === emailOrUserId || a.email.toLowerCase() === emailOrUserId.toLowerCase());

  const getAthleteName = (emailOrUserId: string) => {
    const profile = getAthleteProfile(emailOrUserId);
    return profile?.displayName || emailOrUserId.split('@')[0];
  };

  // Build unified chronological list (oldest first)
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [
      ...checkins.map(c => ({
        kind: 'checkin' as const,
        sortKey: c.timestamp instanceof Date
          ? c.timestamp.getTime()
          : (c.timestamp as any)?.toDate?.()?.getTime?.() ?? new Date(c.timestamp as any).getTime(),
        data: c,
      })),
      ...allResponses.map(r => ({
        kind: 'response' as const,
        sortKey: new Date(r.submittedAt).getTime(),
        data: r,
        questionnaire: questionnaires.find(q => q.id === r.questionnaireId),
      })),
    ];
    return items.sort((a, b) => a.sortKey - b.sortKey);
  }, [checkins, allResponses, questionnaires]);

  const pendingCount = usePendingReviews(checkins).length;

  // Checkins pendientes en el mismo orden que la lista (más antiguo primero) —
  // base para "Responder y siguiente": en vez de responder, volver a la lista
  // y buscar el próximo pendiente a mano, el coach encadena uno tras otro sin
  // salir del panel de feedback. Es el flujo más frecuente del día a día.
  const pendingCheckinItems = useMemo(
    () => unifiedItems.filter((i): i is Extract<UnifiedItem, { kind: 'checkin' }> => i.kind === 'checkin' && !i.data.approved),
    [unifiedItems]
  );

  const expandedRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expandedId) expandedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [expandedId]);

  // No toca errorMsg/successMsg — se usa también para encadenar al siguiente
  // pendiente justo después de fijar el mensaje de éxito del envío anterior;
  // si lo limpiara aquí, ese mensaje desaparecería antes de llegar a pintarse.
  const openCheckinRow = (checkin: WeightCheckIn) => {
    setExpandedId(`c_${checkin.id}`);
    setFeedbackText(checkin.coachFeedback || '');
    setFeedbackDraftOriginal(checkin.coachFeedback || '');
  };

  const startReviewing = () => {
    if (pendingCheckinItems.length === 0) return;
    setErrorMsg('');
    setSuccessMsg('');
    openCheckinRow(pendingCheckinItems[0].data);
  };

  const goToAthleteProfile = (email: string) => {
    const hasUnsentDraft = expandedId !== null && feedbackText !== feedbackDraftOriginal;
    if (hasUnsentDraft && !window.confirm('Tienes feedback sin enviar para este check-in. ¿Descartarlo y continuar?')) {
      return;
    }
    navigate(`/clients/${encodeURIComponent(email)}`);
  };

  const handleSendFeedback = async (checkInId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) { setErrorMsg('Escribe tu feedback para el atleta.'); return; }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      await submitCoachFeedback(checkInId, feedbackText);
      onRefreshCheckIns();
      // Encadena al siguiente pendiente (mismo orden que la lista) en vez de
      // dejar al coach donde estaba — así procesar la bandeja es "enviar,
      // enviar, enviar" sin volver a buscar el próximo a mano.
      const idx = pendingCheckinItems.findIndex(i => i.data.id === checkInId);
      const next = idx >= 0 ? pendingCheckinItems[idx + 1] : undefined;
      if (next) {
        openCheckinRow(next.data);
        setSuccessMsg('¡Feedback enviado! Siguiente pendiente ↓');
      } else {
        setExpandedId(null);
        setSuccessMsg('¡Feedback enviado y check-in aprobado! Todo revisado 🎉');
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al guardar. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-hairline gap-4">
        <div>
          <h1 className="font-sans font-extrabold text-display tracking-tight text-white uppercase">Revisiones</h1>
          <p className="text-ink-2 text-body-s mt-1">
            Historial cronológico de check-ins y respuestas de cuestionarios.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-caption bg-orange-500/10 text-orange-300 border border-orange-500/20 px-3 py-1.5 rounded-surface font-sans font-bold uppercase">
                <span className="material-symbols-outlined text-body-s">pending_actions</span>
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={startReviewing}
                className="flex items-center gap-1.5 text-label bg-accent text-black px-3.5 py-2 rounded-control font-sans font-bold uppercase tracking-wide hover:bg-accent-press active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-title-s">rate_review</span>
                Empezar a revisar
              </button>
            </>
          )}
          {loadingResponses && (
            <span className="font-sans text-caption text-ink-2 animate-pulse">Cargando respuestas...</span>
          )}
        </div>
      </header>

      {successMsg && (
        <div className="bg-accent/15 border border-accent/30 text-white p-4 rounded-surface text-body-s flex items-center gap-2">
          <span className="material-symbols-outlined text-accent">check_circle</span>
          <p>{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-surface text-label font-mono">{errorMsg}</div>
      )}

      {unifiedItems.length === 0 && !loadingResponses ? (
        <div className="bg-bg border border-dashed border-hairline rounded-surface p-16 text-center text-ink-2">
          <span className="material-symbols-outlined text-display text-accent mb-2 block">verified_user</span>
          <p className="text-body-s font-bold text-white">¡Sin revisiones todavía!</p>
          <p className="text-label mt-1">Los check-ins y respuestas de tus atletas aparecerán aquí en cuanto los envíen desde su app.</p>
        </div>
      ) : (
        <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
          <div className="p-4 border-b border-hairline bg-raised flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-body-s">history_edu</span>
            <h3 className="font-sans font-bold text-title-s text-white uppercase tracking-wide">Historial unificado</h3>
            <span className="font-mono text-caption text-ink-2 ml-1">({unifiedItems.length} entradas, más antiguo primero)</span>
          </div>
          <div className="divide-y divide-hairline/40">
            {unifiedItems.map(item => {
              const key = item.kind === 'checkin' ? `c_${item.data.id}` : `r_${item.data.id}`;
              const isExpanded = expandedId === key;

              const toggle = () => {
                const hasUnsentDraft = expandedId !== null && feedbackText !== feedbackDraftOriginal;
                if (hasUnsentDraft && !window.confirm('Tienes feedback sin enviar para este check-in. ¿Descartarlo y continuar?')) {
                  return;
                }
                if (isExpanded) {
                  setExpandedId(null);
                } else {
                  setExpandedId(key);
                  if (item.kind === 'checkin') {
                    setFeedbackText(item.data.coachFeedback || '');
                    setFeedbackDraftOriginal(item.data.coachFeedback || '');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }
                }
              };

              if (item.kind === 'checkin') {
                const c = item.data;
                const athleteName = getAthleteName(c.email || c.userId);
                const athleteProfile = getAthleteProfile(c.email || c.userId);
                const pendingIdx = pendingCheckinItems.findIndex(i => i.data.id === c.id);
                const hasNextPending = pendingIdx >= 0 && pendingIdx < pendingCheckinItems.length - 1;

                return (
                  <div key={key} ref={isExpanded ? expandedRowRef : undefined}>
                    <div
                      onClick={toggle}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-raised ${isExpanded ? 'bg-raised' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-hairline flex-shrink-0">
                        <img
                          src={athleteProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200'}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span
                        className="material-symbols-outlined flex-shrink-0 text-title-m"
                        style={{ color: c.approved ? 'var(--color-accent)' : 'var(--color-warning)', fontVariationSettings: "'FILL' 1" }}
                      >rate_review</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-sans font-bold text-white text-label">{athleteName}</span>
                          <span className="font-mono text-caption text-ink-2">Check-in · {c.dateStr}</span>
                          <span className={`text-caption font-mono font-bold uppercase px-1.5 py-0.5 rounded-control flex-shrink-0 ${
                            c.approved ? 'bg-emerald-500/10 text-emerald-300' : 'bg-orange-500/10 text-orange-300'
                          }`}>
                            {c.approved ? 'Revisado' : 'Pendiente'}
                          </span>
                        </div>
                        <p className="font-mono text-caption text-ink-2 mt-0.5">
                          {c.weight} kg · {c.adherence} · {c.mood}
                        </p>
                      </div>
                      {athleteProfile && (
                        <button
                          onClick={(e) => { e.stopPropagation(); goToAthleteProfile(athleteProfile.email); }}
                          title="Ver perfil completo"
                          className="flex-shrink-0 p-1.5 rounded-control text-ink-2 hover:text-accent hover:bg-raised transition-colors"
                        >
                          <span className="material-symbols-outlined text-title-s">account_circle</span>
                        </button>
                      )}
                      <span
                        className="material-symbols-outlined text-ink-2 text-body-s transition-transform flex-shrink-0"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >expand_more</span>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 bg-bg border-t border-hairline space-y-3">
                        <div className="grid grid-cols-3 gap-2 font-mono text-label">
                          {[
                            { label: 'Peso', value: `${c.weight} kg`, color: 'text-white' },
                            { label: 'Adherencia', value: c.adherence, color: 'text-accent' },
                            { label: 'Humor', value: c.mood || '😊', color: 'text-white' },
                          ].map(cell => (
                            <div key={cell.label} className="bg-raised p-2.5 rounded-surface border border-hairline">
                              <span className="block text-ink-2 text-caption uppercase">{cell.label}</span>
                              <strong className={cell.color}>{cell.value}</strong>
                            </div>
                          ))}
                        </div>
                        {c.notes && (
                          <div className="bg-surface p-3 rounded-surface border border-hairline">
                            <span className="block font-mono text-caption text-ink-2 uppercase mb-1">Notas del atleta</span>
                            <p className="text-label text-slate-300 font-sans italic">"{c.notes}"</p>
                          </div>
                        )}
                        {successMsg && expandedId === key && (
                          <div className="bg-accent/15 border border-accent/30 text-white p-3 rounded-surface text-label flex items-center gap-2">
                            <span className="material-symbols-outlined text-accent text-body-s">check_circle</span>
                            {successMsg}
                          </div>
                        )}
                        {errorMsg && expandedId === key && (
                          <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-surface text-label font-mono">{errorMsg}</div>
                        )}
                        {pendingIdx >= 0 && pendingCheckinItems.length > 1 && (
                          <p className="font-mono text-caption text-ink-2 uppercase tracking-wider">
                            Revisando {pendingIdx + 1} de {pendingCheckinItems.length} pendientes
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {quickReplies.map((r, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => insertQuickReply(r)}
                              title={r}
                              className="max-w-[180px] truncate text-caption font-mono text-ink-2 hover:text-accent hover:border-accent/40 border border-hairline px-2 py-1 rounded-control transition-all"
                            >
                              {r}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={openQuickReplyManager}
                            title="Gestionar plantillas de feedback"
                            className="text-ink-2/60 hover:text-white p-1"
                          >
                            <span className="material-symbols-outlined text-body-s">tune</span>
                          </button>
                        </div>
                        <form onSubmit={(e) => handleSendFeedback(c.id, e)} className="space-y-2">
                          <textarea
                            value={expandedId === key ? feedbackText : (c.coachFeedback || '')}
                            onChange={e => setFeedbackText(e.target.value)}
                            placeholder="Escribe tu feedback para el atleta..."
                            className="w-full bg-raised border border-hairline rounded-control p-3 text-body-s text-white focus:ring-1 focus:ring-accent focus:outline-none min-h-[80px] resize-none font-sans"
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-[36px] px-5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control flex items-center gap-1.5 hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
                          >
                            {isSubmitting ? 'Guardando...' : hasNextPending ? 'Enviar y siguiente' : 'Enviar y Aprobar'}
                            <span className="material-symbols-outlined text-body-s">{hasNextPending ? 'skip_next' : 'send'}</span>
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              }

              // Response item
              const r = item.data;
              const q = item.questionnaire;
              const athleteName = getAthleteName(r.athleteId);
              const athleteProfile = getAthleteProfile(r.athleteId);
              const submittedDate = new Date(r.submittedAt).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'short', year: 'numeric',
              });
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
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-hairline flex-shrink-0">
                      <img
                        src={athleteProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200'}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span
                      className="material-symbols-outlined flex-shrink-0 text-title-m"
                      style={{ color: 'var(--color-data)', fontVariationSettings: "'FILL' 1" }}
                    >quiz</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-sans font-bold text-white text-label">{athleteName}</span>
                        <span className="font-mono text-caption text-ink-2">{q?.title ?? 'Cuestionario'} · {submittedDate}</span>
                      </div>
                      {previewAnswers && (
                        <p className="font-mono text-caption text-ink-2 mt-0.5 truncate">{previewAnswers}</p>
                      )}
                    </div>
                    {athleteProfile && (
                      <button
                        onClick={(e) => { e.stopPropagation(); goToAthleteProfile(athleteProfile.email); }}
                        title="Ver perfil completo"
                        className="flex-shrink-0 p-1.5 rounded-control text-ink-2 hover:text-accent hover:bg-raised transition-colors"
                      >
                        <span className="material-symbols-outlined text-title-s">account_circle</span>
                      </button>
                    )}
                    <span
                      className="material-symbols-outlined text-ink-2 text-body-s transition-transform flex-shrink-0"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >expand_more</span>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 bg-bg border-t border-hairline space-y-2">
                      {r.answers.map(ans => {
                        const question = q?.questions.find(qq => qq.id === ans.questionId);
                        return (
                          <div key={ans.questionId} className="flex items-start gap-3">
                            <span className="font-mono text-caption text-ink-2 flex-1 pt-0.5">
                              {question?.label ?? ans.questionId}
                            </span>
                            <span className="font-mono text-label text-white font-bold text-right">
                              {String(ans.value)}{question?.unit ? ` ${question.unit}` : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showQuickReplyManager && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-surface border border-hairline rounded-surface w-full max-w-md p-5 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="font-sans font-bold text-white text-body-s">Plantillas de feedback</h3>
              <button onClick={() => setShowQuickReplyManager(false)} className="text-ink-2 hover:text-white">
                <span className="material-symbols-outlined text-title-s">close</span>
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1">
              {quickReplyDraft.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={r}
                    onChange={e => setQuickReplyDraft(prev => prev.map((x, xi) => xi === i ? e.target.value : x))}
                    placeholder="ej. Buen trabajo esta semana, sigue así."
                    className="flex-1 bg-raised border border-hairline rounded-control px-3 py-2 text-label text-white focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={() => setQuickReplyDraft(prev => prev.filter((_, xi) => xi !== i))}
                    className="text-ink-2 hover:text-red-300 p-1 flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-title-s">delete</span>
                  </button>
                </div>
              ))}
              <button
                onClick={() => setQuickReplyDraft(prev => [...prev, ''])}
                className="flex items-center gap-1.5 text-label font-mono text-accent hover:text-white"
              >
                <span className="material-symbols-outlined text-body-s">add</span>
                Añadir plantilla
              </button>
            </div>
            <button
              onClick={saveQuickReplyManager}
              disabled={savingQuickReplies}
              className="w-full py-2.5 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-50"
            >
              {savingQuickReplies ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
