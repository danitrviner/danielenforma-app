import React, { useState } from 'react';
import { AiChatMessage } from '../types';
import { runAgentTurn, messageText } from '../ai/aiClient';
import { createCoachNote } from '../dbService';

// Fase 5 — Análisis semanal proactivo. Un botón que lanza al mismo agente IA con
// un prompt enlatado: revisa toda la cartera, señala quién necesita atención y
// deja un resumen accionable. El digest se guarda como CoachNote (privado del
// coach) y se muestra en un modal. Reutiliza runAgentTurn (mismas tools/proxy).
const PROMPT = `Haz un análisis semanal de toda mi cartera de clientes. Usa list_clients y, para los que veas en riesgo o con algo reseñable, get_client_overview. Devuélveme un resumen accionable y conciso en español:
- Quién necesita atención esta semana y por qué (check-ins sin responder, adherencia baja, peso estancado o alejándose del objetivo, sin reporte reciente).
- 1 acción concreta recomendada por cada cliente señalado.
- Cierra con las 3 prioridades del día.
No propongas cambios todavía (no uses tools de propose_*); esto es solo el diagnóstico.`;

export default function WeeklyAnalysisButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setOpen(true); setBusy(true); setResult(null); setError(null); setStatus(null);
    const chatId = `weekly_${Date.now()}`;
    try {
      const msgs = await runAgentTurn([] as AiChatMessage[], PROMPT, { chatId }, {
        onToolStatus: setStatus,
      });
      const last = [...msgs].reverse().find(m => m.role === 'assistant' && messageText(m));
      const text = last ? messageText(last) : '';
      setResult(text || 'El asistente no devolvió texto.');
      if (text) {
        await createCoachNote({
          text: `📊 Análisis semanal IA (${new Date().toISOString().slice(0, 10)})\n\n${text}`,
          done: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado del asistente.');
    } finally {
      setBusy(false); setStatus(null);
    }
  };

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#fbcb1a]/10 border border-[#fbcb1a]/30 hover:border-[#fbcb1a]/60 text-[#fbcb1a] font-sans text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
        Análisis semanal IA
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-[#111110] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <span className="material-symbols-outlined text-[#fbcb1a]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              <span className="font-sans font-black text-sm uppercase tracking-wider text-[#fbcb1a] flex-1">Análisis semanal</span>
              <button onClick={() => !busy && setOpen(false)} disabled={busy}
                className="p-1.5 rounded-lg text-[#c6c9ab] hover:text-white hover:bg-white/5 disabled:opacity-40">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {busy && (
                <div className="flex items-center gap-2 text-xs font-mono text-[#c6c9ab] animate-pulse">
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  {status ?? 'Analizando tu cartera…'}
                </div>
              )}
              {error && (
                <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/30 text-[#ff9b9b] rounded-xl px-3.5 py-2.5 text-xs">{error}</div>
              )}
              {result && (
                <div className="text-sm text-[#e5e2e1] whitespace-pre-wrap leading-relaxed">{result}</div>
              )}
            </div>
            {result && (
              <div className="px-4 py-2.5 border-t border-white/7 text-[11px] font-mono text-[#c6c9ab]">
                Guardado en tus notas de coach.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
