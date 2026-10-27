import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Questionnaire, QuestionnaireAssignment, QuestionnaireResponse, QuestionnaireQuestion,
  BodyweightLog, BodyMeasurement, BODY_METRIC_UNITS, AutoRelleno,
} from '../types';
import { submitResponse, guardarPesoDelDia, saveBodyMeasurement, uploadQuestionnaireMedia } from '../dbService';
import { resolveQuestions } from '../utils/questionnaireResolve';
import { pasosDeCuestionario, esDeAgujetas } from '../utils/pasosDeCuestionario';
import type { ZonaEntrenada } from '../utils/cuestionarioAuto';
import AgujetasPaso from './cuestionario/AgujetasPaso';
import MapaGrupos, { esPreguntaDeMapa } from './cuestionario/MapaGrupos';
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
  /** Lo que la app ya sabe de la semana: rellena las preguntas con `autoRelleno`. */
  autoRellenos?: Partial<Record<AutoRelleno, number>>;
  /** Zonas que entrenó esta semana (agujetas: solo se pregunta por esas). */
  zonasEntrenadas?: ZonaEntrenada[];
  onSubmitted: (r: QuestionnaireResponse) => void;
  onCancel: () => void;
}

/** Id de la respuesta donde va el comentario de una escala o de mantener/cambiar. */
export const idComentario = (questionId: string) => `${questionId}__comentario`;

/* ═══════════════════════════════════════════════════════════════════════════
   QuestionnaireWizard — conversación con selección rápida (27-10)

   Cada pregunta llega como un mensaje del coach: el contexto en una burbuja y
   la pregunta destacada debajo (19 px, no los 24 de antes). Se responde
   tocando: escalas en una fila, mantener/cambiar en dos botones con texto solo
   si cambia, agujetas y grupos musculares en el mapa corporal. Arriba, los
   bloques del cuestionario («Tu plan», «Sensaciones»…); al final, un repaso
   de todo antes de enviar. Las respuestas sencillas (numéricas y medidas) se
   agrupan de tres en tres: ver `utils/pasosDeCuestionario`.

   «Guardado, sales y vuelves» (K-02): el borrador ya NO vive en localStorage
   sino en el servidor, dentro del progreso de la revisión semanal, así que se
   retoma desde otro dispositivo. Este componente no sabe dónde se guarda:
   recibe `borrador` y avisa con `onBorrador`. Las respuestas se siguen enviando
   como siempre, una por cuestionario, con `submitResponse`.
   ═══════════════════════════════════════════════════════════════════════════ */

const ESPERA_GUARDADO_MS = 600;

export default function QuestionnaireWizard({
  questionnaire, assignment, athleteEmail, currentWeight, borrador, onBorrador,
  autoRellenos, zonasEntrenadas = [], onSubmitted, onCancel,
}: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { latest: latestMeasurements } = useBodyMeasurements(athleteEmail);
  // resolveQuestions aplica los overrides de personalización por cliente que el
  // coach configura en ClientReviewsPanel. Sin esto, el chip "personalizado · N"
  // que ve el coach no tendría ningún efecto en lo que responde el atleta.
  const questions = useMemo(() => resolveQuestions(questionnaire, assignment), [questionnaire, assignment]);
  const pasos = useMemo(() => pasosDeCuestionario(questions), [questions]);
  // Lo que la app ya sabe sale contestado (pasos, peso, sesiones hechas): el
  // atleta solo lo confirma o lo corrige. Nunca pisa lo que ya respondió.
  const [answers, setAnswers] = useState<Answers>(() => {
    const base: Answers = { ...(borrador?.answers ?? {}) };
    for (const q of questions) {
      const v = q.autoRelleno ? autoRellenos?.[q.autoRelleno] : undefined;
      if (v !== undefined && base[q.id] === undefined) base[q.id] = v;
    }
    return base;
  });
  // El paso `pasos.length` es el repaso antes de enviar (solo si hay más de uno).
  const hayRepaso = pasos.length > 1;
  const ultimoPaso = hayRepaso ? pasos.length : pasos.length - 1;
  const [stepIdx, setStepIdx] = useState(() => Math.min(Math.max(borrador?.stepIdx ?? 0, 0), Math.max(ultimoPaso, 0)));
  const [comentarioAbierto, setComentarioAbierto] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);

  const enRepaso = hayRepaso && stepIdx === pasos.length;
  const grupo = enRepaso ? [] : (pasos[stepIdx] ?? []).map(i => questions[i]);
  const unica = grupo.length === 1 ? grupo[0] : null;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === ultimoPaso;
  // Agujetas: un paso con todas las zonas (solo se exigen las entrenadas).
  const pasoAgujetas = grupo.length > 0 && grupo.every(esDeAgujetas);

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
      if ((typeof value === 'number' && !Number.isFinite(value)) || value === '') {
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

  /** Primer paso con una obligatoria sin responder, o -1. */
  const pasoIncompleto = () => pasos.findIndex(p => p.some(i => {
    const q = questions[i];
    return q.required && answers[q.id] === undefined && !(esDeAgujetas(q) && !zonaEntrenada(q));
  }));
  const zonaEntrenada = (q: QuestionnaireQuestion) =>
    zonasEntrenadas.length === 0 || zonasEntrenadas.some(z => `agujetas.${z.zona}` === q.signalKey);

  const enviar = async () => {
    const falta = pasoIncompleto();
    if (falta >= 0) {
      setStepIdx(falta);
      setError('Falta alguna respuesta obligatoria.');
      return;
    }
    setSaving(true);
    try {
      // Cada pregunta y, detrás, su comentario si lo tiene (`${id}__comentario`).
      const payload = questions.flatMap(q => {
        const out: { questionId: string; value: string | number | boolean }[] = [];
        if (answers[q.id] !== undefined) out.push({ questionId: q.id, value: answers[q.id] });
        const c = answers[idComentario(q.id)];
        if (typeof c === 'string' && c.trim()) out.push({ questionId: idComentario(q.id), value: c.trim() });
        return out;
      });
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

  const goNext = async () => {
    if (enRepaso) { await enviar(); return; }
    const faltaAqui = grupo.some(q => q.required && answers[q.id] === undefined && !(esDeAgujetas(q) && !zonaEntrenada(q)));
    if (faltaAqui) {
      setError(grupo.length > 1 ? 'Rellena lo obligatorio para continuar.' : 'Responde para continuar.');
      return;
    }
    setError('');
    if (!isLast) { setStepIdx(i => i + 1); return; }
    await enviar();
  };

  /* ── Controles ─────────────────────────────────────────────────────────── */

  const campoTexto = 'w-full bg-raised border border-control-line rounded-control text-ink text-body p-3 focus:ring-2 focus:ring-accent-bg focus:border-accent-line transition-colors';
  const campoNumero = 'w-full bg-raised border border-control-line rounded-control text-ink font-mono text-title-m tabular-nums p-3 focus:ring-2 focus:ring-accent-bg focus:border-accent-line transition-colors';

  /** Dos botones grandes que se excluyen (sí/no, mantener/cambiar). */
  const dosOpciones = (question: QuestionnaireQuestion, opciones: [string | boolean, string][]) => (
    <div className="grid grid-cols-2 gap-1 bg-raised border border-control-line rounded-control p-1" role="radiogroup" aria-label={question.label}>
      {opciones.map(([v, etiqueta]) => {
        const sel = answers[question.id] === v;
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => setAnswer(question.id, v)}
            className={`min-h-[44px] rounded-[10px] font-sans text-label transition-colors active:scale-[0.98] ${sel ? 'bg-accent text-on-accent font-bold' : 'text-ink-3 hover:text-ink'}`}
          >{etiqueta}</button>
        );
      })}
    </div>
  );

  /** Comentario opcional bajo una escala (o el «qué cambiarías» de mantener/cambiar). */
  const comentario = (question: QuestionnaireQuestion, placeholder: string, siempreAbierto = false) => {
    const id = idComentario(question.id);
    const valor = (answers[id] as string | undefined) ?? '';
    const abierto = siempreAbierto || comentarioAbierto[question.id] || valor.length > 0;
    if (!abierto) {
      return (
        <button
          type="button"
          onClick={() => setComentarioAbierto(c => ({ ...c, [question.id]: true }))}
          className="w-full flex items-center gap-2 bg-raised border border-dashed border-hairline rounded-control px-3 py-3 font-sans text-label text-ink-4 hover:text-ink transition-colors"
        >
          <Icon name="add_comment" size="s" className="text-accent-ink" />
          {placeholder}
        </button>
      );
    }
    return (
      <textarea
        value={valor}
        onChange={e => setAnswer(id, e.target.value)}
        placeholder={placeholder}
        autoFocus={!siempreAbierto && !valor}
        aria-label={`${question.label} — comentario`}
        className={`${campoTexto} min-h-[84px]`}
      />
    );
  };

  /** El control de UNA pregunta. */
  const renderControl = (question: QuestionnaireQuestion) => {
    const valor = answers[question.id];
    const auto = question.autoRelleno && autoRellenos?.[question.autoRelleno] !== undefined && valor === autoRellenos?.[question.autoRelleno];
    return (
      <>
        {question.type === 'text' && (
          <textarea
            value={(valor as string) ?? ''}
            onChange={e => setAnswer(question.id, e.target.value)}
            maxLength={question.maxChars}
            placeholder="Escribe tu respuesta…"
            aria-label={question.label}
            className={`${campoTexto} min-h-[112px]`}
          />
        )}

        {(question.type === 'numeric' || question.type === 'metric') && (
          <input
            type="number"
            inputMode="decimal"
            step={question.type === 'metric' ? 0.1 : question.decimals ? Math.pow(10, -question.decimals) : 1}
            min={question.min}
            max={question.max}
            value={(valor as string) ?? ''}
            onChange={e => setAnswer(question.id, parseFloat(e.target.value))}
            placeholder={question.type === 'metric' && prefillFor(question) !== undefined ? String(prefillFor(question)) : undefined}
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
              className="w-full font-sans text-label text-ink-2 file:mr-3 file:py-2 file:px-3 file:rounded-control file:border-0 file:bg-accent file:text-on-accent file:font-sans file:font-bold"
            />
            {uploading && <p className="font-mono text-caption text-ink-2">Subiendo…</p>}
            {typeof valor === 'string' && !uploading && <p className="font-mono text-caption text-success">Archivo subido</p>}
          </div>
        )}

        {question.type === 'scale' && (() => {
          const min = question.scaleMin ?? 1;
          const max = question.scaleMax ?? 10;
          const n = max - min + 1;
          const elegido = typeof valor === 'number' ? valor : null;
          return (
            <div className="space-y-1.5">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(n, 10)}, minmax(0, 1fr))` }} role="radiogroup" aria-label={question.label}>
                {Array.from({ length: n }, (_, i) => min + i).map(v => {
                  const sel = elegido === v;
                  const relleno = elegido != null && v < elegido;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      onClick={() => setAnswer(question.id, v)}
                      className={`${n <= 5 ? 'h-12' : 'h-11'} rounded-[10px] font-mono text-label tabular-nums transition-colors active:scale-95 ${
                        sel ? 'bg-accent text-on-accent font-bold'
                          : relleno ? 'bg-accent-bg text-accent-ink'
                            : 'bg-raised text-ink-3 border border-hairline hover:border-accent-line'
                      }`}
                    >{v}</button>
                  );
                })}
              </div>
              {(question.scaleMinLabel || question.scaleMaxLabel) && (
                <div className="flex justify-between font-sans text-caption text-ink-4">
                  <span>{question.scaleMinLabel}</span>
                  <span>{question.scaleMaxLabel}</span>
                </div>
              )}
              {question.conComentario && <div className="pt-1.5">{comentario(question, '¿Algo que quieras comentar? (opcional)')}</div>}
            </div>
          );
        })()}

        {question.type === 'boolean' && (
          <div className="space-y-2">
            {dosOpciones(question, [[true, question.labelTrue ?? 'Sí'], [false, question.labelFalse ?? 'No']])}
            {question.conComentario && valor === true && comentario(question, 'Cuéntame dónde y cómo', true)}
          </div>
        )}

        {question.type === 'keep_change' && (
          <div className="space-y-2">
            {dosOpciones(question, [['mantener', question.labelTrue ?? 'Lo mantengo'], ['cambiar', question.labelFalse ?? 'Quiero un cambio']])}
            {valor === 'cambiar' && comentario(question, '¿Qué cambiarías?', true)}
            {valor === 'mantener' && question.conComentario && comentario(question, '¿Algo que quieras comentar? (opcional)')}
          </div>
        )}

        {question.type === 'choice' && question.options && (esPreguntaDeMapa(question) ? (
          <MapaGrupos pregunta={question} valor={valor as string | undefined} onChange={v => setAnswer(question.id, v)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {question.options.map(opt => {
              const curSelected: string[] = question.multiSelect ? ((valor as string | undefined) ?? '').split(',').filter(Boolean) : [];
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
                  className={`min-h-[44px] px-4 rounded-full border font-sans text-label transition-colors active:scale-[0.98] ${
                    isSelected ? 'bg-accent-bg border-accent-line text-accent-ink font-bold' : 'bg-raised border-hairline text-ink-2'
                  }`}
                >{opt}</button>
              );
            })}
          </div>
        ))}

        {auto && (
          <p className="flex items-center gap-1.5 font-sans text-caption text-ink-4">
            <Icon name="auto_awesome" size="s" className="text-accent-ink" />
            Lo saca la app de tu semana. Cámbialo si no cuadra.
          </p>
        )}
      </>
    );
  };

  /** Unidad que se escribe junto al enunciado. */
  const unidadDe = (q: QuestionnaireQuestion) =>
    q.type === 'metric' && q.metricKey ? (q.metricKey === 'bodyweight' ? 'kg' : 'cm') : q.unit;

  /* ── Bloques y repaso ──────────────────────────────────────────────────── */

  // Bloques en orden de aparición. Sin bloques, la barra es una raya por pantalla.
  const bloques = useMemo(() => [...new Set(questions.map(q => q.bloque).filter((b): b is string => !!b))], [questions]);
  const bloqueDelPaso = (i: number) => questions[pasos[i]?.[0] ?? -1]?.bloque;
  const bloqueActual = enRepaso ? null : bloqueDelPaso(stepIdx);

  /** Lo que se enseña de una respuesta en el repaso. */
  const resumen = (q: QuestionnaireQuestion): { texto: string; pill?: string } => {
    const v = answers[q.id];
    const c = answers[idComentario(q.id)];
    const coment = typeof c === 'string' && c.trim() ? c.trim() : '';
    if (v === undefined) return { texto: '' };
    if (q.type === 'scale') return { texto: coment, pill: `${v}/${q.scaleMax ?? 10}` };
    if (q.type === 'keep_change') return { texto: coment, pill: v === 'mantener' ? (q.labelTrue ?? 'Lo mantengo') : (q.labelFalse ?? 'Cambio') };
    if (q.type === 'boolean') return { texto: coment, pill: v ? (q.labelTrue ?? 'Sí') : (q.labelFalse ?? 'No') };
    if (q.type === 'media') return { texto: 'Archivo subido' };
    if (q.type === 'metric' || q.type === 'numeric') return { texto: '', pill: `${String(v).replace('.', ',')}${unidadDe(q) ? ` ${unidadDe(q)}` : ''}` };
    return { texto: String(v).split(',').join(', ') };
  };

  const repaso = () => {
    // Una fila por pantalla: las agujetas se resumen en una sola.
    const grupos = new Map<string, number[]>();
    pasos.forEach((p, i) => {
      const b = bloqueDelPaso(i) ?? 'Respuestas';
      grupos.set(b, [...(grupos.get(b) ?? []), i]);
    });
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-sans font-bold text-title-m text-ink">Revisa antes de enviar</h2>
          <p className="font-sans text-body-s text-ink-3 mt-0.5">Toca cualquier respuesta para cambiarla.</p>
        </div>
        {[...grupos].map(([bloque, idxs]) => (
          <div key={bloque} className="space-y-1.5">
            {bloques.length > 0 && <p className="font-mono text-caption uppercase tracking-[.14em] text-ink-4">{bloque}</p>}
            <div className="bg-surface border border-hairline rounded-control divide-y divide-hairline overflow-hidden">
              {idxs.flatMap(i => {
                const qs = pasos[i].map(j => questions[j]);
                if (qs.every(esDeAgujetas)) {
                  const notas = qs.filter(q => typeof answers[q.id] === 'number');
                  return [(
                    <button key={`p${i}`} type="button" onClick={() => setStepIdx(i)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-raised/60">
                      <span className="flex-1 min-w-0">
                        <span className="block font-sans text-caption font-bold text-ink-4">Agujetas</span>
                        <span className="block font-sans text-label text-ink truncate">
                          {notas.length > 0 ? notas.map(q => `${(q.tituloCorto ?? q.label).split(' (')[0]} ${answers[q.id]}`).join(' · ') : 'Sin responder'}
                        </span>
                      </span>
                      <Icon name="edit" size="s" className="text-ink-5" />
                    </button>
                  )];
                }
                return qs.map(q => {
                  const { texto, pill } = resumen(q);
                  const vacia = answers[q.id] === undefined;
                  return (
                    <button key={q.id} type="button" onClick={() => setStepIdx(i)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-raised/60">
                      <span className="flex-1 min-w-0">
                        <span className="block font-sans text-caption font-bold text-ink-4 truncate">{q.tituloCorto ?? q.label}</span>
                        {(texto || vacia) && (
                          <span className={`block font-sans text-label truncate ${vacia ? (q.required ? 'text-accent-ink' : 'text-ink-5 italic') : 'text-ink'}`}>
                            {vacia ? (q.required ? 'Falta responder' : 'Sin responder') : texto}
                          </span>
                        )}
                      </span>
                      {pill ? <span className="shrink-0 font-mono text-caption font-bold tabular-nums px-2 py-0.5 rounded-full bg-accent-bg text-accent-ink">{pill}</span>
                        : <Icon name="edit" size="s" className="text-ink-5" />}
                    </button>
                  );
                });
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /* ── Pantalla ───────────────────────────────────────────────────────────── */

  // Burbuja del coach: el contexto (si lo hay) y la pregunta destacada.
  const burbujas = (q: QuestionnaireQuestion, conPregunta = true) => (
    <div className="flex gap-2.5 items-start">
      <span className="w-8 h-8 shrink-0 rounded-full bg-accent text-on-accent grid place-items-center" aria-hidden>
        <Icon name="fitness_center" size="s" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-sans text-caption text-ink-4">Tu coach{q.bloque ? ` · ${q.bloque}` : ''}</p>
        {q.contexto && (
          <p className="bg-surface border border-hairline rounded-[6px_16px_16px_16px] px-3.5 py-2.5 font-sans text-body-s text-ink-2 text-pretty">{q.contexto}</p>
        )}
        {conPregunta && (
          <h2 className={`bg-surface border border-hairline px-3.5 py-2.5 font-sans font-bold text-title-s sm:text-title-m leading-snug text-ink text-pretty ${q.contexto ? 'rounded-2xl' : 'rounded-[6px_16px_16px_16px]'}`}>
            {q.label}{unidadDe(q) && <span className="ml-1.5 font-mono text-label font-normal text-ink-3">({unidadDe(q)})</span>}
          </h2>
        )}
        {conPregunta && q.helpText && <p className="font-sans text-caption text-ink-4 px-1 text-pretty">{q.helpText}</p>}
      </div>
    </div>
  );

  // Eco de la respuesta anterior (corta), para que se lea como una conversación.
  const eco = (() => {
    if (enRepaso || stepIdx === 0) return null;
    const prev = (pasos[stepIdx - 1] ?? []).map(i => questions[i]);
    if (prev.length !== 1) return null;
    const q = prev[0];
    if (!['scale', 'keep_change', 'boolean', 'choice'].includes(q.type) || esPreguntaDeMapa(q)) return null;
    const { pill, texto } = resumen(q);
    const t = pill ?? texto;
    if (!t) return null;
    return (
      <div className="flex justify-end opacity-60">
        <p className="max-w-[80%] bg-accent-bg rounded-[16px_16px_6px_16px] px-3 py-1.5 font-sans text-caption text-ink truncate">
          {(q.tituloCorto ?? '').trim() ? `${q.tituloCorto}: ` : ''}<b className="text-accent-ink">{t}</b>
        </p>
      </div>
    );
  })();

  const total = pasos.length;
  const contador = enRepaso ? 'Repaso' : `${stepIdx + 1} de ${total}`;
  const opcionalUnica = unica && !unica.required && !pasoAgujetas;

  return (
    <div className="bg-surface border border-hairline rounded-surface p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-ink-3 hover:text-ink transition-colors p-1 -m-1" aria-label="Cerrar">
          <Icon name="close" size="m" />
        </button>
        <span className="min-w-0 flex-1 truncate font-sans text-label font-bold text-ink-2">{questionnaire.title}</span>
        <span className="font-mono text-caption tabular-nums text-ink-3">
          {savedFlash ? <span className="inline-flex items-center gap-1 font-sans text-ink-4"><Icon name="check_circle" size="s" className="text-success" />Guardado</span> : contador}
        </span>
      </div>

      {bloques.length > 1 ? (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${bloques.length}, minmax(0, 1fr))` }} role="progressbar" aria-valuemin={1} aria-valuemax={ultimoPaso + 1} aria-valuenow={stepIdx + 1} aria-label={`Pantalla ${stepIdx + 1} de ${ultimoPaso + 1}`}>
          {bloques.map((b, bi) => {
            const pasosDelBloque = pasos.map((_, i) => i).filter(i => bloqueDelPaso(i) === b);
            const hechos = pasosDelBloque.filter(i => i < stepIdx).length + (bloqueActual === b ? 0.5 : 0);
            const pct = enRepaso || pasosDelBloque.length === 0 ? 100 : Math.min(100, (hechos / pasosDelBloque.length) * 100);
            const actual = bloqueActual === b;
            const pasado = enRepaso || pasosDelBloque.every(i => i < stepIdx);
            return (
              <div key={b} className="min-w-0">
                <div className="h-[3px] rounded-full bg-hairline overflow-hidden"><div className="h-full bg-accent rounded-full transition-[width] duration-300" style={{ width: `${pasado ? 100 : actual ? Math.max(pct, 15) : 0}%` }} /></div>
                <p className={`mt-1.5 truncate font-mono text-[10.5px] uppercase tracking-[.08em] ${actual ? 'text-accent-ink' : pasado ? 'text-ink-4' : 'text-ink-5'}`} title={b}>{bloques.length > 4 ? `${bi + 1}` : b}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={ultimoPaso + 1} aria-valuenow={stepIdx + 1} aria-label={`Pantalla ${stepIdx + 1} de ${ultimoPaso + 1}`}>
          {Array.from({ length: ultimoPaso + 1 }, (_, i) => (
            <span key={i} className={`h-[3px] flex-1 rounded-full ${i <= stepIdx ? 'bg-accent' : 'bg-hairline'}`} />
          ))}
        </div>
      )}

      <div key={stepIdx} className="space-y-4 animate-fade-up">
        {isFirst && questionnaire.description && (
          <p className="font-sans text-body-s text-ink-3 text-pretty">{questionnaire.description}</p>
        )}

        {enRepaso ? repaso() : (
          <>
            {eco}
            {pasoAgujetas ? (
              <>
                {burbujas({ ...grupo[0], contexto: undefined, label: '¿Cuánto te dolió cada zona unas 48 h después de entrenarla?', helpText: undefined, unit: undefined }, true)}
                <AgujetasPaso preguntas={grupo} answers={answers} setAnswer={(id, v) => setAnswer(id, v)} entrenadas={zonasEntrenadas} />
              </>
            ) : unica ? (
              <>
                {burbujas(unica)}
                <div className="space-y-2">
                  <p className="font-mono text-caption uppercase tracking-[.14em] text-ink-4 flex justify-between">
                    <span>Tu respuesta</span>
                    {opcionalUnica && <span className="normal-case tracking-normal font-sans border border-hairline rounded-full px-2">Opcional</span>}
                  </p>
                  {renderControl(unica)}
                </div>
              </>
            ) : (
              <>
                {burbujas(grupo[0], false)}
                <div className="space-y-4">
                  {grupo.map(q => (
                    <div key={q.id} className="space-y-1.5">
                      <p className="font-sans font-bold text-label text-ink">
                        {q.label}{unidadDe(q) && <span className="ml-1.5 font-mono text-caption font-normal text-ink-3">({unidadDe(q)})</span>}
                        {!q.required && <span className="ml-2 font-sans text-caption font-normal text-ink-4">opcional</span>}
                      </p>
                      {q.helpText && <p className="font-sans text-caption text-ink-4">{q.helpText}</p>}
                      {renderControl(q)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {error && <p className="text-label text-danger font-sans" role="alert">{error}</p>}

      <div className="flex gap-2 pt-1">
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
