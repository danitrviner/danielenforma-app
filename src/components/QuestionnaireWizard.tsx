import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, QuestionnaireQuestion,
  BodyweightLog, BodyMeasurement, BODY_METRIC_UNITS,
} from '../types';
import { submitResponse, guardarPesoDelDia, saveBodyMeasurement, uploadQuestionnaireMedia } from '../dbService';
import { resolveQuestions } from '../utils/questionnaireResolve';
import { pasosDeCuestionario } from '../utils/pasosDeCuestionario';
import { todayStr } from '../utils/questionnaireSchedule';
import { bodyweightForAthleteKey, invalidarExtremosDePeso } from '../hooks/useAthleteWeight';
import { useBodyMeasurements, bodyMeasurementsForAthleteKey } from '../hooks/useBodyMeasurements';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { useToast } from '../hooks/useToast';
import { Icon, Button } from './ui';

type Answers = Record<string, string | number | boolean>;

/** Lo que se guarda para retomar: respuestas hasta ahora y la pantalla en que iba. */
export interface BorradorDeCuestionario { answers: Answers; stepIdx: number }

interface Props {
  questionnaire: Questionnaire;
  assignment: QuestionnaireAssignment;
  athleteEmail: string;
  /** Último peso conocido — prefill de una pregunta 'metric' de peso corporal. */
  currentWeight?: number;
  /** Borrador guardado de esta misma asignación (viene del servidor, ver `useProgresoRevision`). */
  borrador?: BorradorDeCuestionario | null;
  /** Se llama (con retraso) en cada cambio, y con `null` al enviar. Sin esto no se guarda nada. */
  onBorrador?: (b: BorradorDeCuestionario | null) => void;
  onSubmitted: (r: QuestionnaireResponse) => void;
  onCancel: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   QuestionnaireWizard — una pantalla por pregunta (K-03)

   La pregunta va grande y arriba (24 px, no el 11 px en mayúsculas de antes);
   las escalas, en botones de 52 px. Las respuestas sencillas (numéricas y
   medidas) se agrupan de tres en tres: ver `utils/pasosDeCuestionario`.

   «Guardado, sales y vuelves» (K-02): el borrador ya NO vive en localStorage
   sino en el servidor, dentro del progreso de la revisión semanal, así que se
   retoma desde otro dispositivo. Este componente no sabe dónde se guarda:
   recibe `borrador` y avisa con `onBorrador`. Las respuestas se siguen enviando
   como siempre, una por cuestionario, con `submitResponse`.
   ═══════════════════════════════════════════════════════════════════════════ */

const ESPERA_GUARDADO_MS = 600;

export default function QuestionnaireWizard({ questionnaire, assignment, athleteEmail, currentWeight, borrador, onBorrador, onSubmitted, onCancel }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { latest: latestMeasurements } = useBodyMeasurements(athleteEmail);
  // resolveQuestions aplica los overrides de personalización por cliente que el
  // coach configura en ClientReviewsPanel. Sin esto, el chip "personalizado · N"
  // que ve el coach no tendría ningún efecto en lo que responde el atleta.
  const questions = useMemo(() => resolveQuestions(questionnaire, assignment), [questionnaire, assignment]);
  const pasos = useMemo(() => pasosDeCuestionario(questions), [questions]);
  const [answers, setAnswers] = useState<Answers>(borrador?.answers ?? {});
  const [stepIdx, setStepIdx] = useState(() => Math.min(Math.max(borrador?.stepIdx ?? 0, 0), Math.max(pasos.length - 1, 0)));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);

  const grupo = (pasos[stepIdx] ?? []).map(i => questions[i]);
  const unica = grupo.length === 1 ? grupo[0] : null;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === pasos.length - 1;

  // Autoguardado con retraso: cada respuesta o cambio de pantalla se guarda,
  // pero no una escritura por cada tecla.
  const primeraVez = useRef(true);
  const onBorradorRef = useRef(onBorrador);
  onBorradorRef.current = onBorrador;
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }
    if (Object.keys(answers).length === 0) return;
    const guardar = setTimeout(() => {
      onBorradorRef.current?.({ answers, stepIdx });
      setSavedFlash(true);
    }, ESPERA_GUARDADO_MS);
    const apagar = setTimeout(() => setSavedFlash(false), ESPERA_GUARDADO_MS + 1200);
    return () => { clearTimeout(guardar); clearTimeout(apagar); };
  }, [answers, stepIdx]);

  // 05-7. Las preguntas numéricas llamaban a `setAnswer(parseFloat(value))`, y
  // `parseFloat('')` es NaN. Vaciar el campo —o escribir «72,5», que en un
  // <input type="number"> con teclado español el navegador entrega como cadena
  // vacía— metía NaN en el estado, y de ahí a Firestore. Firestore no tiene NaN:
  // lo guarda como un doble NaN que después rompe cualquier media, gráfica o
  // comparación que toque ese campo, y encima la pregunta consta como
  // respondida. Se filtra en el único sitio por el que pasan todas las
  // respuestas, para que ninguna vía futura pueda saltárselo: un número no
  // finito significa «sin responder», y lo correcto es borrar la clave.
  const setAnswer = (questionId: string, value: string | number | boolean) => {
    setError('');
    setAnswers(prev => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        const { [questionId]: _descartado, ...resto } = prev;
        return resto;
      }
      return { ...prev, [questionId]: value };
    });
  };

  const prefillFor = (q: QuestionnaireQuestion): number | undefined => {
    if (q.type !== 'metric' || !q.metricKey) return undefined;
    if (q.metricKey === 'bodyweight') return currentWeight;
    return latestMeasurements[q.metricKey]?.value;
  };

  const subirMedia = async (question: QuestionnaireQuestion, file: File) => {
    setUploading(true);
    setError('');
    try {
      setAnswer(question.id, await uploadQuestionnaireMedia(athleteEmail, question.id, file));
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
  /**
   * Devuelve cuántas mediciones no se pudieron guardar, en vez de lanzar.
   *
   * La respuesta al cuestionario ya está enviada cuando esto corre. Si una
   * medición falla —una regla de Firestore mal escrita, por ejemplo— y el error
   * subiera, el atleta vería «no se pudo enviar el cuestionario» sobre un
   * cuestionario que SÍ se envió, y al reintentar crearía una respuesta
   * duplicada (`submitResponse` hace un documento nuevo cada vez). Las
   * mediciones van «en paralelo, no en su lugar»: que fallen se avisa aparte y
   * no deshace el envío. Reintentar más tarde tampoco duplica medición: su id
   * es determinista (`${atleta}_${fecha}_${metrica}`).
   */
  const persistirMediciones = async (response: QuestionnaireResponse): Promise<number> => {
    const hoy = todayStr();
    let fallidas = 0;
    for (const q of questions) {
      if (q.type !== 'metric' || !q.metricKey) continue;
      const valor = Number(answers[q.id]);
      if (answers[q.id] === undefined || isNaN(valor)) continue;

      try {
        if (q.metricKey === 'bodyweight') {
          // Un peso por día: si hoy ya hay uno se corrige, no se duplica.
          const deHoy = queryClient.getQueryData<BodyweightLog[]>(bodyweightForAthleteKey(athleteEmail))?.find(l => l.date === hoy);
          const entry = await guardarPesoDelDia(athleteEmail, hoy, valor, deHoy);
          queryClient.setQueryData<BodyweightLog[]>(bodyweightForAthleteKey(athleteEmail), prev => [...(prev ?? []).filter(l => l.id !== entry.id), entry]);
          // El peso que se registra desde el cuestionario cuenta igual que el
          // del panel: los extremos pueden haber cambiado.
          invalidarExtremosDePeso(queryClient, athleteEmail);
        } else {
          const entry = await saveBodyMeasurement({
            athleteId: athleteEmail, date: hoy, metricKey: q.metricKey, value: valor,
            unit: BODY_METRIC_UNITS[q.metricKey],
            source: 'questionnaire', responseId: response.id, createdAt: new Date().toISOString(),
          });
          queryClient.setQueryData<BodyMeasurement[]>(bodyMeasurementsForAthleteKey(athleteEmail), prev =>
            [...(prev ?? []).filter(m => m.id !== entry.id), entry]
          );
        }
      } catch (err) {
        console.error(`No se pudo guardar la medición ${q.metricKey}:`, err);
        fallidas++;
      }
    }
    return fallidas;
  };

  const goBack = () => {
    setError('');
    setStepIdx(i => Math.max(0, i - 1));
  };

  const goNext = async () => {
    if (grupo.some(q => q.required && answers[q.id] === undefined)) {
      setError(grupo.length > 1 ? 'Rellena lo obligatorio para continuar.' : 'Responde para continuar.');
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
      const fallidas = await persistirMediciones(response);
      if (fallidas > 0) {
        showToast(fallidas === 1
          ? 'Enviado, pero una de tus medidas no se ha podido guardar. Apúntala en Perfil › Revisión.'
          : `Enviado, pero ${fallidas} de tus medidas no se han podido guardar. Apúntalas en Perfil › Revisión.`);
      }
      onBorrador?.(null);
      onSubmitted(response);
    } catch (e) {
      console.error('submitResponse failed:', e);
      setError(mensajeDeErrorFirestore(e, 'enviar el cuestionario'));
    } finally {
      setSaving(false);
    }
  };

  /** El control de UNA pregunta. `grande` = es la única de la pantalla. */
  const renderControl = (question: QuestionnaireQuestion) => {
    const valor = answers[question.id];
    const campoNumero = 'w-full bg-raised border-0 border-b border-hairline text-ink font-mono text-title-m p-3 focus:ring-0 focus:border-accent transition-colors';
    return (
      <>
        {question.type === 'text' && (
          <textarea
            value={(valor as string) ?? ''}
            onChange={e => setAnswer(question.id, e.target.value)}
            maxLength={question.maxChars}
            placeholder="Escribe aquí..."
            className="w-full bg-raised border-0 border-b border-hairline text-ink text-title-s p-3 focus:ring-0 focus:border-accent transition-colors min-h-[120px]"
          />
        )}

        {question.type === 'numeric' && (
          <input
            type="number"
            inputMode="decimal"
            step={question.decimals ? Math.pow(10, -question.decimals) : 1}
            min={question.min}
            max={question.max}
            value={(valor as string) ?? ''}
            onChange={e => setAnswer(question.id, parseFloat(e.target.value))}
            aria-label={question.label}
            className={campoNumero}
          />
        )}

        {/* 'metric' y 'media' venían de QuestionnaireForm, el formulario de una
            página al que el wizard sustituyó. Sin ellos una pregunta de medición
            corporal salía EN BLANCO y el atleta no podía responderla: la función
            entera de mediciones habría nacido muerta al integrar las dos ramas. */}
        {question.type === 'metric' && (
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            value={(valor as string) ?? ''}
            onChange={e => setAnswer(question.id, parseFloat(e.target.value))}
            placeholder={prefillFor(question) !== undefined ? String(prefillFor(question)) : undefined}
            aria-label={question.label}
            className={campoNumero}
          />
        )}

        {question.type === 'media' && (
          <div className="space-y-2">
            <input
              type="file"
              accept={question.mediaKind === 'video' ? 'video/*' : question.mediaKind === 'image' ? 'image/*' : 'video/*,image/*'}
              onChange={e => { const f = e.target.files?.[0]; if (f) subirMedia(question, f); }}
              disabled={uploading}
              aria-label={`Adjuntar archivo para ${question.label}`}
              className="w-full font-sans text-title-s text-ink-2 file:mr-3 file:py-2 file:px-3 file:rounded-control file:border-0 file:bg-accent file:text-on-accent file:font-sans file:font-bold"
            />
            {uploading && <p className="font-mono text-caption text-ink-2">Subiendo…</p>}
            {typeof valor === 'string' && !uploading && (
              <p className="font-mono text-caption text-success">Archivo subido</p>
            )}
          </div>
        )}

        {question.type === 'scale' && (() => {
          const min = question.scaleMin ?? 1;
          const max = question.scaleMax ?? 10;
          const n = max - min + 1;
          return (
            <div className="space-y-2">
              <div className={`grid gap-2 ${n <= 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
                {Array.from({ length: n }, (_, i) => min + i).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAnswer(question.id, v)}
                    aria-pressed={valor === v}
                    className={`h-[52px] rounded-control font-mono text-title-s font-bold transition-[color,background-color,border-color,opacity,transform,box-shadow] active:scale-95 ${
                      valor === v
                        ? 'bg-accent text-on-accent'
                        : 'bg-raised text-ink-2 border border-hairline hover:border-accent/50'
                    }`}
                  >{v}</button>
                ))}
              </div>
              {(question.scaleMinLabel || question.scaleMaxLabel) && (
                <div className="flex justify-between text-caption font-sans text-ink-2">
                  <span>{question.scaleMinLabel}</span>
                  <span>{question.scaleMaxLabel}</span>
                </div>
              )}
            </div>
          );
        })()}

        {question.type === 'boolean' && (
          <div className="flex gap-2">
            {([true, false] as const).map(v => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setAnswer(question.id, v)}
                aria-pressed={valor === v}
                className={`flex-1 py-3 font-sans text-label rounded-control border transition-[color,background-color,border-color,opacity,transform,box-shadow] min-h-[52px] active:scale-95 ${
                  valor === v
                    ? 'bg-accent text-on-accent font-bold border-transparent'
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
                ? ((valor as string | undefined) ?? '').split(',').filter(Boolean)
                : [];
              const isSelected = question.multiSelect ? curSelected.includes(opt) : valor === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    if (question.multiSelect) {
                      const next = isSelected ? curSelected.filter(o => o !== opt) : [...curSelected, opt];
                      setAnswer(question.id, next.join(','));
                    } else {
                      setAnswer(question.id, opt);
                    }
                  }}
                  aria-pressed={isSelected}
                  className={`w-full py-3 px-4 text-label font-sans rounded-control border text-left transition-[color,background-color,border-color,opacity,transform,box-shadow] min-h-[52px] active:scale-[0.99] ${
                    isSelected
                      ? 'bg-accent text-on-accent border-transparent font-bold'
                      : 'bg-raised text-ink border-hairline'
                  }`}
                >{opt}</button>
              );
            })}
          </div>
        )}
      </>
    );
  };

  /** Unidad que se escribe junto al enunciado. */
  const unidadDe = (q: QuestionnaireQuestion) =>
    q.type === 'metric' && q.metricKey ? (q.metricKey === 'bodyweight' ? 'kg' : 'cm') : q.unit;

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-ink-2 hover:text-ink transition-colors p-1" aria-label="Cerrar">
          <Icon name="close" size="m" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-mono text-caption uppercase tracking-[.16em] text-ink-2">
          {questionnaire.title} · {stepIdx + 1} de {pasos.length}
        </span>
        <span className={`font-sans text-caption font-bold uppercase text-accent-ink transition-opacity duration-(--duration-base) ${savedFlash ? 'opacity-100' : 'opacity-0'}`}>
          Guardado
        </span>
      </div>

      {/* Progreso por pantallas, no una barra continua: se ve cuánto queda. */}
      <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={pasos.length} aria-valuenow={stepIdx + 1} aria-label={`Pantalla ${stepIdx + 1} de ${pasos.length}`}>
        {pasos.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= stepIdx ? 'bg-accent' : 'bg-hairline'}`} />
        ))}
      </div>

      <div key={stepIdx} className="space-y-5 animate-fade-up">
        {isFirst && questionnaire.description && (
          <p className="text-label text-ink-2 font-sans">{questionnaire.description}</p>
        )}

        {unica ? (
          <div className="space-y-4">
            <h2 className="font-sans font-bold text-title-l leading-tight text-ink">
              {unica.label}{unidadDe(unica) && <span className="ml-2 font-mono text-title-s font-normal text-ink-2">({unidadDe(unica)})</span>}
            </h2>
            {unica.helpText && <p className="font-sans text-body-s text-ink-2">{unica.helpText}</p>}
            {renderControl(unica)}
            {!unica.required && <p className="font-sans text-caption text-ink-3">Opcional: puedes pasar a la siguiente sin responder.</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {grupo.map(q => (
              <div key={q.id} className="space-y-2">
                <p className="font-sans font-bold text-title-s text-ink">
                  {q.label}{unidadDe(q) && <span className="ml-2 font-mono text-body-s font-normal text-ink-2">({unidadDe(q)})</span>}
                  {!q.required && <span className="ml-2 font-sans text-caption font-normal text-ink-3">opcional</span>}
                </p>
                {q.helpText && <p className="font-sans text-caption text-ink-3">{q.helpText}</p>}
                {renderControl(q)}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-label text-danger font-sans" role="alert">{error}</p>}

      <div className="flex gap-2 pt-2">
        <Button variant="secondary" size="l" icon="arrow_back" label="Pantalla anterior" onClick={goBack} disabled={isFirst || saving} />
        <Button
          variant="primary" size="l" fullWidth
          iconTrailing={isLast ? 'send' : 'arrow_forward'}
          onClick={goNext}
          disabled={saving || uploading}
          loading={saving}
          loadingLabel="Enviando"
        >
          {isLast ? 'Enviar respuesta' : 'Siguiente'}
        </Button>
      </div>
    </div>
  );
}
