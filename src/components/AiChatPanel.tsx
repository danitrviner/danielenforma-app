import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AiChat, AiChatMessage, AiProposal, Diet, Mesocycle, MuscleGroup, MUSCLE_LABELS, KnowledgeNote } from '../types';
import {
  getAiChats, saveAiChat, deleteAiChat, getAiProposalsForAthlete, updateAiProposal,
  submitCoachFeedback, createDiet, updateDiet, createMesocycle, bulkUpsertKnowledgeNotes,
  getCoachInstructions, saveCoachInstructions,
} from '../dbService';
import { runAgentTurn, messageText } from '../ai/aiClient';
import { OPEN_AI_PANEL_EVENT, OpenAiPanelDetail } from '../ai/events';
import { exchangeToKcal } from '../utils/nutritionConstants';
import { Icon, Button, ListRow, Badge, Dialog } from './ui';

interface Props {
  activeAthleteEmail?: string;
  activeAthleteName?: string;
}

const MAX_MESSAGES_PER_CHAT = 60; // ~30 turnos; después se pide empezar chat nuevo

// Dictado por voz vía Web Speech API (nativa del navegador, sin backend ni coste
// extra). Solo Chrome/Edge la implementan de forma fiable (prefijo webkit); en
// otros navegadores el botón de micrófono no aparece.
interface SpeechRecognitionResultLike { transcript: string }
interface SpeechRecognitionEventLike { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  // En la app nativa el botón no se ofrece, aunque el objeto exista.
  //
  // El WKWebView de iOS SÍ expone `webkitSpeechRecognition`, así que la
  // comprobación de abajo daba `true` y el micrófono aparecía en el móvil —
  // y no dictaba nada. iOS pide DOS permisos para el dictado,
  // `NSMicrophoneUsageDescription` y `NSSpeechRecognitionUsageDescription`, y
  // el Info.plist solo declara el primero: la API existe, se deja llamar y
  // muere sin decir nada. Detectarlo por capacidades es justo lo que no
  // funciona aquí, porque la capacidad está y lo que falta es el permiso.
  //
  // Se ofrece solo en web, que es donde el dictado funciona de verdad. Si
  // algún día se quiere en el móvil, no basta con volver a enseñar el botón:
  // hay que añadir esa clave al Info.plist y comprobarlo en un iPhone real.
  if (Capacitor.isNativePlatform()) return null;

  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function newChat(athleteId?: string): AiChat {
  const now = new Date().toISOString();
  return {
    id: `aichat_${Date.now()}`,
    title: '',
    ...(athleteId ? { athleteId } : {}),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

// Panel global del asistente IA del coach: FAB abajo-derecha + slide-over.
// El bucle de agente vive en src/ai/aiClient.ts; aquí solo UI + persistencia
// del chat en la colección aiChats.
const aiChatsKey = ['aiChats'] as const;
const coachInstructionsKey = ['coachInstructions'] as const;

export default function AiChatPanel({ activeAthleteEmail, activeAthleteName }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const { data: chats = [] } = useQuery({
    queryKey: aiChatsKey,
    queryFn: getAiChats,
    enabled: open,
  });
  const [chat, setChat] = useState<AiChat>(() => newChat(activeAthleteEmail));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proposalsKey = ['aiProposalsForAthlete', activeAthleteEmail ?? ''] as const;
  const { data: proposals = [] } = useQuery({
    queryKey: proposalsKey,
    queryFn: () => getAiProposalsForAthlete(activeAthleteEmail!).then(list => list.filter(p => p.status === 'proposed')),
    enabled: open && !!activeAthleteEmail,
  });
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const { data: coachInstructions = '' } = useQuery({
    queryKey: coachInstructionsKey,
    queryFn: getCoachInstructions,
    enabled: open,
  });
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);
  const liveMessages = useRef<AiChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const vaultInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = getSpeechRecognitionCtor() !== null;

  const toggleDictation = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    const baseInput = input.trim();
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput((baseInput ? baseInput + ' ' : '') + transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const importVault = async (file: File) => {
    setSyncMsg('Importando…');
    try {
      const parsed = JSON.parse(await file.text()) as { notes?: KnowledgeNote[] };
      const notes = parsed.notes ?? [];
      if (!Array.isArray(notes) || notes.length === 0) { setSyncMsg('El archivo no tiene notas válidas.'); return; }
      const n = await bulkUpsertKnowledgeNotes(notes);
      setSyncMsg(`✓ Bóveda sincronizada: ${n} notas.`);
    } catch {
      setSyncMsg('No se pudo leer el archivo (¿es el JSON de la bóveda?).');
    } finally {
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  const openInstructionsEditor = () => { setInstructionsDraft(coachInstructions); setEditingInstructions(true); };
  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      await saveCoachInstructions(instructionsDraft.trim());
      queryClient.setQueryData(coachInstructionsKey, instructionsDraft.trim());
      setEditingInstructions(false);
    } finally {
      setSavingInstructions(false);
    }
  };

  // Re-fetches proposals from the server (bypassing cache staleness) — used
  // after send() since the agent's tool calls may have just created new ones
  // server-side that a plain cache read wouldn't know about.
  const refreshProposals = () => {
    if (!activeAthleteEmail) return;
    queryClient.invalidateQueries({ queryKey: proposalsKey });
  };

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const prompt = (e as CustomEvent<OpenAiPanelDetail>).detail?.prompt;
      if (prompt) setInput(prompt);
    };
    window.addEventListener(OPEN_AI_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AI_PANEL_EVENT, onOpen);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages.length, toolStatus, busy]);

  const approveProposal = async (p: AiProposal) => {
    setReviewingId(p.id);
    try {
      if (p.kind === 'checkinFeedback') {
        const { checkInId, feedback } = p.payload as { checkInId: string; feedback: string };
        await submitCoachFeedback(checkInId, feedback);
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: checkInId });
      } else if (p.kind === 'diet') {
        const dietPayload = p.payload as Omit<Diet, 'id'>;
        if (p.baseEntityId) {
          await updateDiet(p.baseEntityId, dietPayload);
          await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: p.baseEntityId });
        } else {
          const created = await createDiet(dietPayload);
          await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
        }
      } else if (p.kind === 'mesocycle') {
        const created = await createMesocycle(p.payload as Omit<Mesocycle, 'id'>);
        await updateAiProposal(p.id, { status: 'approved', reviewedAt: new Date().toISOString(), resultEntityId: created.id });
      }
      queryClient.setQueryData<AiProposal[]>(proposalsKey, prev => prev?.filter(x => x.id !== p.id));
    } catch {
      setError('No se pudo aprobar la propuesta — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  const rejectProposal = async (p: AiProposal) => {
    setReviewingId(p.id);
    try {
      await updateAiProposal(p.id, { status: 'rejected', reviewedAt: new Date().toISOString() });
      queryClient.setQueryData<AiProposal[]>(proposalsKey, prev => prev?.filter(x => x.id !== p.id));
    } catch {
      setError('No se pudo rechazar la propuesta — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  const persist = async (updated: AiChat) => {
    setChat(updated);
    queryClient.setQueryData<AiChat[]>(aiChatsKey, prev => [updated, ...(prev ?? []).filter(c => c.id !== updated.id)]);
    await saveAiChat(updated);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (listening) recognitionRef.current?.stop();
    setInput('');
    setError(null);
    setBusy(true);
    liveMessages.current = chat.messages;

    const activeAthlete = activeAthleteEmail
      ? { email: activeAthleteEmail, name: activeAthleteName }
      : undefined;

    try {
      await runAgentTurn(chat.messages, text, { chatId: chat.id, activeAthlete, coachInstructions }, {
        onUpdate: msgs => {
          liveMessages.current = msgs;
          setChat(c => ({ ...c, messages: msgs }));
        },
        onToolStatus: setToolStatus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado del asistente.');
    } finally {
      setBusy(false);
      setToolStatus(null);
      const msgs = liveMessages.current;
      if (msgs.length > 0) {
        const title = chat.title || (messageText(msgs.find(m => m.role === 'user') ?? msgs[0]) || 'Chat').slice(0, 60);
        await persist({ ...chat, title, messages: msgs, updatedAt: new Date().toISOString() });
      }
      refreshProposals();
    }
  };

  const openChat = (c: AiChat) => { setChat(c); setShowList(false); setError(null); };
  const startNew = () => { setChat(newChat(activeAthleteEmail)); setShowList(false); setError(null); };
  const removeChat = async (id: string) => {
    queryClient.setQueryData<AiChat[]>(aiChatsKey, prev => prev?.filter(c => c.id !== id));
    if (chat.id === id) startNew();
    await deleteAiChat(id);
  };

  const chatFull = chat.messages.length >= MAX_MESSAGES_PER_CHAT;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Asistente IA"
        // Solo en escritorio. En móvil el disparador vive en la cabecera,
        // junto al avatar (App.tsx): ahí no tapa contenido, no compite con la
        // barra inferior y no hay que reservarle hueco al final de cada
        // pantalla. Abre por `OPEN_AI_PANEL_EVENT`, el mismo evento que ya
        // usaba ClientHub.
        className="hidden md:block fixed md:bottom-8 md:right-8 z-[60] w-13 h-13 p-4 rounded-full bg-accent text-black shadow-e1 hover:scale-105 transition-transform"
      >
        <Icon name="smart_toy" size="l" filled className="block" />
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[440px] bg-bg border-l border-hairline flex flex-col shadow-e2">
      {/* Header
          El `pt-` no es cosmético: es por lo que no se podía cerrar el panel en
          el móvil. El contenedor va `fixed inset-y-0`, o sea que empieza en el
          borde FÍSICO de la pantalla, y en un iPhone con Dynamic Island toda
          esta fila —incluido el botón de cerrar— quedaba tapada por la barra de
          estado. No había forma de salir del asistente salvo matando la app.
          El resto de cabeceras de la app ya reservan `--safe-top`; esta se
          quedó fuera por ser un panel flotante y no una cabecera de pantalla. */}
      <div className="flex items-center gap-2 px-4 py-3 pt-[calc(0.75rem+var(--safe-top))] border-b border-hairline">
        <Icon name="smart_toy" size="m" filled className="text-accent" />
        <span className="font-sans font-bold text-body-s uppercase tracking-wider text-accent flex-1">Asistente IA</span>
        <Button variant="ghost" size="s" onClick={openInstructionsEditor} icon="tune" label="Instrucciones fijas para la IA" />
        <Button variant="ghost" size="s" onClick={() => vaultInputRef.current?.click()} icon="menu_book" label="Sincronizar bóveda de conocimiento" />
        <input ref={vaultInputRef} type="file" accept="application/json,.json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) importVault(f); e.target.value = ''; }} />
        <Button variant="ghost" size="s" onClick={() => setShowList(s => !s)} icon="history" label="Historial de chats" />
        <Button variant="ghost" size="s" onClick={startNew} icon="add_comment" label="Chat nuevo" />
        <Button variant="ghost" size="s" onClick={() => setOpen(false)} icon="close" label="Cerrar" />
      </div>

      {syncMsg && (
        <div className="px-4 py-2 text-caption font-mono text-data border-b border-hairline bg-data/5">
          {syncMsg}
        </div>
      )}

      {/* Lista de chats */}
      {showList ? (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {chats.length === 0 && (
            <p className="text-ink-2 font-sans text-label text-center py-8">Sin chats guardados todavía.</p>
          )}
          {chats.map(c => (
            <ListRow
              key={c.id}
              onClick={() => openChat(c)}
              className={`rounded-surface border ${c.id === chat.id ? 'border-accent/40 bg-accent/5' : 'border-hairline bg-surface'}`}
              title={c.title || 'Chat sin título'}
              subtitle={`${c.updatedAt.slice(0, 10)}${c.athleteId ? ` · ${c.athleteId}` : ''}`}
              trailing={
                <button onClick={e => { e.stopPropagation(); removeChat(c.id); }} title="Borrar chat" className="p-1 text-ink-2 hover:text-danger">
                  <Icon name="delete" size="m" />
                </button>
              }
            />
          ))}
        </div>
      ) : (
        <>
          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {chat.messages.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-ink-2 text-body-s mb-3">Pregúntame por tus clientes:</p>
                <div className="flex flex-col gap-2 text-left">
                  {['¿Qué clientes necesitan atención?',
                    activeAthleteEmail ? 'Resume la situación de este cliente' : 'Resume la situación de un cliente',
                    activeAthleteEmail ? '¿Cómo van los entrenamientos de este cliente este mes?' : '¿Quién lleva más días sin check-in?',
                  ].map(s => (
                    <button key={s} onClick={() => setInput(s)}
                      className="text-left text-label text-ink-2 hover:text-white bg-surface border border-hairline hover:border-accent/40 rounded-control px-3 py-2 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.messages.map((msg, i) => {
              if (msg.role === 'user') {
                const text = messageText(msg);
                if (!text) return null; // mensajes de tool_results — no se pintan
                return (
                  <div key={i} className="self-end max-w-[85%] bg-accent/12 border border-accent/25 text-ink rounded-surface rounded-br-control px-4 py-3 text-body-s whitespace-pre-wrap">
                    {text}
                  </div>
                );
              }
              return (
                <div key={i} className="self-start max-w-[92%] flex flex-col gap-2">
                  {msg.content.map((block, j) => {
                    if (block.type === 'text' && block.text.trim()) {
                      return (
                        <div key={j} className="bg-surface border border-hairline text-ink rounded-surface rounded-bl-control px-4 py-3 text-body-s whitespace-pre-wrap">
                          {block.text}
                        </div>
                      );
                    }
                    if (block.type === 'tool_use') {
                      return (
                        <div key={j} className="flex items-center gap-2 text-caption font-mono text-data/80 px-1">
                          <Icon name="manufacturing" size="s" />
                          {block.name}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              );
            })}

            {busy && (
              <div className="self-start flex items-center gap-2 text-label font-mono text-ink-2 animate-pulse px-1">
                <Icon name="progress_activity" size="m" className="animate-spin" />
                {toolStatus ?? 'Pensando…'}
              </div>
            )}
            {error && (
              <div className="self-start max-w-[92%] bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-label">
                {error}
              </div>
            )}
          </div>

          {/* Propuestas pendientes del cliente activo — la IA propone, Dani aprueba */}
          {proposals.length > 0 && (
            <div className="border-t border-amber-500/20 bg-amber-500/5 p-3 flex flex-col gap-2 max-h-[40%] overflow-y-auto">
              <p className="text-caption font-sans font-bold uppercase tracking-wider text-amber-300/80">
                {proposals.length === 1 ? '1 propuesta por revisar' : `${proposals.length} propuestas por revisar`}
              </p>
              {proposals.map(p => {
                const diet = p.kind === 'diet' ? (p.payload as Omit<Diet, 'id'>) : null;
                const meso = p.kind === 'mesocycle' ? (p.payload as Omit<Mesocycle, 'id'>) : null;
                const mesoTrained = meso
                  ? (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).filter(g => meso.groups[g]?.series > 0)
                  : [];
                return (
                <div key={p.id} className="bg-surface border border-amber-500/25 rounded-surface p-3 flex flex-col gap-2">
                  <p className="text-label text-white whitespace-pre-wrap">{p.summary}</p>
                  {p.rationale && <p className="text-caption text-ink-2 italic">{p.rationale}</p>}
                  {meso && (
                    <div className="flex flex-col gap-2 bg-bg border border-hairline rounded-surface p-3">
                      <div className="flex gap-2 flex-wrap text-caption font-mono text-ink-2">
                        <span>{meso.weeks} sem</span>
                        <span>·</span>
                        <span>{meso.daysPerWeek} días/sem</span>
                        <span>·</span>
                        <span>{mesoTrained.reduce((s, g) => s + meso.groups[g].series, 0)} series/sem</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 ">
                        {mesoTrained.map(g => (
                          <div key={g} className="flex justify-between text-caption">
                            <span className="text-ink-2">{MUSCLE_LABELS[g]}</span>
                            <span className="text-ink font-mono">{meso.groups[g].series}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {diet && (
                    <div className="flex flex-col gap-2 bg-bg border border-hairline rounded-surface p-3">
                      <div className="flex gap-2 flex-wrap">
                        {(['HC', 'PROT', 'GRASA'] as const).map(cat => (
                          <Badge key={cat} tone="neutral">{cat} {diet.budget[cat]}</Badge>
                        ))}
                        <span className="text-caption font-mono text-ink-2">≈ {exchangeToKcal(diet.budget)} kcal</span>
                      </div>
                      <ul className="text-caption text-ink-2 flex flex-col ">
                        {diet.meals.map(m => (
                          <li key={m.id}>{m.name}: {m.items.length} {m.items.length === 1 ? 'item' : 'items'}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => approveProposal(p)}
                      disabled={reviewingId === p.id}
                      className="flex-1 py-2 rounded-control bg-success/15 border border-success/40 text-success text-caption font-bold uppercase tracking-wide disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => rejectProposal(p)}
                      disabled={reviewingId === p.id}
                      className="flex-1 py-2 rounded-control bg-danger/10 border border-danger/30 text-danger text-caption font-bold uppercase tracking-wide disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Input — mismo motivo que la cabecera, por el otro extremo: el panel
              llega al borde inferior físico y la barra de gestos del iPhone se
              comía parte del campo y del botón de enviar. */}
          <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-hairline">
            {chatFull ? (
              <button onClick={startNew}
                className="w-full py-3 rounded-control bg-accent/10 border border-accent/30 text-accent text-label font-bold uppercase tracking-wider">
                Chat largo — empezar chat nuevo
              </button>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  rows={Math.min(4, Math.max(1, input.split('\n').length))}
                  placeholder={busy ? 'Trabajando…' : listening ? 'Escuchando…' : 'Escribe al asistente…'}
                  disabled={busy}
                  className="flex-1 resize-none bg-surface border border-hairline focus:border-accent/50 rounded-control px-4 py-3 text-title-s text-ink placeholder-ink-2/50 outline-none disabled:opacity-50"
                />
                {speechSupported && (
                  <Button
                    variant={listening ? 'danger' : 'ghost'}
                    onClick={toggleDictation}
                    disabled={busy}
                    icon={listening ? 'stop_circle' : 'mic'}
                    label={listening ? 'Detener dictado' : 'Dictar por voz'}
                    className={listening ? 'animate-pulse' : ''}
                  />
                )}
                <Button onClick={send} disabled={busy || !input.trim()} icon="send" label="Enviar" />
              </div>
            )}
          </div>
        </>
      )}

      {editingInstructions && (
        <Dialog
          open
          onClose={() => { if (!savingInstructions) setEditingInstructions(false); }}
          title="Instrucciones fijas"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setEditingInstructions(false)} disabled={savingInstructions} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={saveInstructions} disabled={savingInstructions} loading={savingInstructions} className="flex-1">
                {savingInstructions ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          )}
        >
            <div className="flex flex-col gap-2">
              <p className="text-label text-ink-2">
                Reglas tuyas que el asistente sigue SIEMPRE, en cualquier chat, con prioridad sobre todo lo demás. Ej: "empieza los mesociclos con una semana de descarga", "nunca superes 20 series/semana en pierna en principiantes".
              </p>
              <textarea
                value={instructionsDraft}
                onChange={e => setInstructionsDraft(e.target.value)}
                rows={8}
                placeholder="Escribe tus reglas, una por línea…"
                className="w-full resize-none bg-surface border border-hairline focus:border-accent/50 rounded-control px-4 py-3 text-title-s text-ink placeholder-ink-2/50 outline-none"
              />
            </div>
        </Dialog>
      )}
    </div>
  );
}
