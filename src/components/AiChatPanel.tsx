import React, { useEffect, useRef, useState } from 'react';
import { AiChat, AiChatMessage, AiProposal, Diet, Mesocycle, MuscleGroup, MUSCLE_LABELS, KnowledgeNote } from '../types';
import {
  getAiChats, saveAiChat, deleteAiChat, getAiProposalsForAthlete, updateAiProposal,
  submitCoachFeedback, createDiet, updateDiet, createMesocycle, bulkUpsertKnowledgeNotes,
  getCoachInstructions, saveCoachInstructions,
} from '../dbService';
import { runAgentTurn, messageText } from '../ai/aiClient';
import { OPEN_AI_PANEL_EVENT } from '../ai/events';
import { exchangeToKcal } from '../utils/nutritionConstants';

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
export default function AiChatPanel({ activeAthleteEmail, activeAthleteName }: Props) {
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [chats, setChats] = useState<AiChat[]>([]);
  const [chat, setChat] = useState<AiChat>(() => newChat(activeAthleteEmail));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [coachInstructions, setCoachInstructions] = useState('');
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

  useEffect(() => {
    if (open) getAiChats().then(setChats).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) getCoachInstructions().then(setCoachInstructions).catch(() => {});
  }, [open]);

  const openInstructionsEditor = () => { setInstructionsDraft(coachInstructions); setEditingInstructions(true); };
  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      await saveCoachInstructions(instructionsDraft.trim());
      setCoachInstructions(instructionsDraft.trim());
      setEditingInstructions(false);
    } finally {
      setSavingInstructions(false);
    }
  };

  const refreshProposals = () => {
    if (!activeAthleteEmail) { setProposals([]); return; }
    getAiProposalsForAthlete(activeAthleteEmail)
      .then(list => setProposals(list.filter(p => p.status === 'proposed')))
      .catch(() => {});
  };

  useEffect(() => { if (open) refreshProposals(); }, [open, activeAthleteEmail]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
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
      setProposals(prev => prev.filter(x => x.id !== p.id));
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
      setProposals(prev => prev.filter(x => x.id !== p.id));
    } catch {
      setError('No se pudo rechazar la propuesta — inténtalo de nuevo.');
    } finally {
      setReviewingId(null);
    }
  };

  const persist = async (updated: AiChat) => {
    setChat(updated);
    setChats(prev => [updated, ...prev.filter(c => c.id !== updated.id)]);
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
    setChats(prev => prev.filter(c => c.id !== id));
    if (chat.id === id) startNew();
    await deleteAiChat(id);
  };

  const chatFull = chat.messages.length >= MAX_MESSAGES_PER_CHAT;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Asistente IA"
        className="fixed bottom-28 right-4 md:bottom-8 md:right-8 z-[60] w-13 h-13 p-3.5 rounded-full bg-[#fbcb1a] text-black shadow-lg shadow-black/40 hover:scale-105 transition-transform"
      >
        <span className="material-symbols-outlined block" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[440px] bg-[#111110] border-l border-white/10 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
        <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
        <span className="font-sans font-black text-sm uppercase tracking-wider text-[#fbcb1a] flex-1">Asistente IA</span>
        <button onClick={openInstructionsEditor} title="Instrucciones fijas para la IA"
          className="p-1.5 rounded-lg text-[#c6c9ab] hover:text-white hover:bg-white/5">
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>
        <button onClick={() => vaultInputRef.current?.click()} title="Sincronizar bóveda de conocimiento"
          className="p-1.5 rounded-lg text-[#c6c9ab] hover:text-white hover:bg-white/5">
          <span className="material-symbols-outlined text-[20px]">menu_book</span>
        </button>
        <input ref={vaultInputRef} type="file" accept="application/json,.json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) importVault(f); e.target.value = ''; }} />
        <button onClick={() => setShowList(s => !s)} title="Historial de chats"
          className="p-1.5 rounded-lg text-[#c6c9ab] hover:text-white hover:bg-white/5">
          <span className="material-symbols-outlined text-[20px]">history</span>
        </button>
        <button onClick={startNew} title="Chat nuevo"
          className="p-1.5 rounded-lg text-[#c6c9ab] hover:text-white hover:bg-white/5">
          <span className="material-symbols-outlined text-[20px]">add_comment</span>
        </button>
        <button onClick={() => setOpen(false)} title="Cerrar"
          className="p-1.5 rounded-lg text-[#c6c9ab] hover:text-white hover:bg-white/5">
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {syncMsg && (
        <div className="px-4 py-2 text-[11px] font-mono text-[#00eefc] border-b border-white/7 bg-[#00eefc]/5">
          {syncMsg}
        </div>
      )}

      {/* Lista de chats */}
      {showList ? (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {chats.length === 0 && (
            <p className="text-[#c6c9ab] font-mono text-xs text-center py-8">Sin chats guardados todavía.</p>
          )}
          {chats.map(c => (
            <div key={c.id}
              className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${c.id === chat.id ? 'border-[#fbcb1a]/40 bg-[#fbcb1a]/5' : 'border-white/7 bg-[#161616] hover:border-white/20'}`}
              onClick={() => openChat(c)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{c.title || 'Chat sin título'}</p>
                <p className="text-[10px] font-mono text-[#c6c9ab]">
                  {c.updatedAt.slice(0, 10)}{c.athleteId ? ` · ${c.athleteId}` : ''}
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); removeChat(c.id); }} title="Borrar chat"
                className="p-1 text-[#c6c9ab] hover:text-[#ff6b6b]">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {chat.messages.length === 0 && (
              <div className="text-center py-10 px-4">
                <p className="text-[#c6c9ab] text-sm mb-3">Pregúntame por tus clientes:</p>
                <div className="flex flex-col gap-2 text-left">
                  {['¿Qué clientes necesitan atención?',
                    activeAthleteEmail ? 'Resume la situación de este cliente' : 'Resume la situación de un cliente',
                    activeAthleteEmail ? '¿Cómo van los entrenamientos de este cliente este mes?' : '¿Quién lleva más días sin check-in?',
                  ].map(s => (
                    <button key={s} onClick={() => setInput(s)}
                      className="text-left text-xs text-[#c6c9ab] hover:text-white bg-[#161616] border border-white/7 hover:border-[#fbcb1a]/40 rounded-xl px-3 py-2 transition-colors">
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
                  <div key={i} className="self-end max-w-[85%] bg-[#fbcb1a]/12 border border-[#fbcb1a]/25 text-[#e5e2e1] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                    {text}
                  </div>
                );
              }
              return (
                <div key={i} className="self-start max-w-[92%] flex flex-col gap-1.5">
                  {msg.content.map((block, j) => {
                    if (block.type === 'text' && block.text.trim()) {
                      return (
                        <div key={j} className="bg-[#161616] border border-white/7 text-[#e5e2e1] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                          {block.text}
                        </div>
                      );
                    }
                    if (block.type === 'tool_use') {
                      return (
                        <div key={j} className="flex items-center gap-1.5 text-[10px] font-mono text-[#00eefc]/80 px-1">
                          <span className="material-symbols-outlined text-[14px]">manufacturing</span>
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
              <div className="self-start flex items-center gap-2 text-xs font-mono text-[#c6c9ab] animate-pulse px-1">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                {toolStatus ?? 'Pensando…'}
              </div>
            )}
            {error && (
              <div className="self-start max-w-[92%] bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff9b9b] rounded-2xl px-3.5 py-2.5 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Propuestas pendientes del cliente activo — la IA propone, Dani aprueba */}
          {proposals.length > 0 && (
            <div className="border-t border-amber-500/20 bg-amber-500/5 p-3 flex flex-col gap-2 max-h-[40%] overflow-y-auto">
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300/80">
                {proposals.length === 1 ? '1 propuesta por revisar' : `${proposals.length} propuestas por revisar`}
              </p>
              {proposals.map(p => {
                const diet = p.kind === 'diet' ? (p.payload as Omit<Diet, 'id'>) : null;
                const meso = p.kind === 'mesocycle' ? (p.payload as Omit<Mesocycle, 'id'>) : null;
                const mesoTrained = meso
                  ? (Object.keys(MUSCLE_LABELS) as MuscleGroup[]).filter(g => meso.groups[g]?.series > 0)
                  : [];
                return (
                <div key={p.id} className="bg-[#161616] border border-amber-500/25 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs text-white whitespace-pre-wrap">{p.summary}</p>
                  {p.rationale && <p className="text-[11px] text-[#c6c9ab] italic">{p.rationale}</p>}
                  {meso && (
                    <div className="flex flex-col gap-1.5 bg-[#111110] border border-white/7 rounded-lg p-2.5">
                      <div className="flex gap-2 flex-wrap text-[10px] font-mono text-[#c6c9ab]">
                        <span>{meso.weeks} sem</span>
                        <span>·</span>
                        <span>{meso.daysPerWeek} días/sem</span>
                        <span>·</span>
                        <span>{mesoTrained.reduce((s, g) => s + meso.groups[g].series, 0)} series/sem</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {mesoTrained.map(g => (
                          <div key={g} className="flex justify-between text-[11px]">
                            <span className="text-[#c6c9ab]">{MUSCLE_LABELS[g]}</span>
                            <span className="text-[#e5e2e1] font-mono">{meso.groups[g].series}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {diet && (
                    <div className="flex flex-col gap-1.5 bg-[#111110] border border-white/7 rounded-lg p-2.5">
                      <div className="flex gap-1.5 flex-wrap">
                        {(['HC', 'PROT', 'GRASA'] as const).map(cat => (
                          <span key={cat} className="text-[10px] font-mono font-bold bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[#e5e2e1]">
                            {cat} {diet.budget[cat]}
                          </span>
                        ))}
                        <span className="text-[10px] font-mono text-[#c6c9ab]">≈ {exchangeToKcal(diet.budget)} kcal</span>
                      </div>
                      <ul className="text-[11px] text-[#c6c9ab] flex flex-col gap-0.5">
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
                      className="flex-1 py-1.5 rounded-lg bg-[#86efac]/15 border border-[#86efac]/40 text-[#86efac] text-[11px] font-bold uppercase tracking-wide disabled:opacity-40"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => rejectProposal(p)}
                      disabled={reviewingId === p.id}
                      className="flex-1 py-1.5 rounded-lg bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff9b9b] text-[11px] font-bold uppercase tracking-wide disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-white/7">
            {chatFull ? (
              <button onClick={startNew}
                className="w-full py-2.5 rounded-xl bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 text-[#fbcb1a] text-xs font-bold uppercase tracking-wider">
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
                  className="flex-1 resize-none bg-[#181818] border border-white/10 focus:border-[#fbcb1a]/50 rounded-xl px-3.5 py-2.5 text-sm text-[#e5e2e1] placeholder-[#c6c9ab]/50 outline-none disabled:opacity-50"
                />
                {speechSupported && (
                  <button onClick={toggleDictation} disabled={busy} title={listening ? 'Detener dictado' : 'Dictar por voz'}
                    className={`p-2.5 rounded-xl border transition-colors disabled:opacity-30 ${listening ? 'bg-[#ff6b6b]/15 border-[#ff6b6b]/40 text-[#ff6b6b] animate-pulse' : 'bg-white/5 border-white/10 text-[#c6c9ab] hover:text-white'}`}>
                    <span className="material-symbols-outlined block text-[20px]">{listening ? 'stop_circle' : 'mic'}</span>
                  </button>
                )}
                <button onClick={send} disabled={busy || !input.trim()} title="Enviar"
                  className="p-2.5 rounded-xl bg-[#fbcb1a] text-black disabled:opacity-30 transition-opacity">
                  <span className="material-symbols-outlined block text-[20px]">send</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {editingInstructions && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" onClick={() => !savingInstructions && setEditingInstructions(false)}>
          <div className="bg-[#111110] border border-white/10 rounded-2xl w-full max-w-md flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <span className="material-symbols-outlined text-[#fbcb1a]">tune</span>
              <span className="font-sans font-black text-sm uppercase tracking-wider text-[#fbcb1a] flex-1">Instrucciones fijas</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <p className="text-xs text-[#c6c9ab]">
                Reglas tuyas que el asistente sigue SIEMPRE, en cualquier chat, con prioridad sobre todo lo demás. Ej: "empieza los mesociclos con una semana de descarga", "nunca superes 20 series/semana en pierna en principiantes".
              </p>
              <textarea
                value={instructionsDraft}
                onChange={e => setInstructionsDraft(e.target.value)}
                rows={8}
                placeholder="Escribe tus reglas, una por línea…"
                className="w-full resize-none bg-[#181818] border border-white/10 focus:border-[#fbcb1a]/50 rounded-xl px-3.5 py-2.5 text-sm text-[#e5e2e1] placeholder-[#c6c9ab]/50 outline-none"
              />
            </div>
            <div className="flex gap-2 p-4 pt-0">
              <button onClick={() => setEditingInstructions(false)} disabled={savingInstructions}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[#c6c9ab] text-xs font-bold uppercase tracking-wide disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={saveInstructions} disabled={savingInstructions}
                className="flex-1 py-2.5 rounded-xl bg-[#fbcb1a] text-black text-xs font-bold uppercase tracking-wide disabled:opacity-40">
                {savingInstructions ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
