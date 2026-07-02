import React, { useState, useEffect } from 'react';
import { Questionnaire } from '../types';
import {
  getQuestionnairesByCoach, createQuestionnaire, updateQuestionnaire, deleteQuestionnaire,
} from '../dbService';
import QuestionnaireEditor, { FormState, blankForm, formFromQuestionnaire } from './QuestionnaireEditor';

interface Props { coachId: string }

export default function QuestionnaireManagerScreen({ coachId }: Props) {
  const [view, setView]                 = useState<'list' | 'editor'>('list');
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading]           = useState(true);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(blankForm());
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState<string | null>(null);

  useEffect(() => {
    getQuestionnairesByCoach(coachId)
      .then(setQuestionnaires)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [coachId]);

  const openEditor = (q?: Questionnaire) => {
    setEditingId(q?.id ?? null);
    setForm(q ? formFromQuestionnaire(q) : blankForm());
    setView('editor');
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const data = {
        ownerId: coachId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        questions: form.questions
          .filter(q => q.label.trim())
          .map(q => ({ ...q, graphable: q.type === 'numeric' || q.type === 'scale' ? true : undefined })),
      };
      if (editingId) {
        await updateQuestionnaire(editingId, data);
        setQuestionnaires(prev => prev.map(q => q.id === editingId ? { id: editingId, ...data } : q));
      } else {
        const created = await createQuestionnaire(data);
        setQuestionnaires(prev => [...prev, created]);
      }
      setView('list');
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cuestionario?')) return;
    setDeleting(id);
    try {
      await deleteQuestionnaire(id);
      setQuestionnaires(prev => prev.filter(q => q.id !== id));
    } catch (err) { console.error(err); }
    finally { setDeleting(null); }
  };

  // ── Editor view ───────────────────────────────────────────────────────────────
  if (view === 'editor') {
    return (
      <QuestionnaireEditor
        form={form}
        setForm={setForm}
        onSave={handleSave}
        onCancel={() => setView('list')}
        saving={saving}
        isNew={!editingId}
      />
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-sans font-bold text-xl text-white">Cuestionarios</h2>
        <button
          onClick={() => openEditor()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#e2ff00] text-black font-mono text-[10px] font-bold uppercase rounded-lg hover:bg-[#bad200] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm">add</span>Nuevo
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-xs text-[#c6c9ab] uppercase tracking-widest animate-pulse">Cargando…</div>
      ) : questionnaires.length === 0 ? (
        <div className="border border-dashed border-[#2a2a2a] rounded-2xl py-20 text-center">
          <span className="material-symbols-outlined text-4xl text-[#2a2a2a] block mb-3">quiz</span>
          <p className="font-sans font-bold text-white text-sm">Sin cuestionarios todavía</p>
          <p className="text-[#c6c9ab] text-xs mt-1">Crea plantillas para asignarlas a tus clientes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questionnaires.map(q => (
            <div key={q.id} className="bg-[#121212] border border-[#2a2a2a] rounded-xl p-4 flex items-center gap-4">
              <div className="w-9 h-9 bg-[#e2ff00]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#e2ff00] text-base">quiz</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-sans font-bold text-white text-sm truncate">{q.title}</p>
                  {q.questions.some(qq => qq.graphable) && (
                    <span className="flex items-center gap-0.5 text-[9px] font-mono text-[#e2ff00] bg-[#e2ff00]/10 px-1.5 py-0.5 rounded border border-[#e2ff00]/20">
                      <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>show_chart</span>
                      Graficable
                    </span>
                  )}
                </div>
                <p className="font-mono text-[10px] text-[#c6c9ab]">
                  {q.questions.length} pregunta{q.questions.length !== 1 ? 's' : ''}
                  {q.description ? ` · ${q.description.slice(0, 50)}${q.description.length > 50 ? '…' : ''}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => openEditor(q)}
                  className="p-2 bg-[#1c1b1b] border border-[#2a2a2a] text-[#00eefc] hover:border-[#00eefc]/40 rounded-lg transition-all"
                  title="Editar"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
                <button
                  onClick={() => handleDelete(q.id)}
                  disabled={deleting === q.id}
                  className="p-2 bg-[#1c1b1b] border border-[#2a2a2a] text-[#c6c9ab] hover:text-red-400 hover:border-red-500/30 rounded-lg transition-all"
                  title="Eliminar"
                >
                  <span className="material-symbols-outlined text-sm">{deleting === q.id ? 'progress_activity' : 'delete'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
