import React, { useEffect, useMemo, useState } from 'react';
import { Questionnaire, QuestionnaireAssignment, QuestionnaireResponse } from '../types';
import { submitResponse } from '../dbService';
import { todayStr } from '../utils/questionnaireSchedule';
import { Icon, Button, ProgressBar } from './ui';

interface Props {
  questionnaire: Questionnaire;
  assignment: QuestionnaireAssignment;
  athleteEmail: string;
  onSubmitted: (r: QuestionnaireResponse) => void;
  onCancel: () => void;
}

type Answers = Record<string, string | number | boolean>;
interface Draft { answers: Answers; stepIdx: number }

/* ═══════════════════════════════════════════════════════════════════════════
   QuestionnaireWizard (F3.13c, pendiente cerrado — "Revisiones - Experiencia"
   panel 03: una pregunta a la vez, con progreso, y "puedes salir y volver".

   Sustituye al `QuestionnaireForm` anterior (formulario largo de una sola
   página, todas las preguntas a la vez). Alcance decidido con Dani: el
   mockup agrupa varias preguntas relacionadas por paso, pero
   `QuestionnaireQuestion` no tiene ningún campo de sección/tema — inventar
   una agrupación sin ese dato sería adivinar. Se hace "una pregunta = un
   paso" (cero cambios de modelo) en vez de tocar el editor del coach para
   añadir secciones.

   "Guardado, sales y vuelves" se resuelve con un borrador en localStorage,
   NO en Firestore: no hay concepto de respuesta parcial en el modelo de
   datos (`submitResponse` es una escritura atómica única), y quedarse en
   ese mismo dispositivo es exactamente el caso real (el móvil del atleta,
   no rellenar a medias en el portátil y terminar en el móvil). La clave del borrador
   incluye la fecha de hoy — `assignment.id` es fijo para TODA la
   recurrencia (semanal/mensual/...), así que sin la fecha un borrador de la
   semana pasada se colaría en la ocasión de esta semana. Efecto colateral
   a propósito: el borrador "caduca" solo con que cambie el día, sin
   necesitar limpieza aparte para el caso normal.
   ═══════════════════════════════════════════════════════════════════════════ */

function draftStorageKey(assignmentId: string): string {
  return `questionnaireDraft_${assignmentId}_${todayStr()}`;
}

function loadDraft(assignmentId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(assignmentId));
    return raw ? JSON.parse(raw) as Draft : null;
  } catch {
    return null;
  }
}

function saveDraft(assignmentId: string, draft: Draft): void {
  try {
    localStorage.setItem(draftStorageKey(assignmentId), JSON.stringify(draft));
  } catch {
    // best-effort: sin localStorage (privado/lleno) el wizard sigue funcionando, solo sin resumir
  }
}

function clearDraft(assignmentId: string): void {
  try {
    // Barre también borradores de días anteriores de este mismo assignment —
    // si no, se acumula uno por cada día que no se llegó a enviar.
    const prefix = `questionnaireDraft_${assignmentId}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.removeItem(k);
    }
  } catch {
    // best-effort
  }
}

export default function QuestionnaireWizard({ questionnaire, assignment, athleteEmail, onSubmitted, onCancel }: Props) {
  const questions = questionnaire.questions;
  const initial = useMemo(() => loadDraft(assignment.id), [assignment.id]);
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [stepIdx, setStepIdx] = useState(() => Math.min(Math.max(initial?.stepIdx ?? 0, 0), questions.length - 1));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const question = questions[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === questions.length - 1;

  // Autoguardado: cada respuesta o cambio de paso persiste al instante.
  useEffect(() => {
    saveDraft(assignment.id, { answers, stepIdx });
    if (Object.keys(answers).length === 0) return;
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1200);
    return () => clearTimeout(t);
  }, [answers, stepIdx, assignment.id]);

  const setAnswer = (value: string | number | boolean) => {
    setError('');
    setAnswers(prev => ({ ...prev, [question.id]: value }));
  };

  const goBack = () => {
    setError('');
    setStepIdx(i => Math.max(0, i - 1));
  };

  const goNext = async () => {
    if (question.required && answers[question.id] === undefined) {
      setError('Responde para continuar.');
      return;
    }
    setError('');
    if (!isLast) {
      setStepIdx(i => i + 1);
      return;
    }

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
      clearDraft(assignment.id);
      onSubmitted(response);
    } catch (e) {
      console.error(e);
      setError('Error al enviar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-ink-2 hover:text-white transition-colors p-1" aria-label="Cerrar">
          <Icon name="close" size="m" />
        </button>
        <span className="font-sans text-caption text-ink-2 uppercase tracking-widest">
          Paso {stepIdx + 1} de {questions.length}
        </span>
        <span className={`ml-auto font-sans text-caption font-bold uppercase text-accent transition-opacity duration-(--duration-base) ${savedFlash ? 'opacity-100' : 'opacity-0'}`}>
          Guardado
        </span>
      </div>

      <ProgressBar value={((stepIdx + 1) / questions.length) * 100} label={`Paso ${stepIdx + 1} de ${questions.length}`} />

      {isFirst && (
        <div>
          <h2 className="font-sans font-bold text-title-m text-white">{questionnaire.title}</h2>
          {questionnaire.description && <p className="text-label text-ink-2 font-sans mt-1">{questionnaire.description}</p>}
        </div>
      )}

      <div key={question.id} className="space-y-3 animate-fade-up">
        <label className="block font-sans text-caption text-ink-2 uppercase tracking-wider">
          {question.label}{question.required && ' *'}{question.unit && ` (${question.unit})`}
        </label>
        {question.helpText && <p className="text-caption text-ink-2/70">{question.helpText}</p>}

        {question.type === 'text' && (
          <textarea
            value={(answers[question.id] as string) ?? ''}
            onChange={e => setAnswer(e.target.value)}
            maxLength={question.maxChars}
            placeholder="Escribe aquí..."
            className="w-full bg-raised border-0 border-b border-hairline text-ink text-title-s p-3 focus:ring-0 focus:border-accent transition-colors min-h-[80px]"
          />
        )}

        {question.type === 'numeric' && (
          <input
            type="number"
            step={question.decimals ? Math.pow(10, -question.decimals) : 1}
            min={question.min}
            max={question.max}
            value={(answers[question.id] as string) ?? ''}
            onChange={e => setAnswer(parseFloat(e.target.value))}
            className="w-full bg-raised border-0 border-b border-hairline text-white font-mono text-title-m p-3 focus:ring-0 focus:border-accent transition-colors"
          />
        )}

        {question.type === 'scale' && (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              {Array.from(
                { length: (question.scaleMax ?? 10) - (question.scaleMin ?? 1) + 1 },
                (_, i) => (question.scaleMin ?? 1) + i
              ).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAnswer(v)}
                  className={`flex-1 min-w-[38px] h-11 rounded-control font-mono text-label font-bold transition-all ${
                    answers[question.id] === v
                      ? 'bg-accent text-black'
                      : 'bg-raised text-ink-2 border border-hairline hover:border-accent/50'
                  }`}
                >{v}</button>
              ))}
            </div>
            {(question.scaleMinLabel || question.scaleMaxLabel) && (
              <div className="flex justify-between text-caption font-mono text-ink-2">
                <span>{question.scaleMin ?? 1} – {question.scaleMinLabel}</span>
                <span>{question.scaleMaxLabel} – {question.scaleMax ?? 10}</span>
              </div>
            )}
          </div>
        )}

        {question.type === 'boolean' && (
          <div className="flex gap-2">
            {([true, false] as const).map(v => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setAnswer(v)}
                className={`flex-1 py-3 font-sans text-label rounded-control border transition-all min-h-[44px] ${
                  answers[question.id] === v
                    ? 'bg-accent text-black font-bold border-transparent'
                    : 'bg-raised text-ink border-hairline'
                }`}
              >{v ? (question.labelTrue ?? 'Sí') : (question.labelFalse ?? 'No')}</button>
            ))}
          </div>
        )}

        {question.type === 'choice' && question.options && (
          <div className="flex flex-col gap-2">
            {question.options.map(opt => {
              const curSelected: string[] = question.multiSelect
                ? ((answers[question.id] as string | undefined) ?? '').split(',').filter(Boolean)
                : [];
              const isSelected = question.multiSelect ? curSelected.includes(opt) : answers[question.id] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    if (question.multiSelect) {
                      const next = isSelected ? curSelected.filter(o => o !== opt) : [...curSelected, opt];
                      setAnswer(next.join(','));
                    } else {
                      setAnswer(opt);
                    }
                  }}
                  className={`w-full py-3 px-3 text-label font-mono rounded-control border text-left transition-all min-h-[44px] ${
                    isSelected
                      ? 'bg-accent text-black border-transparent font-bold'
                      : 'bg-raised text-ink border-hairline'
                  }`}
                >{opt}</button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-label text-danger font-sans">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button variant="secondary" size="l" icon="arrow_back" label="Paso anterior" onClick={goBack} disabled={isFirst || saving} />
        <Button
          variant="primary" size="l" fullWidth
          iconTrailing={isLast ? 'send' : 'arrow_forward'}
          onClick={goNext}
          disabled={saving}
          loading={saving}
          loadingLabel="Enviando"
        >
          {isLast ? 'Enviar respuesta' : 'Siguiente'}
        </Button>
      </div>
    </div>
  );
}
