import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserProfile, WeightCheckIn, QuestionnaireResponse, Questionnaire } from '../types';
import { getAllUserProfiles, submitCoachFeedback, getQuestionnairesByCoach, getResponsesByQuestionnaireIds } from '../dbService';
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
  const [athletes, setAthletes] = useState<UserProfile[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [allResponses, setAllResponses] = useState<QuestionnaireResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  // What feedbackText was pre-filled with when this row was expanded (or just
  // saved to) — compared against the live textarea value to know whether
  // switching/collapsing rows would silently throw away an unsent draft.
  const [feedbackDraftOriginal, setFeedbackDraftOriginal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load athletes
  useEffect(() => {
    getAllUserProfiles().then(setAthletes).catch(console.error);
  }, []);

  // Load questionnaires + responses whenever coachId changes
  useEffect(() => {
    if (!coachId) return;
    setLoadingResponses(true);
    getQuestionnairesByCoach(coachId)
      .then(async (qs) => {
        setQuestionnaires(qs);
        if (qs.length > 0) {
          const ids = qs.map(q => q.id);
          const responses = await getResponsesByQuestionnaireIds(ids);
          setAllResponses(responses);
        } else {
          setAllResponses([]);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingResponses(false));
  }, [coachId]);

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

  const goToAthleteProfile = (email: string) => {
    const hasUnsentDraft = expandedId !== null && feedbackText !== feedbackDraftOriginal;
    if (hasUnsentDraft && !window.confirm('Tienes feedback sin enviar para este check-in. ¿Descartarlo y continuar?')) {
      return;
    }
    navigate(`/clients/${encodeURIComponent(email)}`);
  };

  const handleSendFeedback = async (checkInId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) { setErrorMsg('Ingresa una directriz para el atleta.'); return; }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      await submitCoachFeedback(checkInId, feedbackText);
      setSuccessMsg('¡Directiva enviada y check-in aprobado!');
      setFeedbackDraftOriginal(feedbackText);
      onRefreshCheckIns();
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
      <header className="flex flex-col md:flex-row md:items-end justify-between pb-4 border-b border-white/60 gap-4">
        <div>
          <h1 className="font-sans font-black text-3xl tracking-tight text-white uppercase">Revisiones</h1>
          <p className="text-[#c6c9ab] text-sm mt-1">
            Historial cronológico de check-ins y respuestas de cuestionarios.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] bg-orange-500/10 text-orange-300 border border-orange-500/20 px-3 py-1.5 rounded-lg font-sans font-bold uppercase">
              <span className="material-symbols-outlined text-sm">pending_actions</span>
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
          {loadingResponses && (
            <span className="font-mono text-[10px] text-[#c6c9ab] animate-pulse">Cargando respuestas...</span>
          )}
        </div>
      </header>

      {successMsg && (
        <div className="bg-[#fbcb1a]/15 border border-[#fbcb1a]/30 text-white p-4 rounded-xl text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[#fbcb1a]">check_circle</span>
          <p>{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-xl text-xs font-mono">{errorMsg}</div>
      )}

      {unifiedItems.length === 0 && !loadingResponses ? (
        <div className="bg-[#111110] border border-dashed border-white/7 rounded-xl p-16 text-center text-[#c6c9ab]">
          <span className="material-symbols-outlined text-4xl text-[#fbcb1a] mb-2 block">verified_user</span>
          <p className="text-sm font-bold text-white">¡Sin revisiones todavía!</p>
          <p className="text-xs mt-1">Los check-ins y respuestas de tus atletas aparecerán aquí en cuanto los envíen desde su app.</p>
        </div>
      ) : (
        <div className="bg-[#181816] border border-white/7 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/7 bg-[#1c1b1b] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#fbcb1a] text-sm">history_edu</span>
            <h3 className="font-sans font-bold text-base text-white uppercase tracking-wide">Historial unificado</h3>
            <span className="font-mono text-[9px] text-[#c6c9ab] ml-1">({unifiedItems.length} entradas, más antiguo primero)</span>
          </div>
          <div className="divide-y divide-[#2a2a2a]/40">
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

                return (
                  <div key={key}>
                    <div
                      onClick={toggle}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-[#1e1e1b] ${isExpanded ? 'bg-[#1e1e1b]' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-white/7 flex-shrink-0">
                        <img
                          src={athleteProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200'}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span
                        className="material-symbols-outlined flex-shrink-0 text-lg"
                        style={{ color: c.approved ? '#fbcb1a' : '#fb923c', fontVariationSettings: "'FILL' 1" }}
                      >rate_review</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-sans font-bold text-white text-xs">{athleteName}</span>
                          <span className="font-mono text-[9px] text-[#c6c9ab]">Check-in · {c.dateStr}</span>
                          <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                            c.approved ? 'bg-emerald-500/10 text-emerald-300' : 'bg-orange-500/10 text-orange-300'
                          }`}>
                            {c.approved ? 'Revisado' : 'Pendiente'}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5">
                          {c.weight} kg · {c.adherence} · {c.mood}
                        </p>
                      </div>
                      {athleteProfile && (
                        <button
                          onClick={(e) => { e.stopPropagation(); goToAthleteProfile(athleteProfile.email); }}
                          title="Ver perfil completo"
                          className="flex-shrink-0 p-1.5 rounded-lg text-[#c6c9ab] hover:text-[#fbcb1a] hover:bg-[#1c1b1b] transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">account_circle</span>
                        </button>
                      )}
                      <span
                        className="material-symbols-outlined text-[#c6c9ab] text-sm transition-transform flex-shrink-0"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >expand_more</span>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 bg-[#111111] border-t border-white/40 space-y-3">
                        <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                          {[
                            { label: 'Peso', value: `${c.weight} kg`, color: 'text-white' },
                            { label: 'Adherencia', value: c.adherence, color: 'text-[#fbcb1a]' },
                            { label: 'Humor', value: c.mood || '😊', color: 'text-white' },
                          ].map(cell => (
                            <div key={cell.label} className="bg-[#1e1e1b] p-2.5 rounded-xl border border-white/40">
                              <span className="block text-[#c6c9ab] text-[10px] uppercase">{cell.label}</span>
                              <strong className={cell.color}>{cell.value}</strong>
                            </div>
                          ))}
                        </div>
                        {c.notes && (
                          <div className="bg-[#181818] p-3 rounded-lg border border-white/30">
                            <span className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Notas del atleta</span>
                            <p className="text-xs text-slate-300 font-sans italic">"{c.notes}"</p>
                          </div>
                        )}
                        {successMsg && expandedId === key && (
                          <div className="bg-[#fbcb1a]/15 border border-[#fbcb1a]/30 text-white p-3 rounded-lg text-xs flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#fbcb1a] text-sm">check_circle</span>
                            {successMsg}
                          </div>
                        )}
                        {errorMsg && expandedId === key && (
                          <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs font-mono">{errorMsg}</div>
                        )}
                        <form onSubmit={(e) => handleSendFeedback(c.id, e)} className="space-y-2">
                          <textarea
                            value={expandedId === key ? feedbackText : (c.coachFeedback || '')}
                            onChange={e => setFeedbackText(e.target.value)}
                            placeholder="Escribe tu directriz para el atleta..."
                            className="w-full bg-[#1c1b1b] border border-white/60 rounded p-3 text-sm text-white focus:ring-1 focus:ring-[#fbcb1a] focus:outline-none min-h-[80px] resize-none font-sans"
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="h-[36px] px-5 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded flex items-center gap-1.5 hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
                          >
                            {isSubmitting ? 'Guardando...' : 'Enviar y Aprobar'}
                            <span className="material-symbols-outlined text-sm">send</span>
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
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-[#1e1e1b] ${isExpanded ? 'bg-[#1e1e1b]' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-white/7 flex-shrink-0">
                      <img
                        src={athleteProfile?.avatarUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200'}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span
                      className="material-symbols-outlined flex-shrink-0 text-lg"
                      style={{ color: '#00eefc', fontVariationSettings: "'FILL' 1" }}
                    >quiz</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-sans font-bold text-white text-xs">{athleteName}</span>
                        <span className="font-mono text-[9px] text-[#c6c9ab]">{q?.title ?? 'Cuestionario'} · {submittedDate}</span>
                      </div>
                      {previewAnswers && (
                        <p className="font-mono text-[10px] text-[#c6c9ab] mt-0.5 truncate">{previewAnswers}</p>
                      )}
                    </div>
                    {athleteProfile && (
                      <button
                        onClick={(e) => { e.stopPropagation(); goToAthleteProfile(athleteProfile.email); }}
                        title="Ver perfil completo"
                        className="flex-shrink-0 p-1.5 rounded-lg text-[#c6c9ab] hover:text-[#fbcb1a] hover:bg-[#1c1b1b] transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">account_circle</span>
                      </button>
                    )}
                    <span
                      className="material-symbols-outlined text-[#c6c9ab] text-sm transition-transform flex-shrink-0"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >expand_more</span>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 bg-[#111111] border-t border-white/40 space-y-2">
                      {r.answers.map(ans => {
                        const question = q?.questions.find(qq => qq.id === ans.questionId);
                        return (
                          <div key={ans.questionId} className="flex items-start gap-3">
                            <span className="font-mono text-[9px] text-[#c6c9ab] flex-1 pt-0.5">
                              {question?.label ?? ans.questionId}
                            </span>
                            <span className="font-mono text-xs text-white font-bold text-right">
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
    </div>
  );
}
