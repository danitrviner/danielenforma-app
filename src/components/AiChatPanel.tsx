import React, { useEffect, useRef, useState } from 'react';
import { AiChat, AiChatMessage } from '../types';
import { getAiChats, saveAiChat, deleteAiChat } from '../dbService';
import { runAgentTurn, messageText } from '../ai/aiClient';

interface Props {
  activeAthleteEmail?: string;
  activeAthleteName?: string;
}

const MAX_MESSAGES_PER_CHAT = 60; // ~30 turnos; después se pide empezar chat nuevo

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
  const liveMessages = useRef<AiChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) getAiChats().then(setChats).catch(() => {});
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages.length, toolStatus, busy]);

  const persist = async (updated: AiChat) => {
    setChat(updated);
    setChats(prev => [updated, ...prev.filter(c => c.id !== updated.id)]);
    await saveAiChat(updated);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setBusy(true);
    liveMessages.current = chat.messages;

    const activeAthlete = activeAthleteEmail
      ? { email: activeAthleteEmail, name: activeAthleteName }
      : undefined;

    try {
      await runAgentTurn(chat.messages, text, { chatId: chat.id, activeAthlete }, {
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
                  placeholder={busy ? 'Trabajando…' : 'Escribe al asistente…'}
                  disabled={busy}
                  className="flex-1 resize-none bg-[#181818] border border-white/10 focus:border-[#fbcb1a]/50 rounded-xl px-3.5 py-2.5 text-sm text-[#e5e2e1] placeholder-[#c6c9ab]/50 outline-none disabled:opacity-50"
                />
                <button onClick={send} disabled={busy || !input.trim()} title="Enviar"
                  className="p-2.5 rounded-xl bg-[#fbcb1a] text-black disabled:opacity-30 transition-opacity">
                  <span className="material-symbols-outlined block text-[20px]">send</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
