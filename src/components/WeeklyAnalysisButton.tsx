import React, { useState } from 'react';
import { AiChatMessage } from '../types';
import { runAgentTurn, messageText } from '../ai/aiClient';
import { createCoachNote, getCoachInstructions, getDoctrina } from '../dbService';
import { Icon, Button, Dialog } from './ui';

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
      // Mismo contexto que el chat del panel: sin la doctrina, el análisis
      // semanal razonaría con criterio genérico y contradiría al asistente.
      const [coachInstructions, entrenamiento, nutricion] = await Promise.all([
        getCoachInstructions().catch(() => ''),
        getDoctrina('entrenamiento').catch(() => ''),
        getDoctrina('nutricion').catch(() => ''),
      ]);
      const doctrina = { entrenamiento, nutricion };
      const msgs = await runAgentTurn([] as AiChatMessage[], PROMPT, { chatId, coachInstructions, doctrina }, {
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
        className="inline-flex items-center gap-2 px-3 py-2 rounded-control bg-accent/10 border border-accent/30 hover:border-accent/60 text-accent font-sans text-label font-bold uppercase tracking-wider transition-all disabled:opacity-40"
      >
        <Icon name="smart_toy" size="m" filled />
        Análisis semanal IA
      </button>

      {open && (
        <Dialog
          open
          onClose={() => { if (!busy) setOpen(false); }}
          title="Análisis semanal"
          size="xl"
          footer={result ? (
            <span className="mr-auto text-caption font-sans text-ink-2">
              Guardado en tus notas de coach.
            </span>
          ) : undefined}
        >
          {busy && (
            <div className="flex items-center gap-2 text-label font-mono text-ink-2 animate-pulse">
              <Icon name="progress_activity" size="m" className="animate-spin" />
              {status ?? 'Analizando tu cartera…'}
            </div>
          )}
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-surface px-4 py-3 text-label">{error}</div>
          )}
          {result && (
            <div className="text-body-s text-ink whitespace-pre-wrap leading-relaxed">{result}</div>
          )}
        </Dialog>
      )}
    </>
  );
}
