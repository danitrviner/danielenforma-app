import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, WeightCheckIn, QuestionnaireAssignment, QuestionnaireResponse, Questionnaire, QuestionnaireQuestion, BodyweightLog } from '../types';
import { createNotificationDeduped, getAssignmentsForAthlete, getResponsesForAthlete, getQuestionnaireById, submitResponse, addBodyweight, getBodyweightForAthlete, updateBodyweight } from '../dbService';

const COACH_EMAIL = 'danitrviner@gmail.com';

// ── Questionnaire schedule helpers ────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDueToday(a: QuestionnaireAssignment): boolean {
  if (!a.schedule) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(a.startDate + 'T00:00:00');
  if (today < start) return false;

  const { type } = a.schedule;
  if (type === 'once') return a.startDate === todayStr();
  if (type === 'weekdays') return (a.schedule.weekdays ?? []).includes(today.getDay());
  if (type === 'interval') {
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
    return diff % (a.schedule.intervalDays ?? 7) === 0;
  }
  if (type === 'monthly') return today.getDate() === (a.schedule.dayOfMonth ?? 1);
  return false;
}

function hasAnsweredThisOccurrence(a: QuestionnaireAssignment, responses: QuestionnaireResponse[]): boolean {
  if (!a.schedule) return false;
  const mine = responses.filter(r => r.assignmentId === a.id);
  if (mine.length === 0) return false;
  const { type } = a.schedule;
  if (type === 'once') return true;
  const today = todayStr();
  if (type === 'weekdays' || type === 'interval') {
    return mine.some(r => r.submittedAt.slice(0, 10) === today);
  }
  if (type === 'monthly') {
    const ym = today.slice(0, 7);
    return mine.some(r => r.submittedAt.slice(0, 7) === ym);
  }
  return false;
}

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
    <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5 pb-2 border-b border-[#2a2a2a]">
        <h2 className="font-sans font-bold text-lg text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc]">assignment</span>
          {questionnaire.title}
        </h2>
        <button onClick={onCancel} className="text-[#c6c9ab] hover:text-white transition-colors p-1">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {questionnaire.description && (
        <p className="text-xs text-[#c6c9ab] mb-4 font-sans">{questionnaire.description}</p>
      )}

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs mb-4">{err}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {questionnaire.questions.map((q: QuestionnaireQuestion) => (
          <div key={q.id}>
            <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">
              {q.label}{q.required && ' *'}{q.unit && ` (${q.unit})`}
            </label>
            {q.helpText && <p className="text-[11px] text-[#c6c9ab]/70 mb-2">{q.helpText}</p>}

            {q.type === 'text' && (
              <textarea
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                maxLength={q.maxChars}
                placeholder="Escribe aquí..."
                className="w-full bg-[#1e1e1e] border-0 border-b border-[#2a2a2a] text-[#e5e2e1] text-xs p-2.5 focus:ring-0 focus:border-[#e2ff00] transition-colors min-h-[60px]"
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
                className="w-full bg-[#1e1e1e] border-0 border-b border-[#2a2a2a] text-white font-mono p-2.5 focus:ring-0 focus:border-[#e2ff00] transition-colors"
              />
            )}

            {q.type === 'scale' && (
              <div className="space-y-2">
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: (q.scaleMax ?? 10) - (q.scaleMin ?? 1) + 1 }, (_, i) => (q.scaleMin ?? 1) + i).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnswer(q.id, v)}
                      className={`w-9 h-9 rounded-lg font-mono text-xs font-bold transition-all ${
                        answers[q.id] === v
                          ? 'bg-[#e2ff00] text-black'
                          : 'bg-[#1e1e1e] text-[#c6c9ab] border border-[#2a2a2a] hover:border-[#e2ff00]/50'
                      }`}
                    >{v}</button>
                  ))}
                </div>
                {(q.scaleMinLabel || q.scaleMaxLabel) && (
                  <div className="flex justify-between text-[10px] font-mono text-[#c6c9ab]">
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
                    className={`flex-1 py-3 font-mono text-xs rounded-lg border transition-all min-h-[44px] ${
                      answers[q.id] === v
                        ? 'bg-[#e2ff00] text-black font-bold border-transparent'
                        : 'bg-[#1e1e1e] text-[#e5e2e1] border-[#2a2a2a]'
                    }`}
                  >{v ? (q.labelTrue ?? 'Sí') : (q.labelFalse ?? 'No')}</button>
                ))}
              </div>
            )}

            {q.type === 'choice' && q.options && (
              <div className="flex flex-col gap-1.5">
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
                    className={`w-full py-2.5 px-3 text-xs font-mono rounded-lg border text-left transition-all min-h-[44px] ${
                      isSelected
                        ? 'bg-[#e2ff00] text-black border-transparent font-bold'
                        : 'bg-[#1e1e1e] text-[#e5e2e1] border-[#2a2a2a]'
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
          className="w-full h-[44px] bg-[#e2ff00] text-black font-mono font-bold text-xs uppercase rounded-lg hover:bg-opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {saving ? 'Enviando...' : 'Enviar Respuesta'}
          <span className="material-symbols-outlined text-sm">send</span>
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

export default function CheckInScreen({ profile, checkins }: CheckInScreenProps) {
  // ── Quick bodyweight widget ────────────────────────────────────────────────
  const [bwToday, setBwToday]   = useState<BodyweightLog | null>(null);
  const [bwInput, setBwInput]   = useState('');
  const [bwEditing, setBwEditing] = useState(false);
  const [bwSaving, setBwSaving] = useState(false);
  const [bwError, setBwError]   = useState('');
  const bwInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBodyweightForAthlete(profile.email).then(logs => {
      const today = todayStr();
      const entry = logs.find(l => l.date === today) ?? null;
      setBwToday(entry);
      if (!entry) setBwEditing(true); // start in input mode if nothing logged yet
    }).catch(console.error);
  }, [profile.email]);

  useEffect(() => {
    if (bwEditing) bwInputRef.current?.focus();
  }, [bwEditing]);

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
        await updateBodyweight(bwToday.id, { weight: val });
        setBwToday(prev => prev ? { ...prev, weight: val } : prev);
      } else {
        const entry = await addBodyweight({
          athleteId: profile.email,
          date: today,
          weight: val,
          createdAt: new Date().toISOString(),
        });
        setBwToday(entry);
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
  const [assignments, setAssignments] = useState<QuestionnaireAssignment[]>([]);
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [templates, setTemplates] = useState<Map<string, Questionnaire>>(new Map());
  const [activeAssignment, setActiveAssignment] = useState<QuestionnaireAssignment | null>(null);
  const [loadingQ, setLoadingQ] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingQ(true);
    Promise.all([
      getAssignmentsForAthlete(profile.email),
      getResponsesForAthlete(profile.email),
    ]).then(async ([aList, rList]) => {
      if (cancelled) return;
      const active = aList.filter(a => a.active);
      setAssignments(active);
      setResponses(rList);
      const tMap = new Map<string, Questionnaire>();
      await Promise.all(
        [...new Set(active.map(a => a.questionnaireId))].map(async qId => {
          const q = await getQuestionnaireById(qId);
          if (q) tMap.set(q.id, q);
        })
      );
      if (!cancelled) setTemplates(tMap);
    }).catch(console.error).finally(() => { if (!cancelled) setLoadingQ(false); });
    return () => { cancelled = true; };
  }, [profile.email]);

  const pendingAssignments = assignments.filter(
    a => isDueToday(a) && !hasAnsweredThisOccurrence(a, responses)
  );

  const handleQuestionnaireSubmitted = (r: QuestionnaireResponse) => {
    setResponses(prev => [...prev, r]);
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
      <div className="bg-[#121212] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#00eefc]/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[#00eefc] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>scale</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">Peso de hoy</p>
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
                className="w-24 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#00eefc] placeholder-[#444]"
              />
              <span className="font-mono text-xs text-[#555]">kg</span>
            </div>
          )}
          {bwError && <p className="font-mono text-[10px] text-red-400 mt-1">{bwError}</p>}
        </div>

        {!bwEditing && bwToday ? (
          <button
            onClick={() => { setBwInput(String(bwToday.weight)); setBwEditing(true); }}
            className="flex-shrink-0 w-9 h-9 rounded-lg border border-[#2a2a2a] flex items-center justify-center text-[#c6c9ab] hover:text-white hover:border-[#3a3a3a] transition-all"
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
        <section className="bg-[#121212] border border-[#e2ff00]/20 rounded-xl p-4 sm:p-6">
          <h2 className="font-sans font-bold text-base text-white mb-3 pb-2 border-b border-[#2a2a2a] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#e2ff00]">assignment_late</span>
            Cuestionarios pendientes
            <span className="ml-auto bg-[#e2ff00] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingAssignments.length}</span>
          </h2>
          <div className="space-y-2">
            {pendingAssignments.map(a => {
              const q = templates.get(a.questionnaireId);
              if (!q) return null;
              return (
                <button
                  key={a.id}
                  onClick={() => setActiveAssignment(a)}
                  className="w-full flex items-center justify-between bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#e2ff00]/40 rounded-lg p-3.5 text-left transition-all group"
                >
                  <div>
                    <p className="font-sans font-semibold text-sm text-white group-hover:text-[#e2ff00] transition-colors">{q.title}</p>
                    {q.description && <p className="text-[11px] text-[#c6c9ab] mt-0.5 font-sans">{q.description}</p>}
                    <p className="font-mono text-[10px] text-[#c6c9ab] mt-1">{q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="material-symbols-outlined text-[#c6c9ab] group-hover:text-[#e2ff00] transition-colors flex-shrink-0 ml-3">chevron_right</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Historial de Revisiones ──────────────────────────────────────────── */}
      <section className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-5">
        <h2 className="font-sans font-bold text-lg text-white mb-4 pb-2 border-b border-[#2a2a2a] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00eefc]">history</span>
          Historial de Revisiones
        </h2>
        <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
          {checkins.map((item) => (
            <div
              key={item.id}
              className={`bg-[#1e1e1e] border rounded-lg p-4 transition-all hover:bg-[#201f1f] ${item.approved ? 'border-[#00eefc]/30' : 'border-[#2a2a2a]'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[#c6c9ab]">{item.dateStr}</span>
                  <span className="font-mono font-bold text-white text-sm">{item.weight} kg</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.mood}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-mono ${item.adherence === 'Sí' ? 'bg-[#e2ff00]/10 text-[#e2ff00]' : item.adherence === 'Parcial' ? 'bg-[#00eefc]/10 text-[#00eefc]' : 'bg-red-400/10 text-red-300'}`}>
                    {item.adherence}
                  </span>
                </div>
              </div>
              {item.notes && (
                <p className="text-xs text-[#c6c9ab] font-sans leading-relaxed mb-3 italic">"{item.notes}"</p>
              )}
              {item.coachFeedback ? (
                <div className="text-xs border-l-2 border-[#e2ff00] pl-3 py-1 ml-1 bg-black/20 rounded-r p-2">
                  <span className="font-mono font-semibold text-[#e2ff00] block mb-1">Nota del Entrenador:</span>
                  <p className="text-white leading-relaxed">{item.coachFeedback}</p>
                </div>
              ) : (
                <div className="text-[11px] text-[#c6c9ab]/60 font-mono italic pl-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs animate-spin text-[#e2ff00]">sync</span>
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
