import React from 'react';
import { QuestionnaireQuestion, QuestionType } from '../types';

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
    graphable: patch.type === 'numeric' || patch.type === 'scale' ? true : undefined,
    unit: undefined, min: undefined, max: undefined, decimals: undefined,
    scaleMin: undefined, scaleMax: undefined, scaleMinLabel: undefined, scaleMaxLabel: undefined,
    options: undefined, multiSelect: undefined,
    maxChars: undefined,
    labelTrue: undefined, labelFalse: undefined,
  };
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  numeric: 'Número',
  scale:   'Escala',
  choice:  'Opción múltiple',
  text:    'Texto libre',
  boolean: 'Sí / No',
};

const INPUT_CLS      = 'bg-[#0e0e0e] border border-white/7 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]';
const MINI_INPUT_CLS = 'bg-[#0e0e0e] border border-white/7 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a]';

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
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-[#c6c9ab] hover:text-white border border-white/7 hover:border-[#3a3a3a] rounded-lg transition-all"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>Volver
        </button>
        <h2 className="font-sans font-bold text-xl text-white">
          {isNew ? 'Nuevo cuestionario' : 'Editar cuestionario'}
        </h2>
      </div>

      {/* Title + description */}
      <div className="bg-[#181816] border border-white/7 rounded-2xl p-5 space-y-4">
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Título *</label>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ej: Control semanal de bienestar"
            className={`w-full ${INPUT_CLS}`}
          />
        </div>
        <div>
          <label className="block font-mono text-[10px] text-[#c6c9ab] uppercase mb-1.5">Descripción (opcional)</label>
          <input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Indica al atleta qué información buscas"
            className={`w-full ${INPUT_CLS}`}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] text-[#c6c9ab] uppercase tracking-wider">
            Preguntas ({form.questions.length})
          </h3>
          <button
            onClick={addQ}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1b1b] border border-[#fbcb1a]/40 text-[#fbcb1a] font-mono text-[10px] uppercase rounded-lg hover:border-[#fbcb1a]/70 transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>Añadir pregunta
          </button>
        </div>

        {form.questions.map((q, idx) => (
          <div key={q.id} className="bg-[#181816] border border-white/7 rounded-2xl p-4 space-y-3">

            {/* Main row */}
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                <button onClick={() => moveQ(idx, -1)} disabled={idx === 0}
                  className="p-0.5 text-[#c6c9ab] hover:text-white disabled:opacity-20 transition-colors" title="Subir">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>keyboard_arrow_up</span>
                </button>
                <button onClick={() => moveQ(idx, 1)} disabled={idx === form.questions.length - 1}
                  className="p-0.5 text-[#c6c9ab] hover:text-white disabled:opacity-20 transition-colors" title="Bajar">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>keyboard_arrow_down</span>
                </button>
              </div>
              <span className="font-mono text-[10px] text-[#c6c9ab]/50 font-bold w-5 text-center mt-2 flex-shrink-0">{idx + 1}</span>
              <input
                value={q.label}
                onChange={e => setQ(idx, { label: e.target.value })}
                placeholder="Texto de la pregunta"
                className={`flex-1 min-w-0 ${INPUT_CLS}`}
              />
              <select
                value={q.type}
                onChange={e => setQ(idx, applyTypeChange({ type: e.target.value as QuestionType }))}
                className="bg-[#1e1e1b] border border-white/7 rounded px-2 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#fbcb1a] flex-shrink-0"
              >
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(t => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {(q.type === 'numeric' || q.type === 'scale') && (
                <span title="Graficable" className="flex-shrink-0 mt-1.5">
                  <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontSize: '16px' }}>show_chart</span>
                </span>
              )}
              <label className="flex items-center gap-1 cursor-pointer flex-shrink-0 mt-1.5" title="Obligatoria">
                <span
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${q.required ? 'bg-[#fbcb1a] border-[#fbcb1a]' : 'border-[#3a3a3a]'}`}
                  onClick={() => setQ(idx, { required: !q.required })}
                >
                  {q.required && <span className="material-symbols-outlined text-black" style={{ fontSize: '10px' }}>check</span>}
                </span>
                <span className="font-mono text-[9px] text-[#c6c9ab] hidden sm:inline">Oblig.</span>
              </label>
              <button onClick={() => duplicateQ(idx)}
                className="flex-shrink-0 mt-0.5 p-1.5 text-[#c6c9ab] hover:text-[#00eefc] transition-colors" title="Duplicar">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
              </button>
              <button onClick={() => removeQ(idx)} disabled={form.questions.length === 1}
                className="flex-shrink-0 mt-0.5 p-1.5 text-[#c6c9ab] hover:text-red-400 disabled:opacity-20 transition-colors" title="Eliminar">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
              </button>
            </div>

            {/* Help text */}
            <div className="pl-9">
              <input
                value={q.helpText ?? ''}
                onChange={e => setQ(idx, { helpText: e.target.value || undefined })}
                placeholder="Texto de ayuda para el atleta (opcional)"
                className={`w-full ${MINI_INPUT_CLS} text-[11px]`}
              />
            </div>

            {/* Type-specific config */}
            <div className="pl-9 space-y-2">
              {q.type === 'numeric' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Unidad</label>
                    <input value={q.unit ?? ''} onChange={e => setQ(idx, { unit: e.target.value || undefined })}
                      placeholder="kg, cm, %…" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Mínimo</label>
                    <input type="number" value={q.min ?? ''}
                      onChange={e => setQ(idx, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Máximo</label>
                    <input type="number" value={q.max ?? ''}
                      onChange={e => setQ(idx, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Decimales</label>
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
                      <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Desde</label>
                      <input type="number" value={q.scaleMin ?? 1} min={0}
                        onChange={e => setQ(idx, { scaleMin: Number(e.target.value) })}
                        className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                    <div>
                      <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Hasta</label>
                      <input type="number" value={q.scaleMax ?? 10} min={1}
                        onChange={e => setQ(idx, { scaleMax: Number(e.target.value) })}
                        className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Etiqueta inicio</label>
                      <input value={q.scaleMinLabel ?? ''}
                        onChange={e => setQ(idx, { scaleMinLabel: e.target.value || undefined })}
                        placeholder="Ej: Nada" className={`w-full ${MINI_INPUT_CLS}`} />
                    </div>
                    <div>
                      <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Etiqueta fin</label>
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
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${q.multiSelect ? 'bg-[#fbcb1a] border-[#fbcb1a]' : 'border-[#3a3a3a]'}`}
                      onClick={() => setQ(idx, { multiSelect: !q.multiSelect })}
                    >
                      {q.multiSelect && <span className="material-symbols-outlined text-black" style={{ fontSize: '10px' }}>check</span>}
                    </span>
                    <span className="font-mono text-[10px] text-[#c6c9ab]">Selección múltiple</span>
                  </label>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1.5">Opciones (una por línea)</label>
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
                  <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Máx. caracteres</label>
                  <input type="number" value={q.maxChars ?? ''} min={1}
                    onChange={e => setQ(idx, { maxChars: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="Sin límite" className={`w-full ${MINI_INPUT_CLS}`} />
                </div>
              )}
              {q.type === 'boolean' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Etiqueta Sí</label>
                    <input value={q.labelTrue ?? ''}
                      onChange={e => setQ(idx, { labelTrue: e.target.value || undefined })}
                      placeholder="Sí" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-[#c6c9ab] uppercase mb-1">Etiqueta No</label>
                    <input value={q.labelFalse ?? ''}
                      onChange={e => setQ(idx, { labelFalse: e.target.value || undefined })}
                      placeholder="No" className={`w-full ${MINI_INPUT_CLS}`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 border border-white/7 text-[#c6c9ab] hover:text-white font-mono text-xs uppercase rounded-xl transition-all"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.title.trim()}
          className="flex-1 py-3 bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-xl hover:bg-[#d4a800] active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? 'Guardando…' : isNew ? 'Crear cuestionario' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
