import React, { useState } from 'react';
import {
  UserProfile, WeightCheckIn, Questionnaire, QuestionnaireAssignment,
  QuestionnaireResponse, QuestionnaireQuestion, QSchedule, QScheduleType,
} from '../types';
import {
  submitCoachFeedback, updateCheckIn, deleteCheckIn,
  updateQuestionnaireResponse, deleteQuestionnaireResponse,
  assignQuestionnaire, deactivateAssignment, createQuestionnaire,
} from '../dbService';
import { scheduleLabel } from '../utils/scheduleEngine';
import { suggestedScheduleForTitle } from '../data/questionnairePresets';
import { useToast } from '../hooks/useToast';
import ScheduleFields from './ScheduleFields';
import QuestionnaireEditor, { FormState as QFormState, blankForm as blankQForm, newQuestion, applyTypeChange } from './QuestionnaireEditor';
import TaskManagerPanel from './TaskManagerPanel';
import { Badge, Sheet, SegmentedControl } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientReviewsPanel (reorganización del Hub — pestaña "Revisiones", zona "Hoy")

   Antes mezclaba cuatro cosas que no se consultan en el mismo momento: la
   ficha del atleta (→ ClientFichaPanel), su cuerpo/fotos (→ ClientBodyPanel),
   lo que el atleta HA ENVIADO (check-ins + respuestas) y lo que el coach LE
   ASIGNA (cuestionarios, tareas). Las dos últimas SÍ son "revisar" de verdad,
   así que se quedan aquí — separadas por un SegmentedControl "Recibidas" /
   "Asignadas", el mismo par que Check-Ins/Assigned de HubFit.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athlete: UserProfile;
  coachId: string;
  athleteCheckins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  athleteQResponses: QuestionnaireResponse[];
  setAthleteQResponses: React.Dispatch<React.SetStateAction<QuestionnaireResponse[]>>;
  coachQuestionnaires: Questionnaire[];
  setCoachQuestionnaires: React.Dispatch<React.SetStateAction<Questionnaire[]>>;
  athleteQAssignments: QuestionnaireAssignment[];
  setAthleteQAssignments: React.Dispatch<React.SetStateAction<QuestionnaireAssignment[]>>;
}

export default function ClientReviewsPanel({
  athlete, coachId, athleteCheckins, onRefreshCheckIns,
  athleteQResponses, setAthleteQResponses,
  coachQuestionnaires, setCoachQuestionnaires,
  athleteQAssignments, setAthleteQAssignments,
}: Props) {
  const { showToast } = useToast();

  const [view, setView] = useState<'recibidas' | 'asignadas'>('recibidas');

  // Questionnaires
  const [assignQId, setAssignQId] = useState('');
  const [assignSchedType, setAssignSchedType] = useState<QScheduleType>('once');
  const [assignWeekdays, setAssignWeekdays] = useState<number[]>([]);
  const [assignIntervalDays, setAssignIntervalDays] = useState(7);
  const [assignDayOfMonth, setAssignDayOfMonth] = useState(1);
  const [assignPlanWeek, setAssignPlanWeek] = useState(3);
  const [assignMesocycleOffsetDays, setAssignMesocycleOffsetDays] = useState(0);
  const [assignStartDate, setAssignStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigningQ, setAssigningQ] = useState(false);

  // Personalización por cliente sobre la plantilla elegida (overrides de la
  // asignación) — ver QuestionnaireOverrides en types.ts. Se resetea al
  // cambiar de plantilla o tras asignar.
  const [assignOverridesOpen, setAssignOverridesOpen] = useState(false);
  const [assignHidden, setAssignHidden] = useState<Set<string>>(new Set());
  const [assignRelabeled, setAssignRelabeled] = useState<Record<string, string>>({});
  const [assignRequiredOverride, setAssignRequiredOverride] = useState<Record<string, boolean>>({});
  const [assignExtra, setAssignExtra] = useState<QuestionnaireQuestion[]>([]);

  const resetAssignOverrides = () => {
    setAssignOverridesOpen(false);
    setAssignHidden(new Set());
    setAssignRelabeled({});
    setAssignRequiredOverride({});
    setAssignExtra([]);
  };
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
      if (assignSchedType === 'weekdays')     schedule.weekdays            = assignWeekdays;
      if (assignSchedType === 'interval')     schedule.intervalDays        = assignIntervalDays;
      if (assignSchedType === 'monthly')      schedule.dayOfMonth          = assignDayOfMonth;
      if (assignSchedType === 'plan_week')    schedule.planWeek            = assignPlanWeek;
      if (assignSchedType === 'mesocycle_end') schedule.mesocycleOffsetDays = assignMesocycleOffsetDays;

      const overrides = assignHidden.size > 0 || Object.keys(assignRelabeled).length > 0
        || Object.keys(assignRequiredOverride).length > 0 || assignExtra.length > 0
        ? {
            hidden: assignHidden.size > 0 ? [...assignHidden] : undefined,
            relabeled: Object.keys(assignRelabeled).length > 0 ? assignRelabeled : undefined,
            required: Object.keys(assignRequiredOverride).length > 0 ? assignRequiredOverride : undefined,
            extra: assignExtra.length > 0 ? assignExtra : undefined,
          }
        : undefined;

      const a = await assignQuestionnaire({
        questionnaireId: assignQId,
        athleteId: athlete.email,
        schedule,
        startDate: assignStartDate,
        active: true,
        createdAt: new Date().toISOString(),
        overrides,
      });
      setAthleteQAssignments(prev => [...prev, a]);
      setAssignQId('');
      setAssignSchedType('once');
      setAssignWeekdays([]);
      resetAssignOverrides();
    } catch (err) { console.error(err); showToast('No se pudo asignar el cuestionario.'); }
    finally { setAssigningQ(false); }
  };

  const handleDeactivateQ = async (id: string) => {
    await deactivateAssignment(id).catch(err => { console.error(err); showToast('No se pudo desactivar el cuestionario.'); });
    setAthleteQAssignments(prev => prev.map(a => a.id === id ? { ...a, active: false } : a));
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
          .map(q => ({ ...q, graphable: q.type === 'numeric' || q.type === 'scale' || q.type === 'metric' ? true : undefined })),
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
      <SegmentedControl
        label="Vista de revisiones"
        options={[
          { value: 'recibidas', label: 'Recibidas' },
          { value: 'asignadas', label: 'Asignadas' },
        ]}
        value={view}
        onChange={v => setView(v as 'recibidas' | 'asignadas')}
      />

      {view === 'recibidas' && (
        <div className="space-y-6">
          {/* ── Lista cronológica unificada de check-ins + respuestas ────── */}
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
                <div className="bg-surface border border-dashed border-hairline rounded-surface p-10 text-center text-ink-2">
                  <span className="material-symbols-outlined text-display text-ink-3 block mb-2">history_edu</span>
                  <p className="text-body-s font-bold text-white">Sin revisiones todavía</p>
                  <p className="text-label mt-1">Los check-ins y respuestas del atleta aparecerán aquí.</p>
                </div>
              );
            }

            const latestKey = items.length > 0
              ? (items[items.length - 1].kind === 'checkin' ? `c_${items[items.length - 1].data.id}` : `r_${items[items.length - 1].data.id}`)
              : null;

            return (
              <div className="bg-surface border border-hairline rounded-surface overflow-hidden">
                <div className="p-4 border-b border-hairline bg-raised flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-body-s">history_edu</span>
                  <h3 className="font-sans font-bold text-title-s text-white uppercase tracking-wide">Revisiones</h3>
                  <span className="font-mono text-caption text-ink-2 ml-1">({items.length} en el hilo)</span>
                </div>
                <div className="divide-y divide-hairline/40">
                  {items.map(item => {
                    const key = item.kind === 'checkin' ? `c_${item.data.id}` : `r_${item.data.id}`;
                    const isExpanded = expandedReviewId === key;
                    const isLatest = key === latestKey;
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
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-raised ${isExpanded ? 'bg-raised' : ''} ${isLatest ? 'border-l-2 border-l-accent' : ''}`}
                          >
                            <span
                              className="material-symbols-outlined flex-shrink-0 text-title-m"
                              style={{ color: c.approved ? 'var(--color-accent)' : 'var(--color-warning)', fontVariationSettings: "'FILL' 1" }}
                            >rate_review</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-sans font-bold text-white text-label">Check-in</span>
                                <span className="font-mono text-caption text-ink-2">{c.dateStr}</span>
                                <Badge tone={c.approved ? 'success' : 'warning'}>
                                  {c.approved ? 'Revisado' : 'Pendiente'}
                                </Badge>
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
                                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-white focus:outline-none focus:border-data/50 font-mono" />
                                    </div>
                                    <div>
                                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Fecha</label>
                                      <input type="text" value={checkinEditForm.dateStr}
                                        onChange={e => setCheckinEditForm(f => f && ({ ...f, dateStr: e.target.value }))}
                                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-white focus:outline-none focus:border-data/50 font-mono" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Adherencia</label>
                                      <select value={checkinEditForm.adherence}
                                        onChange={e => setCheckinEditForm(f => f && ({ ...f, adherence: e.target.value as WeightCheckIn['adherence'] }))}
                                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-white focus:outline-none focus:border-data/50 font-mono">
                                        {['Sí', 'Parcial', 'No'].map(v => <option key={v} value={v}>{v}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Humor</label>
                                      <select value={checkinEditForm.mood}
                                        onChange={e => setCheckinEditForm(f => f && ({ ...f, mood: e.target.value }))}
                                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-white focus:outline-none focus:border-data/50 font-mono">
                                        {['😩', '😴', '😐', '😊', '🔥'].map(v => <option key={v} value={v}>{v}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Notas</label>
                                    <textarea value={checkinEditForm.notes}
                                      onChange={e => setCheckinEditForm(f => f && ({ ...f, notes: e.target.value }))}
                                      className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-white focus:outline-none focus:border-data/50 font-sans resize-none min-h-[60px]" />
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
                                  className="w-full bg-raised border border-hairline rounded-control p-3 text-title-s text-white focus:ring-1 focus:ring-accent focus:outline-none min-h-[80px] resize-none font-sans"
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
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-raised ${isExpanded ? 'bg-raised' : ''} ${isLatest ? 'border-l-2 border-l-accent' : ''}`}
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
                                          className="bg-raised border border-hairline rounded-control px-2 py-1 text-title-s text-white focus:outline-none focus:border-data/50 font-mono w-32">
                                          {question.options.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                      ) : isBool ? (
                                        <select value={String(ans.value)}
                                          onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value === 'true' } : a))}
                                          className="bg-raised border border-hairline rounded-control px-2 py-1 text-title-s text-white focus:outline-none focus:border-data/50 font-sans w-24">
                                          <option value="true">{question?.labelTrue ?? 'Sí'}</option>
                                          <option value="false">{question?.labelFalse ?? 'No'}</option>
                                        </select>
                                      ) : isNum ? (
                                        <input type="number" value={String(ans.value)}
                                          onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: parseFloat(e.target.value) || 0 } : a))}
                                          className="bg-raised border border-hairline rounded-control px-2 py-1 text-title-s text-white focus:outline-none focus:border-data/50 font-mono w-24 text-right" />
                                      ) : (
                                        <input type="text" value={String(ans.value)}
                                          onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                                          className="bg-raised border border-hairline rounded-control px-2 py-1 text-title-s text-white focus:outline-none focus:border-data/50 font-mono flex-1 min-w-0" />
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

          {/* ── Respuestas del atleta (historial completo) ────────────────── */}
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
      )}

      {view === 'asignadas' && (
        <div className="space-y-6">
          <TaskManagerPanel athleteEmail={athlete.email} />

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
              <Sheet
                open
                onClose={() => setShowNewQEditor(false)}
                title="Nuevo cuestionario"
                size="xl"
              >
                <QuestionnaireEditor
                  form={newQForm}
                  setForm={setNewQForm}
                  onSave={handleCreateNewQ}
                  onCancel={() => setShowNewQEditor(false)}
                  saving={savingNewQ}
                  isNew
                />
              </Sheet>
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
                  onChange={e => {
                    const id = e.target.value;
                    setAssignQId(id);
                    resetAssignOverrides();
                    const tmpl = coachQuestionnaires.find(q => q.id === id);
                    const suggested = tmpl ? suggestedScheduleForTitle(tmpl.title) : undefined;
                    if (suggested) {
                      setAssignSchedType(suggested.type);
                      setAssignWeekdays(suggested.weekdays ?? []);
                      setAssignIntervalDays(suggested.intervalDays ?? 7);
                      setAssignDayOfMonth(suggested.dayOfMonth ?? 1);
                      setAssignPlanWeek(suggested.planWeek ?? 3);
                      setAssignMesocycleOffsetDays(suggested.mesocycleOffsetDays ?? 0);
                    }
                  }}
                  className="w-full bg-bg border border-hairline rounded-control px-3 py-3 text-title-s text-white font-sans focus:outline-none focus:ring-1 focus:ring-accent"
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
                  planWeek={assignPlanWeek}
                  onPlanWeekChange={setAssignPlanWeek}
                  mesocycleOffsetDays={assignMesocycleOffsetDays}
                  onMesocycleOffsetDaysChange={setAssignMesocycleOffsetDays}
                />

                {/* ── Personalizar para este cliente (overrides sobre la plantilla) ── */}
                {assignQId && (() => {
                  const tmpl = coachQuestionnaires.find(q => q.id === assignQId);
                  if (!tmpl) return null;
                  const changeCount = assignHidden.size + Object.keys(assignRelabeled).length
                    + Object.keys(assignRequiredOverride).length + assignExtra.length;
                  return (
                    <div className="border border-hairline rounded-field overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setAssignOverridesOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-raised hover:bg-raised/70 transition-colors"
                      >
                        <span className="font-mono text-caption text-ink-2 uppercase tracking-wide flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">tune</span>
                          Personalizar para este cliente
                          {changeCount > 0 && (
                            <span className="bg-accent text-on-accent text-[9px] font-bold px-1.5 py-0.5 rounded-full">{changeCount}</span>
                          )}
                        </span>
                        <span className={`material-symbols-outlined text-ink-2 text-sm transition-transform ${assignOverridesOpen ? 'rotate-180' : ''}`}>expand_more</span>
                      </button>
                      {assignOverridesOpen && (
                        <div className="p-3 space-y-2 bg-bg">
                          {tmpl.questions.map(q => {
                            const hidden = assignHidden.has(q.id);
                            return (
                              <div key={q.id} className={`flex items-start gap-2 p-2 rounded-control border ${hidden ? 'border-ink-3 opacity-50' : 'border-hairline'}`}>
                                <button
                                  type="button"
                                  onClick={() => setAssignHidden(prev => {
                                    const next = new Set(prev);
                                    if (next.has(q.id)) next.delete(q.id);
                                    else next.add(q.id);
                                    return next;
                                  })}
                                  title={hidden ? 'Mostrar de nuevo' : 'Ocultar para este cliente'}
                                  className="flex-shrink-0 mt-1 text-ink-2 hover:text-white transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">{hidden ? 'visibility_off' : 'visibility'}</span>
                                </button>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <input
                                    value={assignRelabeled[q.id] ?? ''}
                                    onChange={e => setAssignRelabeled(prev => {
                                      const next = { ...prev };
                                      if (e.target.value) next[q.id] = e.target.value; else delete next[q.id];
                                      return next;
                                    })}
                                    disabled={hidden}
                                    placeholder={q.label}
                                    className="w-full bg-bg border border-hairline rounded-control px-2 py-2 text-title-s text-white font-sans focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
                                  />
                                  <label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                    <span
                                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${(assignRequiredOverride[q.id] ?? q.required) ? 'bg-accent border-accent' : 'border-hairline'}`}
                                      onClick={() => !hidden && setAssignRequiredOverride(prev => ({ ...prev, [q.id]: !(prev[q.id] ?? q.required) }))}
                                    >
                                      {(assignRequiredOverride[q.id] ?? q.required) && <span className="material-symbols-outlined text-on-accent" style={{ fontSize: '9px' }}>check</span>}
                                    </span>
                                    <span className="font-mono text-[9px] text-ink-2">Obligatoria</span>
                                  </label>
                                </div>
                              </div>
                            );
                          })}

                          {assignExtra.map((q, idx) => (
                            <div key={q.id} className="p-2 rounded-control border border-data/30 bg-data/5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  value={q.label}
                                  onChange={e => setAssignExtra(prev => prev.map((qq, i) => i === idx ? { ...qq, label: e.target.value } : qq))}
                                  placeholder="Pregunta exclusiva de este cliente"
                                  className="flex-1 min-w-0 bg-bg border border-hairline rounded-control px-2 py-2 text-title-s text-white font-sans focus:outline-none focus:ring-1 focus:ring-data"
                                />
                                <select
                                  value={q.type}
                                  onChange={e => setAssignExtra(prev => prev.map((qq, i) => i === idx ? { ...qq, ...applyTypeChange({ type: e.target.value as QuestionnaireQuestion['type'] }) } : qq))}
                                  className="bg-raised border border-hairline rounded px-1.5 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-data flex-shrink-0"
                                >
                                  <option value="text">Texto</option>
                                  <option value="numeric">Número</option>
                                  <option value="scale">Escala</option>
                                  <option value="boolean">Sí/No</option>
                                  <option value="choice">Opción</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setAssignExtra(prev => prev.filter((_, i) => i !== idx))}
                                  className="flex-shrink-0 text-ink-2 hover:text-red-400 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">close</span>
                                </button>
                              </div>
                              {q.type === 'choice' && (
                                <textarea
                                  value={(q.options ?? []).join('\n')}
                                  onChange={e => setAssignExtra(prev => prev.map((qq, i) => i === idx ? { ...qq, options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } : qq))}
                                  placeholder={'Opción A\nOpción B'}
                                  rows={2}
                                  className="w-full bg-bg border border-hairline rounded px-2 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:ring-1 focus:ring-data resize-none"
                                />
                              )}
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => setAssignExtra(prev => [...prev, { ...newQuestion(), id: `x_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, required: false }])}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-data font-mono text-[10px] uppercase hover:text-white transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>Añadir pregunta solo para él/ella
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <button
                  onClick={handleAssignQuestionnaire}
                  disabled={!assignQId || assigningQ || (assignSchedType === 'weekdays' && assignWeekdays.length === 0)}
                  className="px-4 py-3 bg-accent text-black font-sans font-bold text-label uppercase rounded-control hover:bg-accent-press active:scale-95 transition-all disabled:opacity-40"
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
                  const overrideCount = (a.overrides?.hidden?.length ?? 0)
                    + Object.keys(a.overrides?.relabeled ?? {}).length
                    + Object.keys(a.overrides?.required ?? {}).length
                    + (a.overrides?.extra?.length ?? 0);
                  return (
                    <div key={a.id} className="flex items-center gap-3 bg-raised border border-hairline rounded-surface px-3 py-2">
                      <span className="material-symbols-outlined text-accent text-body-s">quiz</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-sans font-bold text-white text-label truncate flex items-center gap-2">
                          {tmpl?.title ?? a.questionnaireId}
                          {overrideCount > 0 && (
                            <Badge tone="info">personalizado · {overrideCount}</Badge>
                          )}
                        </p>
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
        </div>
      )}
    </div>
  );
}
