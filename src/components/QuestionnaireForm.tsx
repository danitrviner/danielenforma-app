import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, QuestionnaireQuestion,
  BodyweightLog, BodyMeasurement, BODY_METRIC_LABELS,
} from '../types';
import { submitResponse, addBodyweight, saveBodyMeasurement, uploadQuestionnaireMedia } from '../dbService';
import { resolveQuestions } from '../utils/questionnaireResolve';
import { todayStr } from '../utils/questionnaireSchedule';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { useBodyMeasurements, bodyMeasurementsForAthleteKey } from '../hooks/useBodyMeasurements';

// Formulario de respuesta a un cuestionario asignado. Extraído de
// CheckInScreen.tsx (vivía inline, sin exportar) para poder crecer: aplica
// resolveQuestions() (overrides de personalización por cliente) antes de
// renderizar, y añade los renderers de los tipos 'metric' y 'media'.

interface Props {
  questionnaire: Questionnaire;
  assignment: QuestionnaireAssignment;
  athleteEmail: string;
  currentWeight?: number; // último peso conocido (bwKey ya cargado por CheckInScreen) — prefill de 'metric' bodyweight
  onSubmitted: (r: QuestionnaireResponse) => void;
  onCancel: () => void;
}

export default function QuestionnaireForm({
  questionnaire, assignment, athleteEmail, currentWeight, onSubmitted, onCancel,
}: Props) {
  const queryClient = useQueryClient();
  const { latest: latestMeasurements } = useBodyMeasurements(athleteEmail);
  const questions = resolveQuestions(questionnaire, assignment);

  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setAnswer = (qId: string, value: string | number | boolean) =>
    setAnswers(prev => ({ ...prev, [qId]: value }));

  const prefillFor = (q: QuestionnaireQuestion): number | undefined => {
    if (q.type !== 'metric' || !q.metricKey) return undefined;
    if (q.metricKey === 'bodyweight') return currentWeight;
    return latestMeasurements[q.metricKey]?.value;
  };

  const handleMediaUpload = async (q: QuestionnaireQuestion, file: File) => {
    setUploading(prev => ({ ...prev, [q.id]: true }));
    setErr('');
    try {
      const url = await uploadQuestionnaireMedia(athleteEmail, q.id, file);
      setAnswer(q.id, url);
    } catch (e) {
      console.error(e);
      setErr(`Error al subir el archivo de "${q.label}". Inténtalo de nuevo.`);
    } finally {
      setUploading(prev => ({ ...prev, [q.id]: false }));
    }
  };

  // Persiste las respuestas 'metric' como serie propia (peso reutiliza
  // bodyweightLogs; el resto de perímetros va a bodyMeasurements) — en
  // paralelo a la respuesta del cuestionario, no en su lugar.
  const persistMetrics = async (response: QuestionnaireResponse) => {
    const today = todayStr();
    const metricQuestions = questions.filter(q => q.type === 'metric' && q.metricKey);
    for (const q of metricQuestions) {
      const raw = answers[q.id];
      if (raw === undefined) continue;
      const value = Number(raw);
      if (isNaN(value)) continue;

      if (q.metricKey === 'bodyweight') {
        const entry = await addBodyweight({
          athleteId: athleteEmail, date: today, weight: value,
          kind: 'daily', createdAt: new Date().toISOString(),
        });
        queryClient.setQueryData<BodyweightLog[]>(bodyweightForAthleteKey(athleteEmail), prev => [...(prev ?? []), entry]);
      } else if (q.metricKey) {
        const entry = await saveBodyMeasurement({
          athleteId: athleteEmail, date: today, metricKey: q.metricKey, value, unit: 'cm',
          source: 'questionnaire', responseId: response.id, createdAt: new Date().toISOString(),
        });
        queryClient.setQueryData<BodyMeasurement[]>(bodyMeasurementsForAthleteKey(athleteEmail), prev => {
          const withoutSameDay = (prev ?? []).filter(m => m.id !== entry.id);
          return [...withoutSameDay, entry];
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = questions.filter(q => q.required && answers[q.id] === undefined);
    if (missing.length > 0) {
      setErr(`Por favor responde: ${missing.map(q => q.label).join(', ')}`);
      return;
    }
    setErr('');
    setSaving(true);
    try {
      const payload = questions
        .filter(q => answers[q.id] !== undefined)
        .map(q => ({ questionId: q.id, value: answers[q.id] }));
      const response = await submitResponse({
        questionnaireId: questionnaire.id,
        assignmentId: assignment.id,
        athleteId: athleteEmail,
        submittedAt: new Date().toISOString(),
        answers: payload,
      });
      await persistMetrics(response);
      onSubmitted(response);
    } catch (e) {
      console.error(e);
      setErr('Error al enviar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#181816] border border-white/7 rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5 pb-2 border-b border-white/7">
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
        {questions.map((q: QuestionnaireQuestion) => (
          <div key={q.id}>
            <label className="block font-mono text-[11px] text-[#c6c9ab] uppercase tracking-wider mb-2">
              {q.label}{q.required && ' *'}{q.unit && ` (${q.unit})`}
              {q.type === 'metric' && q.metricKey && ` (${q.metricKey === 'bodyweight' ? 'kg' : 'cm'})`}
            </label>
            {q.helpText && <p className="text-[11px] text-[#c6c9ab]/70 mb-2">{q.helpText}</p>}

            {q.type === 'text' && (
              <textarea
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                maxLength={q.maxChars}
                placeholder="Escribe aquí..."
                className="w-full bg-[#1e1e1e] border-0 border-b border-white/7 text-[#e5e2e1] text-xs p-2.5 focus:ring-0 focus:border-[#fbcb1a] transition-colors min-h-[60px]"
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
                className="w-full bg-[#1e1e1e] border-0 border-b border-white/7 text-white font-mono p-2.5 focus:ring-0 focus:border-[#fbcb1a] transition-colors"
              />
            )}

            {q.type === 'metric' && (
              <input
                type="number"
                step={0.1}
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, parseFloat(e.target.value))}
                placeholder={prefillFor(q) !== undefined ? String(prefillFor(q)) : undefined}
                className="w-full bg-[#1e1e1e] border-0 border-b border-white/7 text-white font-mono p-2.5 focus:ring-0 focus:border-[#fbcb1a] transition-colors"
              />
            )}

            {q.type === 'media' && (
              <div className="space-y-2">
                <input
                  type="file"
                  accept={q.mediaKind === 'video' ? 'video/*' : q.mediaKind === 'image' ? 'image/*' : 'video/*,image/*'}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleMediaUpload(q, f); }}
                  disabled={uploading[q.id]}
                  className="w-full text-xs text-[#c6c9ab] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#fbcb1a] file:text-black file:font-sans file:font-bold file:text-xs"
                />
                {uploading[q.id] && <p className="text-[10px] font-mono text-[#c6c9ab]">Subiendo…</p>}
                {typeof answers[q.id] === 'string' && !uploading[q.id] && (
                  <p className="text-[10px] font-mono text-[#00eefc]">✓ Archivo subido</p>
                )}
              </div>
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
                          ? 'bg-[#fbcb1a] text-black'
                          : 'bg-[#1e1e1e] text-[#c6c9ab] border border-white/7 hover:border-[#fbcb1a]/50'
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
                        ? 'bg-[#fbcb1a] text-black font-bold border-transparent'
                        : 'bg-[#1e1e1e] text-[#e5e2e1] border-white/7'
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
                        ? 'bg-[#fbcb1a] text-black border-transparent font-bold'
                        : 'bg-[#1e1e1e] text-[#e5e2e1] border-white/7'
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
          disabled={saving || Object.values(uploading).some(Boolean)}
          className="w-full h-[44px] bg-[#fbcb1a] text-black font-sans font-bold text-xs uppercase rounded-lg hover:bg-opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? 'Enviando...' : 'Enviar Respuesta'}
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </form>
    </div>
  );
}

// Reexportado por si algún día se quiere mostrar la etiqueta de un metricKey
// fuera de este formulario sin importar directamente de types.ts.
export { BODY_METRIC_LABELS };
