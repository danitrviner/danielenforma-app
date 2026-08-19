import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, QuestionnaireQuestion,
  BodyweightLog, BodyMeasurement,
} from '../types';
import { submitResponse, addBodyweight, saveBodyMeasurement, uploadQuestionnaireMedia } from '../dbService';
import { resolveQuestions } from '../utils/questionnaireResolve';
import { todayStr } from '../utils/questionnaireSchedule';
import { bodyweightForAthleteKey } from '../hooks/useAthleteWeight';
import { useBodyMeasurements, bodyMeasurementsForAthleteKey } from '../hooks/useBodyMeasurements';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Icon, Button, ProgressBar } from './ui';

interface Props {
  questionnaire: Questionnaire;
  assignment: QuestionnaireAssignment;
  athleteEmail: string;
  /** Último peso conocido — prefill de una pregunta 'metric' de peso corporal. */
  currentWeight?: number;
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

export default function QuestionnaireWizard({ questionnaire, assignment, athleteEmail, currentWeight, onSubmitted, onCancel }: Props) {
  const queryClient = useQueryClient();
  const { latest: latestMeasurements } = useBodyMeasurements(athleteEmail);
  // resolveQuestions aplica los overrides de personalización por cliente que el
  // coach configura en ClientReviewsPanel. Sin esto, el chip "personalizado · N"
  // que ve el coach no tendría ningún efecto en lo que responde el atleta.
  const questions = useMemo(() => resolveQuestions(questionnaire, assignment), [questionnaire, assignment]);
  const initial = useMemo(() => loadDraft(assignment.id), [assignment.id]);
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [stepIdx, setStepIdx] = useState(() => Math.min(Math.max(initial?.stepIdx ?? 0, 0), questions.length - 1));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  // 05-7. Las preguntas numéricas llamaban a `setAnswer(parseFloat(value))`, y
  // `parseFloat('')` es NaN. Vaciar el campo —o escribir «72,5», que en un
  // <input type="number"> con teclado español el navegador entrega como cadena
  // vacía— metía NaN en el estado, y de ahí a Firestore. Firestore no tiene NaN:
  // lo guarda como un doble NaN que después rompe cualquier media, gráfica o
  // comparación que toque ese campo, y encima la pregunta consta como
  // respondida. Se filtra en el único sitio por el que pasan todas las
  // respuestas, para que ninguna vía futura pueda saltárselo: un número no
  // finito significa «sin responder», y lo correcto es borrar la clave.
  const setAnswer = (value: string | number | boolean) => {
    setError('');
    setAnswers(prev => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        const { [question.id]: _descartado, ...resto } = prev;
        return resto;
      }
      return { ...prev, [question.id]: value };
    });
  };

  const prefillFor = (q: QuestionnaireQuestion): number | undefined => {
    if (q.type !== 'metric' || !q.metricKey) return undefined;
    if (q.metricKey === 'bodyweight') return currentWeight;
    return latestMeasurements[q.metricKey]?.value;
  };

  const subirMedia = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      setAnswer(await uploadQuestionnaireMedia(athleteEmail, question.id, file));
    } catch (e) {
      console.error('uploadQuestionnaireMedia failed:', e);
      setError(mensajeDeErrorFirestore(e, `subir el archivo de "${question.label}"`));
    } finally {
      setUploading(false);
    }
  };

  /**
   * Las respuestas de tipo 'metric' se guardan además como serie propia —el peso
   * reutiliza bodyweightLogs, los perímetros van a bodyMeasurements— para que se
   * puedan graficar y correlacionar. Va EN PARALELO a la respuesta del
   * cuestionario, no en su lugar.
   */
  const persistirMediciones = async (response: QuestionnaireResponse) => {
    const hoy = todayStr();
    for (const q of questions) {
      if (q.type !== 'metric' || !q.metricKey) continue;
      const valor = Number(answers[q.id]);
      if (answers[q.id] === undefined || isNaN(valor)) continue;

      if (q.metricKey === 'bodyweight') {
        const entry = await addBodyweight({
          athleteId: athleteEmail, date: hoy, weight: valor,
          kind: 'daily', createdAt: new Date().toISOString(),
        });
        queryClient.setQueryData<BodyweightLog[]>(bodyweightForAthleteKey(athleteEmail), prev => [...(prev ?? []), entry]);
      } else {
        const entry = await saveBodyMeasurement({
          athleteId: athleteEmail, date: hoy, metricKey: q.metricKey, value: valor, unit: 'cm',
          source: 'questionnaire', responseId: response.id, createdAt: new Date().toISOString(),
        });
        queryClient.setQueryData<BodyMeasurement[]>(bodyMeasurementsForAthleteKey(athleteEmail), prev =>
          [...(prev ?? []).filter(m => m.id !== entry.id), entry]
        );
      }
    }
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
      // Después de la respuesta, no antes: si `submitResponse` falla no queremos
      // haber escrito ya una medición de un cuestionario que no existe.
      await persistirMediciones(response);
      clearDraft(assignment.id);
      onSubmitted(response);
    } catch (e) {
      console.error('submitResponse failed:', e);
      setError(mensajeDeErrorFirestore(e, 'enviar el cuestionario'));
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
          {question.type === 'metric' && question.metricKey && ` (${question.metricKey === 'bodyweight' ? 'kg' : 'cm'})`}
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

        {/* 'metric' y 'media' venían de QuestionnaireForm, el formulario de una
            página al que el wizard sustituyó. Sin ellos una pregunta de medición
            corporal salía EN BLANCO y el atleta no podía responderla: la función
            entera de mediciones habría nacido muerta al integrar las dos ramas. */}
        {question.type === 'metric' && (
          <input
            type="number"
            step={0.1}
            value={(answers[question.id] as string) ?? ''}
            onChange={e => setAnswer(parseFloat(e.target.value))}
            placeholder={prefillFor(question) !== undefined ? String(prefillFor(question)) : undefined}
            className="w-full bg-raised border-0 border-b border-hairline text-white font-mono text-title-m p-3 focus:ring-0 focus:border-accent transition-colors"
          />
        )}

        {question.type === 'media' && (
          <div className="space-y-2">
            <input
              type="file"
              accept={question.mediaKind === 'video' ? 'video/*' : question.mediaKind === 'image' ? 'image/*' : 'video/*,image/*'}
              onChange={e => { const f = e.target.files?.[0]; if (f) subirMedia(f); }}
              disabled={uploading}
              aria-label={`Adjuntar archivo para ${question.label}`}
              className="w-full font-sans text-title-s text-ink-2 file:mr-3 file:py-2 file:px-3 file:rounded-control file:border-0 file:bg-accent file:text-on-accent file:font-sans file:font-bold"
            />
            {uploading && <p className="font-mono text-caption text-ink-2">Subiendo…</p>}
            {typeof answers[question.id] === 'string' && !uploading && (
              <p className="font-mono text-caption text-success">Archivo subido</p>
            )}
          </div>
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
