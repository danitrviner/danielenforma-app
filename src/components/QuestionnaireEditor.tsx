import React from 'react';
import { QuestionnaireQuestion, QuestionType, BodyMetricKey, BODY_METRIC_LABELS } from '../types';
import { Icon, Button, Input } from './ui';
import { SEÑALES_DISPONIBLES } from '../data/questionnaireSignals';

// ── Shared types & helpers (consumed by QuestionnaireManagerScreen + ClientHub) ─

export interface FormState {
  title: string;
  description: string;
  questions: QuestionnaireQuestion[];
}

export function blankForm(): FormState {
  return { title: '', description: '', questions: [newQuestion()] };
}

export function formFromQuestionnaire(q: { title: string; description?: string; questions: QuestionnaireQuestion[] }): FormState {
  return { title: q.title, description: q.description ?? '', questions: q.questions };
}

export function newQuestion(): QuestionnaireQuestion {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    type: 'text',
    required: true,
  };
}

export function applyTypeChange(patch: { type: QuestionType }): Partial<QuestionnaireQuestion> {
  return {
    ...patch,
    graphable: patch.type === 'numeric' || patch.type === 'scale' || patch.type === 'metric' ? true : undefined,
    unit: undefined, min: undefined, max: undefined, decimals: undefined,
    scaleMin: undefined, scaleMax: undefined, scaleMinLabel: undefined, scaleMaxLabel: undefined,
    options: undefined, multiSelect: undefined,
    // La señal describe QUÉ significa la respuesta, y eso depende del tipo:
    // 'grupos a priorizar' solo existe sobre una pregunta de opción múltiple.
    signalKey: undefined,
    maxChars: undefined,
    labelTrue: undefined, labelFalse: undefined,
    metricKey: undefined,
    mediaKind: undefined, maxSizeMb: undefined,
  };
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  numeric: 'Número',
  scale:   'Escala',
  choice:  'Opción múltiple',
  text:    'Texto libre',
  boolean: 'Sí / No',
  metric:  'Medida corporal',
  media:   'Foto / Vídeo',
};

const BODY_METRIC_KEYS = Object.keys(BODY_METRIC_LABELS) as BodyMetricKey[];

const INPUT_CLS      = 'bg-bg border border-hairline rounded-surface px-3 py-2 text-body-s text-white focus:outline-none focus:ring-1 focus:ring-accent';
const MINI_INPUT_CLS = 'bg-bg border border-hairline rounded-control px-2 py-2 text-label font-mono text-white focus:outline-none focus:ring-1 focus:ring-accent';

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  isNew?: boolean;
}

export default function QuestionnaireEditor({ form, setForm, onSave, onCancel, saving, isNew = true }: Props) {
  const setQ = (idx: number, patch: Partial<QuestionnaireQuestion>) =>
    setForm(f => ({ ...f, questions: f.questions.map((q, i) => i === idx ? { ...q, ...patch } : q) }));

  const moveQ = (idx: number, dir: -1 | 1) =>
    setForm(f => {
      const qs = [...f.questions];
      const target = idx + dir;
      if (target < 0 || target >= qs.length) return f;
      [qs[idx], qs[target]] = [qs[target], qs[idx]];
      return { ...f, questions: qs };
    });

  const duplicateQ = (idx: number) =>
    setForm(f => {
      const copy: QuestionnaireQuestion = {
        ...f.questions[idx],
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      };
      const qs = [...f.questions];
      qs.splice(idx + 1, 0, copy);
      return { ...f, questions: qs };
    });

  const removeQ = (idx: number) =>
    setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== idx) }));

  const addQ = () =>
    setForm(f => ({ ...f, questions: [...f.questions, newQuestion()] }));

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="s" onClick={onCancel} icon="arrow_back">Volver</Button>
        <h2 className="font-sans font-bold text-title-m text-white">
          {isNew ? 'Nuevo cuestionario' : 'Editar cuestionario'}
        </h2>
      </div>

      {/* Title + description */}
      <div className="bg-surface border border-hairline rounded-surface p-5 space-y-4">
        <Input
          label="Título"
          required
          value={form.title}
          onChange={v => setForm(f => ({ ...f, title: v }))}
          placeholder="Ej: Control semanal de bienestar"
        />
        <Input
          label="Descripción"
          hint="Opcional. Indica al atleta qué información buscas."
          value={form.description}
          onChange={v => setForm(f => ({ ...f, description: v }))}
          placeholder="Indica al atleta qué información buscas"
        />
      </div>

      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-caption text-ink-2 uppercase tracking-wider">
            Preguntas ({form.questions.length})
          </h3>
          <button
            onClick={addQ}
            className="flex items-center gap-2 px-3 py-2 bg-raised border border-accent/40 text-accent font-sans text-caption uppercase rounded-control hover:border-accent/70 transition-all"
          >
            <span className="material-symbols-outlined text-body-s">add</span>Añadir pregunta
          </button>
        </div>

        {form.questions.map((q, idx) => (
          <div key={q.id} className="bg-surface border border-hairline rounded-surface p-4 space-y-3">

            {/* Main row */}
            <div className="flex items-start gap-2">
              <div className="flex flex-col flex-shrink-0 mt-1">
                <button onClick={() => moveQ(idx, -1)} disabled={idx === 0}
                  className="text-ink-2 hover:text-white disabled:opacity-20 transition-colors" title="Subir">
                  <Icon name="keyboard_arrow_up" size="s" />
                </button>
                <button onClick={() => moveQ(idx, 1)} disabled={idx === form.questions.length - 1}
                  className="text-ink-2 hover:text-white disabled:opacity-20 transition-colors" title="Bajar">
                  <Icon name="keyboard_arrow_down" size="s" />
                </button>
              </div>
              <span className="font-mono text-caption text-ink-2/50 font-bold w-5 text-center mt-2 flex-shrink-0">{idx + 1}</span>
              <input
                value={q.label}
                onChange={e => setQ(idx, { label: e.target.value })}
                placeholder="Texto de la pregunta"
                className={`flex-1 min-w-0 ${INPUT_CLS}`}
              />
              <select
                value={q.type}
                onChange={e => setQ(idx, applyTypeChange({ type: e.target.value as QuestionType }))}
                className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s font-mono text-white focus:outline-none focus:ring-1 focus:ring-accent flex-shrink-0"
              >
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(t => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {(q.type === 'numeric' || q.type === 'scale' || q.type === 'metric') && (
                <span title="Graficable" className="flex-shrink-0 mt-2">
                  <Icon name="show_chart" size="s" className="text-accent" />
                </span>
              )}
              <label className="flex items-center gap-1 cursor-pointer flex-shrink-0 mt-2" title="Obligatoria">
                <span
                  className={`w-4 h-4 rounded-control border-2 flex items-center justify-center transition-colors ${q.required ? 'bg-accent border-accent' : 'border-hairline'}`}
                  onClick={() => setQ(idx, { required: !q.required })}
                >
                  {q.required && <Icon name="check" size="s" className="text-black" />}
                </span>
                <span className="font-mono text-caption text-ink-2 hidden sm:inline">Oblig.</span>
              </label>
              <Button variant="ghost" size="s" onClick={() => duplicateQ(idx)} icon="content_copy" label="Duplicar" />
              <Button variant="ghost" size="s" onClick={() => removeQ(idx)} disabled={form.questions.length === 1} icon="delete" label="Eliminar" />
            </div>

            {/* Help text */}
            <div className="pl-10">
              <input
                value={q.helpText ?? ''}
                onChange={e => setQ(idx, { helpText: e.target.value || undefined })}
                placeholder="Texto de ayuda para el atleta (opcional)"
                className={`w-full ${MINI_INPUT_CLS} text-caption`}
              />
            </div>

            {/* Señal — qué significa esta respuesta para los motores de la app.
                Hace falta poder ponerla a mano porque los cuestionarios que ya
                están asignados en Firestore se crearon sin ella: sin esto habría
                que recrearlos desde cero para que el sugeridor de volumen
                pudiera leer el cierre de mesociclo. */}
            {(q.type === 'scale' || q.type === 'numeric' || q.type === 'choice') && (
              <div className="pl-10 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-caption text-ink-3 uppercase tracking-wider">Señal</span>
                <select
                  value={q.signalKey ?? ''}
                  onChange={e => setQ(idx, { signalKey: e.target.value || undefined })}
                  className="bg-raised border border-hairline rounded-control px-2 py-1 text-caption font-mono text-ink-2 focus:outline-none focus:ring-1 focus:ring-accent max-w-full"
                >
                  <option value="">Ninguna (respuesta normal)</option>
                  {SEÑALES_DISPONIBLES
                    .filter(sig => sig.tipos.includes(q.type))
                    .map(sig => <option key={sig.key} value={sig.key}>{sig.label}</option>)}
                </select>
                {q.signalKey && (
                  <span className="inline-flex items-center gap-1 font-mono text-caption text-accent">
                    <Icon name="bolt" size="s" />
                    la lee un motor de la app
                  </span>
                )}
              </div>
            )}

            {/* Type-specific config */}
            <div className="pl-10 space-y-2">
              {q.type === 'numeric' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Unidad</label>
                    <input value={q.unit ?? ''} onChange={e => setQ(idx, { unit: e.target.value || undefined })}
                      placeholder="kg, cm, %…" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Mínimo</label>
                    <input type="number" value={q.min ?? ''}
                      onChange={e => setQ(idx, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Máximo</label>
                    <input type="number" value={q.max ?? ''}
                      onChange={e => setQ(idx, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Decimales</label>
                    <input type="number" value={q.decimals ?? ''} min={0} max={4}
                      onChange={e => setQ(idx, { decimals: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="0" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                </div>
              )}
              {q.type === 'scale' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Desde</label>
                      <input type="number" value={q.scaleMin ?? 1} min={0}
                        onChange={e => setQ(idx, { scaleMin: Number(e.target.value) })}
                        className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                    <div>
                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Hasta</label>
                      <input type="number" value={q.scaleMax ?? 10} min={1}
                        onChange={e => setQ(idx, { scaleMax: Number(e.target.value) })}
                        className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Etiqueta inicio</label>
                      <input value={q.scaleMinLabel ?? ''}
                        onChange={e => setQ(idx, { scaleMinLabel: e.target.value || undefined })}
                        placeholder="Ej: Nada" className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                    <div>
                      <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Etiqueta fin</label>
                      <input value={q.scaleMaxLabel ?? ''}
                        onChange={e => setQ(idx, { scaleMaxLabel: e.target.value || undefined })}
                        placeholder="Ej: Muchísimo" className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                  </div>
                </div>
              )}
              {q.type === 'choice' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <span
                      className={`w-4 h-4 rounded-control border-2 flex items-center justify-center transition-colors ${q.multiSelect ? 'bg-accent border-accent' : 'border-hairline'}`}
                      onClick={() => setQ(idx, { multiSelect: !q.multiSelect })}
                    >
                      {q.multiSelect && <Icon name="check" size="s" className="text-black" />}
                    </span>
                    <span className="font-mono text-caption text-ink-2">Selección múltiple</span>
                  </label>
                  <div>
                    <label className="block font-sans text-caption text-ink-2 uppercase mb-2">Opciones (una por línea)</label>
                    <textarea
                      value={(q.options ?? []).join('\n')}
                      onChange={e => setQ(idx, { options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                      placeholder={'Opción A\nOpción B\nOpción C'}
                      rows={3}
                      className={`w-full ${INPUT_CLS} resize-none font-mono`}
                    />
                  </div>
                </div>
              )}
              {q.type === 'text' && (
                <div className="w-40">
                  <label className="block font-sans text-caption text-ink-2 uppercase mb-1">Máx. caracteres</label>
                  <input type="number" value={q.maxChars ?? ''} min={1}
                    onChange={e => setQ(idx, { maxChars: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Sin límite" className={`w-full ${MINI_INPUT_CLS}`} />
                </div>
              )}
              {q.type === 'boolean' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Etiqueta Sí</label>
                    <input value={q.labelTrue ?? ''}
                      onChange={e => setQ(idx, { labelTrue: e.target.value || undefined })}
                      placeholder="Sí" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-caption text-ink-2 uppercase mb-1">Etiqueta No</label>
                    <input value={q.labelFalse ?? ''}
                      onChange={e => setQ(idx, { labelFalse: e.target.value || undefined })}
                      placeholder="No" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                </div>
              )}
              {q.type === 'metric' && (
                <div className="w-56">
                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Qué mide</label>
                  <select
                    value={q.metricKey ?? ''}
                    onChange={e => setQ(idx, { metricKey: (e.target.value || undefined) as BodyMetricKey | undefined })}
                    className={`w-full ${MINI_INPUT_CLS}`}
                  >
                    <option value="">— Elige —</option>
                    {BODY_METRIC_KEYS.map(k => (
                      <option key={k} value={k}>{BODY_METRIC_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              )}
              {q.type === 'media' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Tipo</label>
                    <select
                      value={q.mediaKind ?? ''}
                      onChange={e => setQ(idx, { mediaKind: (e.target.value || undefined) as 'video' | 'image' | undefined })}
                      className={`w-full ${MINI_INPUT_CLS}`}
                    >
                      <option value="">Foto o vídeo</option>
                      <option value="video">Solo vídeo</option>
                      <option value="image">Solo foto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Tamaño máx. (MB)</label>
                    <input type="number" value={q.maxSizeMb ?? ''} min={1} max={50}
                      onChange={e => setQ(idx, { maxSizeMb: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="50" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} className="flex-1">Cancelar</Button>
        <Button onClick={onSave} disabled={saving || !form.title.trim()} className="flex-1">
          {saving ? 'Guardando…' : isNew ? 'Crear cuestionario' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
