import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Questionnaire } from '../types';
import {
  getQuestionnairesByCoach, createQuestionnaire, updateQuestionnaire, deleteQuestionnaire,
} from '../dbService';
import QuestionnaireEditor, { FormState, blankForm, formFromQuestionnaire } from './QuestionnaireEditor';
import { QUESTIONNAIRE_PRESETS, buildQuestionnaireFromPreset } from '../data/questionnairePresets';
import { Skeleton } from './ui';
import { Icon, Button, EmptyState, ListRow, Badge } from './ui';

interface Props { coachId: string }

export default function QuestionnaireManagerScreen({ coachId }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['questionnairesByCoach', coachId] as const;
  const { data: questionnaires = [], isPending: loading } = useQuery({
    queryKey,
    queryFn: () => getQuestionnairesByCoach(coachId),
  });
  const [view, setView]                 = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(blankForm());
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(false);

  const openEditor = (q?: Questionnaire) => {
    setEditingId(q?.id ?? null);
    setForm(q ? formFromQuestionnaire(q) : blankForm());
    setView('editor');
  };

  // Crea directamente las plantillas de Dani que aún no existan (comparando
  // por título) — no hace falta pasar por el editor, ya vienen listas para
  // asignar y se pueden retocar después como cualquier otro cuestionario.
  const missingPresets = QUESTIONNAIRE_PRESETS.filter(
    p => !questionnaires.some(q => q.title === p.title)
  );

  const handleLoadPresets = async () => {
    if (missingPresets.length === 0) return;
    setLoadingPresets(true);
    try {
      const created = await Promise.all(
        missingPresets.map(p => createQuestionnaire(buildQuestionnaireFromPreset(p, coachId)))
      );
      queryClient.setQueryData<Questionnaire[]>(queryKey, prev => [...(prev ?? []), ...created]);
    } catch (err) { console.error(err); }
    finally { setLoadingPresets(false); }
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
          .map(q => ({ ...q, graphable: q.type === 'numeric' || q.type === 'scale' || q.type === 'metric' ? true : undefined })),
      };
      if (editingId) {
        await updateQuestionnaire(editingId, data);
        queryClient.setQueryData<Questionnaire[]>(queryKey, prev =>
          prev?.map(q => q.id === editingId ? { id: editingId, ...data } : q));
      } else {
        const created = await createQuestionnaire(data);
        queryClient.setQueryData<Questionnaire[]>(queryKey, prev => [...(prev ?? []), created]);
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
      queryClient.setQueryData<Questionnaire[]>(queryKey, prev => prev?.filter(q => q.id !== id));
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-sans font-bold text-title-m text-white">Cuestionarios</h2>
        <div className="flex items-center gap-2">
          {missingPresets.length > 0 && (
            <Button
              variant="secondary"
              size="s"
              icon="library_add"
              onClick={handleLoadPresets}
              loading={loadingPresets}
              loadingLabel="Cargando"
              title="Crea las plantillas que falten (Entrenamiento, DOM's, Mediciones, Revisión Semanal…)"
            >
              {`Cargar plantillas (${missingPresets.length})`}
            </Button>
          )}
          <Button onClick={() => openEditor()} icon="add">Nuevo</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-surface" />
          <Skeleton className="h-16 w-full rounded-surface" />
          <Skeleton className="h-16 w-full rounded-surface" />
        </div>
      ) : questionnaires.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-surface">
          <EmptyState
            icon="quiz"
            title="Sin cuestionarios todavía"
            description={'Crea uno desde cero o usa "Cargar plantillas" arriba para traer las tuyas.'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {questionnaires.map(q => (
            <ListRow
              key={q.id}
              className="rounded-surface border border-hairline bg-surface"
              leading={
                <div className="w-9 h-9 bg-accent/10 rounded-surface flex items-center justify-center flex-shrink-0">
                  <Icon name="quiz" size="m" className="text-accent" />
                </div>
              }
              title={q.title}
              subtitle={`${q.questions.length} pregunta${q.questions.length !== 1 ? 's' : ''}${q.description ? ` · ${q.description.slice(0, 50)}${q.description.length > 50 ? '…' : ''}` : ''}`}
              trailing={
                <div className="flex items-center gap-2 flex-shrink-0">
                  {q.questions.some(qq => qq.graphable) && (
                    <Badge tone="data" icon="show_chart">Graficable</Badge>
                  )}
                  <button
                    onClick={() => openEditor(q)}
                    className="p-2 bg-raised border border-hairline text-data hover:border-data/40 rounded-control transition-all"
                    title="Editar"
                  >
                    <Icon name="edit" size="s" />
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    disabled={deleting === q.id}
                    className="p-2 bg-raised border border-hairline text-ink-2 hover:text-red-400 hover:border-red-500/30 rounded-control transition-all"
                    title="Eliminar"
                  >
                    <Icon name={deleting === q.id ? 'progress_activity' : 'delete'} size="s" className={deleting === q.id ? 'animate-spin' : ''} />
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
