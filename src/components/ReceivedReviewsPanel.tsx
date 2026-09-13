import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WeightCheckIn, Questionnaire, QuestionnaireResponse } from '../types';
import {
  submitCoachFeedback, updateCheckIn, deleteCheckIn,
  updateQuestionnaireResponse, deleteQuestionnaireResponse,
} from '../dbService';
import { useToast } from '../hooks/useToast';
import { mensajeDeErrorFirestore } from '../utils/erroresFirestore';
import { Badge, Button, Icon } from './ui';
import { pulsable } from '../utils/a11y';

/* ═══════════════════════════════════════════════════════════════════════════
   ReceivedReviewsPanel — «lo que ha mandado el atleta» (Revisiones › Recibidas)

   Era un acordeón: una lista larga donde cada fila se desplegaba hacia abajo,
   así que leer una respuesta empujaba el resto de la pantalla y comparar dos
   era subir y bajar a ciegas. Pasa a lista + detalle (las Submissions de
   HubFit): a la izquierda el hilo entero —lo más reciente arriba, que es lo
   que se mira—, a la derecha la revisión elegida completa. En móvil no hay dos
   columnas: el detalle se apila debajo de la lista y se trae a la vista solo.

   También desaparece el bloque «Respuestas enviadas» que había debajo: era la
   misma lista de respuestas otra vez, con otro orden y limitada a 10.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  athleteCheckins: WeightCheckIn[];
  onRefreshCheckIns: () => void;
  athleteQResponses: QuestionnaireResponse[];
  setAthleteQResponses: React.Dispatch<React.SetStateAction<QuestionnaireResponse[]>>;
  coachQuestionnaires: Questionnaire[];
}

type ReviewItem =
  | { kind: 'checkin'; key: string; sortKey: number; data: WeightCheckIn }
  | { kind: 'response'; key: string; sortKey: number; data: QuestionnaireResponse; questionnaire?: Questionnaire };

function milisDelCheckin(c: WeightCheckIn): number {
  if (c.timestamp instanceof Date) return c.timestamp.getTime();
  const conToDate = c.timestamp as unknown as { toDate?: () => Date };
  return conToDate?.toDate?.().getTime() ?? new Date(c.timestamp as unknown as string).getTime();
}

const fechaLarga = (iso: string | number | Date) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Un `dateStr` es YYYY-MM-DD sin hora: pasarlo a `new Date` lo lee como
 *  medianoche UTC y en medio mundo se pinta el día anterior. Con 'T00:00:00'
 *  se lee en hora local, que es lo que el atleta puso. */
const fechaLargaDeDia = (dateStr: string) => fechaLarga(`${dateStr}T00:00:00`);

export default function ReceivedReviewsPanel({
  athleteCheckins, onRefreshCheckIns,
  athleteQResponses, setAthleteQResponses,
  coachQuestionnaires,
}: Props) {
  const { showToast } = useToast();

  // Lo más reciente arriba: al abrir la ficha de un atleta lo que se mira es
  // lo último que ha mandado, no lo que mandó hace tres meses.
  const items = useMemo<ReviewItem[]>(() => ([
    ...athleteCheckins.map(c => ({
      kind: 'checkin' as const, key: `c_${c.id}`, sortKey: milisDelCheckin(c), data: c,
    })),
    ...athleteQResponses.map(r => ({
      kind: 'response' as const, key: `r_${r.id}`, sortKey: new Date(r.submittedAt).getTime(), data: r,
      questionnaire: coachQuestionnaires.find(q => q.id === r.questionnaireId),
    })),
  ]).sort((a, b) => b.sortKey - a.sortKey), [athleteCheckins, athleteQResponses, coachQuestionnaires]);

  const [seleccion, setSeleccion] = useState<string | null>(null);
  // La selección se cae sola cuando el elemento elegido deja de existir (se
  // borró) o cuando todavía no se ha elegido nada: en los dos casos manda el
  // más reciente, para que el panel de la derecha nunca esté vacío teniendo
  // algo que enseñar.
  const elegido = items.find(i => i.key === seleccion) ?? items[0];

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackOk, setFeedbackOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [editando, setEditando] = useState<string | null>(null);
  const [checkinEditForm, setCheckinEditForm] = useState<{
    weight: number; adherence: WeightCheckIn['adherence']; mood: string; notes: string; dateStr: string;
  } | null>(null);
  const [responseEditAnswers, setResponseEditAnswers] = useState<QuestionnaireResponse['answers']>([]);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  // Al cambiar de elemento, el panel arranca limpio: el borrador de feedback
  // del anterior no puede colarse en otro check-in.
  useEffect(() => {
    setEditando(null);
    setCheckinEditForm(null);
    setResponseEditAnswers([]);
    setFeedbackError('');
    setFeedbackOk('');
    setFeedbackText(elegido?.kind === 'checkin' ? (elegido.data.coachFeedback || '') : '');
    // Depende SOLO de la clave a propósito: el feedback ya guardado vuelve por
    // `onRefreshCheckIns` y volvería a sembrar el textarea encima de lo que el
    // coach esté escribiendo si `coachFeedback` estuviera en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido?.key]);

  // En móvil las dos columnas se apilan: sin esto, elegir una fila cambia un
  // panel que está fuera de la pantalla y parece que no ha pasado nada.
  const detalleRef = useRef<HTMLDivElement>(null);
  const primeraRenderizacion = useRef(true);
  useEffect(() => {
    if (primeraRenderizacion.current) { primeraRenderizacion.current = false; return; }
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [elegido?.key]);

  const enviarFeedback = async (checkInId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) { setFeedbackError('Escribe tu feedback para el atleta.'); return; }
    setFeedbackError('');
    setFeedbackOk('');
    setEnviando(true);
    try {
      await submitCoachFeedback(checkInId, feedbackText);
      setFeedbackOk('¡Feedback enviado y check-in aprobado!');
      onRefreshCheckIns();
      setTimeout(() => setFeedbackOk(''), 4000);
    } catch (err) {
      console.error(err);
      setFeedbackError(mensajeDeErrorFirestore(err, 'enviar el feedback'));
    } finally {
      setEnviando(false);
    }
  };

  const guardarEdicionCheckin = async (id: string) => {
    if (!checkinEditForm) return;
    setGuardandoEdicion(true);
    try {
      await updateCheckIn(id, checkinEditForm);
      onRefreshCheckIns();
      setEditando(null);
      setCheckinEditForm(null);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'guardar el check-in'));
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const borrarCheckin = async (id: string) => {
    if (!confirm('¿Eliminar este check-in permanentemente? Esta acción no se puede deshacer.')) return;
    setBorrando(id);
    try {
      await deleteCheckIn(id);
      onRefreshCheckIns();
      setSeleccion(null);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'eliminar el check-in'));
    } finally {
      setBorrando(null);
    }
  };

  const guardarEdicionRespuesta = async (id: string) => {
    setGuardandoEdicion(true);
    try {
      await updateQuestionnaireResponse(id, responseEditAnswers);
      setAthleteQResponses(prev => prev.map(r => r.id === id ? { ...r, answers: responseEditAnswers } : r));
      setEditando(null);
      setResponseEditAnswers([]);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'guardar la respuesta'));
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const borrarRespuesta = async (id: string) => {
    if (!confirm('¿Eliminar esta respuesta permanentemente? Esta acción no se puede deshacer.')) return;
    setBorrando(id);
    try {
      await deleteQuestionnaireResponse(id);
      setAthleteQResponses(prev => prev.filter(r => r.id !== id));
      setSeleccion(null);
    } catch (err) {
      console.error(err);
      showToast(mensajeDeErrorFirestore(err, 'eliminar la respuesta'));
    } finally {
      setBorrando(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-hairline rounded-surface p-10 text-center text-ink-2">
        <Icon name="history_edu" size="xl" className="text-ink-3 block mx-auto mb-2" />
        <p className="text-body-s font-bold text-ink">Sin revisiones todavía</p>
        <p className="text-label mt-1">Los check-ins y respuestas del atleta aparecerán aquí.</p>
      </div>
    );
  }

  const barraDeAcciones = (onEditar: () => void, onBorrar: () => void, id: string) => (
    <div className="flex items-center gap-2">
      <Button size="s" variant="secondary" icon="edit" onClick={onEditar}>Editar</Button>
      <Button size="s" variant="danger" icon="delete" onClick={onBorrar} loading={borrando === id} loadingLabel="Borrando">
        Eliminar
      </Button>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[19rem_1fr] lg:gap-4 lg:items-start space-y-4 lg:space-y-0">
      {/* ── Columna izquierda: el hilo ──────────────────────────────────── */}
      <div className="bg-surface border border-hairline rounded-surface overflow-hidden lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-hairline bg-raised flex items-center gap-2">
          <Icon name="history_edu" size="s" className="text-accent" />
          <h3 className="font-sans font-bold text-title-s text-ink uppercase tracking-wide">Recibidas</h3>
          <span className="font-mono text-caption text-ink-2 ml-auto tabular-nums">{items.length}</span>
        </div>
        <ul className="divide-y divide-hairline/40 lg:max-h-[68vh] lg:overflow-y-auto">
          {items.map(item => {
            const activo = item.key === elegido?.key;
            const esCheckin = item.kind === 'checkin';
            const titulo = esCheckin ? 'Check-in' : (item.questionnaire?.title ?? 'Cuestionario');
            const fecha = esCheckin ? fechaLargaDeDia(item.data.dateStr) : fechaLarga(item.data.submittedAt);
            return (
              <li key={item.key}>
                <div
                  {...pulsable(() => setSeleccion(item.key))}
                  aria-current={activo}
                  className={
                    'flex items-center gap-3 px-4 py-3 cursor-pointer border-l-2 transition-colors '
                    + (activo ? 'bg-raised border-l-accent' : 'border-l-transparent hover:bg-raised/60')
                  }
                >
                  <Icon
                    name={esCheckin ? 'rate_review' : 'quiz'}
                    size="m"
                    className={esCheckin ? (item.data.approved ? 'text-accent' : 'text-warning') : 'text-data'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-ink text-label truncate">{titulo}</p>
                    <p className="font-mono text-caption text-ink-2 tabular-nums">{fecha}</p>
                  </div>
                  {esCheckin && !item.data.approved && <Badge tone="warning">Pendiente</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Columna derecha: la revisión elegida, entera ────────────────── */}
      <div ref={detalleRef} className="bg-surface border border-hairline rounded-surface overflow-hidden scroll-mt-4">
        {elegido?.kind === 'checkin' ? (() => {
          const c = elegido.data;
          const enEdicion = editando === elegido.key;
          return (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-sans font-bold text-title-m text-ink">Check-in</h3>
                  <p className="font-mono text-caption text-ink-2 tabular-nums">{fechaLargaDeDia(c.dateStr)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.approved ? 'success' : 'warning'}>{c.approved ? 'Revisado' : 'Pendiente'}</Badge>
                  {!enEdicion && barraDeAcciones(
                    () => {
                      setCheckinEditForm({ weight: c.weight, adherence: c.adherence, mood: c.mood || '', notes: c.notes || '', dateStr: c.dateStr || '' });
                      setEditando(elegido.key);
                    },
                    () => borrarCheckin(c.id),
                    c.id,
                  )}
                </div>
              </div>

              {enEdicion && checkinEditForm ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="rev-peso" className="block font-mono text-caption text-ink-2 uppercase mb-1">Peso (kg)</label>
                      <input id="rev-peso" type="number" step="0.1" value={checkinEditForm.weight}
                        onChange={e => setCheckinEditForm(f => f && ({ ...f, weight: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono" />
                    </div>
                    <div>
                      <label htmlFor="rev-fecha" className="block font-mono text-caption text-ink-2 uppercase mb-1">Fecha</label>
                      <input id="rev-fecha" type="text" value={checkinEditForm.dateStr}
                        onChange={e => setCheckinEditForm(f => f && ({ ...f, dateStr: e.target.value }))}
                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="rev-adherencia" className="block font-mono text-caption text-ink-2 uppercase mb-1">Adherencia</label>
                      <select id="rev-adherencia" value={checkinEditForm.adherence}
                        onChange={e => setCheckinEditForm(f => f && ({ ...f, adherence: e.target.value as WeightCheckIn['adherence'] }))}
                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono">
                        {['Sí', 'Parcial', 'No'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="rev-humor" className="block font-mono text-caption text-ink-2 uppercase mb-1">Humor</label>
                      <select id="rev-humor" value={checkinEditForm.mood}
                        onChange={e => setCheckinEditForm(f => f && ({ ...f, mood: e.target.value }))}
                        className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono">
                        {['😩', '😴', '😐', '😊', '🔥'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="rev-notas" className="block font-mono text-caption text-ink-2 uppercase mb-1">Notas</label>
                    <textarea id="rev-notas" value={checkinEditForm.notes}
                      onChange={e => setCheckinEditForm(f => f && ({ ...f, notes: e.target.value }))}
                      className="w-full bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-sans resize-none min-h-[60px]" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="s" icon="save" onClick={() => guardarEdicionCheckin(c.id)} loading={guardandoEdicion} loadingLabel="Guardando">
                      Guardar
                    </Button>
                    <Button size="s" variant="ghost" onClick={() => { setEditando(null); setCheckinEditForm(null); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 font-mono text-label">
                    {[
                      { label: 'Peso', value: `${c.weight} kg`, color: 'text-ink' },
                      { label: 'Adherencia', value: c.adherence, color: 'text-accent' },
                      { label: 'Humor', value: c.mood || '😊', color: 'text-ink' },
                    ].map(cell => (
                      <div key={cell.label} className="bg-raised p-3 rounded-surface border border-hairline">
                        <span className="block text-ink-2 text-caption uppercase">{cell.label}</span>
                        <strong className={`${cell.color} tabular-nums`}>{cell.value}</strong>
                      </div>
                    ))}
                  </div>

                  {c.notes && (
                    <div className="bg-raised p-3 rounded-surface border border-hairline">
                      <span className="block font-mono text-caption text-ink-2 uppercase mb-1">Notas del atleta</span>
                      <p className="text-label text-ink-2 font-sans italic text-pretty">"{c.notes}"</p>
                    </div>
                  )}

                  {feedbackOk && (
                    <div className="bg-accent/15 border border-accent/30 text-ink p-3 rounded-surface text-label flex items-center gap-2">
                      <Icon name="check_circle" size="s" className="text-accent" />
                      {feedbackOk}
                    </div>
                  )}
                  {feedbackError && (
                    <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-surface text-label font-sans">{feedbackError}</div>
                  )}

                  <form onSubmit={e => enviarFeedback(c.id, e)} className="space-y-2">
                    <label htmlFor="rev-feedback" className="block font-mono text-caption text-ink-2 uppercase tracking-wider">
                      Tu respuesta
                    </label>
                    <textarea
                      id="rev-feedback"
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="Ajustes nutricionales, indicaciones de cargas, observaciones motivacionales..."
                      className="w-full bg-raised border border-hairline rounded-control p-3 text-title-s text-ink focus:ring-1 focus:ring-accent focus:outline-none min-h-[96px] resize-none font-sans"
                    />
                    <Button type="submit" iconTrailing="send" loading={enviando} loadingLabel="Enviando">
                      Enviar y aprobar
                    </Button>
                  </form>
                </>
              )}
            </div>
          );
        })() : elegido ? (() => {
          const r = elegido.data;
          const q = elegido.questionnaire;
          const enEdicion = editando === elegido.key;
          return (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sans font-bold text-title-m text-ink text-pretty">{q?.title ?? 'Cuestionario ya no disponible'}</h3>
                  <p className="font-mono text-caption text-ink-2 tabular-nums">
                    {fechaLarga(r.submittedAt)} · {r.answers.length} respuesta{r.answers.length === 1 ? '' : 's'}
                  </p>
                </div>
                {!enEdicion && barraDeAcciones(
                  () => { setResponseEditAnswers(r.answers.map(a => ({ ...a }))); setEditando(elegido.key); },
                  () => borrarRespuesta(r.id),
                  r.id,
                )}
              </div>

              {enEdicion ? (
                <div className="space-y-2">
                  {responseEditAnswers.map((ans, idx) => {
                    const question = q?.questions.find(qq => qq.id === ans.questionId);
                    const isNum = question?.type === 'numeric' || question?.type === 'scale';
                    const isBool = question?.type === 'boolean';
                    const isChoice = question?.type === 'choice';
                    return (
                      <div key={ans.questionId} className="flex items-center gap-3">
                        <span className="font-sans text-caption text-ink-2 flex-1 text-pretty">{question?.label ?? ans.questionId}</span>
                        {isChoice && question?.options ? (
                          <select value={String(ans.value)} aria-label={question?.label ?? ans.questionId}
                            onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                            className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono w-32">
                            {question.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : isBool ? (
                          <select value={String(ans.value)} aria-label={question?.label ?? ans.questionId}
                            onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value === 'true' } : a))}
                            className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-sans w-24">
                            <option value="true">{question?.labelTrue ?? 'Sí'}</option>
                            <option value="false">{question?.labelFalse ?? 'No'}</option>
                          </select>
                        ) : isNum ? (
                          <input type="number" value={String(ans.value)} aria-label={question?.label ?? ans.questionId}
                            onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: parseFloat(e.target.value) || 0 } : a))}
                            className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono w-24 text-right tabular-nums" />
                        ) : (
                          <input type="text" value={String(ans.value)} aria-label={question?.label ?? ans.questionId}
                            onChange={e => setResponseEditAnswers(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                            className="bg-raised border border-hairline rounded-control px-2 py-2 text-title-s text-ink focus:outline-none focus:border-data/50 font-mono flex-1 min-w-0" />
                        )}
                      </div>
                    );
                  })}
                  <div className="flex gap-2 pt-1">
                    <Button size="s" icon="save" onClick={() => guardarEdicionRespuesta(r.id)} loading={guardandoEdicion} loadingLabel="Guardando">
                      Guardar
                    </Button>
                    <Button size="s" variant="ghost" onClick={() => { setEditando(null); setResponseEditAnswers([]); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <ol className="divide-y divide-hairline/40">
                  {r.answers.map((ans, idx) => {
                    const question = q?.questions.find(qq => qq.id === ans.questionId);
                    return (
                      <li key={ans.questionId} className="py-2.5 flex items-start gap-3">
                        <span className="font-mono text-caption text-ink-3 tabular-nums w-5 shrink-0">{idx + 1}</span>
                        <span className="font-sans text-label text-ink-2 flex-1 text-pretty">{question?.label ?? ans.questionId}</span>
                        <span className="font-mono text-label text-ink font-bold text-right tabular-nums">
                          {String(ans.value)}{question?.unit ? ` ${question.unit}` : ''}
                          {question?.type === 'boolean' ? (ans.value ? ' ✓' : ' ✗') : ''}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })() : null}
      </div>
    </div>
  );
}
