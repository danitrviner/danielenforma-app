import React from 'react';
import { ScoreStyle } from '../utils/adherence';
import { Banner, Button } from './ui';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientHubSummary (F3.13b, "Hub del atleta" del handoff transversal)

   La fila de KPIs (adherencia/peso/RIR medio) + los dos estados accionables
   de cabecera: "plan sin publicar" (0 assignments, mismo criterio que
   HomeCoachScreen) y "próxima revisión" (el próximo check-in sin revisar,
   REVISIONES ya cerrado en Fase 3). Presentacional puro — ClientHub.tsx sigue
   siendo el dueño de los datos y la navegación de pestañas.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  adherenceScore: number;
  adherenceStyle: ScoreStyle;
  latestWeight: number | null;
  averageRir: number | null;
  planUnpublished: boolean;
  pendingReviewsCount: number;
  onGoToEntrenamientos: () => void;
  onGoToRevisiones: () => void;
};

function esFormat(n: number): string {
  return String(n).replace('.', ',');
}

export default function ClientHubSummary({
  adherenceScore, adherenceStyle, latestWeight, averageRir,
  planUnpublished, pendingReviewsCount, onGoToEntrenamientos, onGoToRevisiones,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-field border border-hairline rounded-field p-3">
          <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">Adherencia</p>
          <p className={`font-display font-black text-title-m mt-2 ${adherenceStyle.text}`}>{adherenceScore}%</p>
          <p className={`font-mono text-caption uppercase mt-1 ${adherenceStyle.text}`}>{adherenceStyle.label}</p>
        </div>
        <div className="bg-field border border-hairline rounded-field p-3">
          <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">Peso</p>
          <p className="font-display font-black text-title-m text-ink mt-2">
            {latestWeight != null ? esFormat(Math.round(latestWeight * 10) / 10) : '—'}
          </p>
        </div>
        <div className="bg-field border border-hairline rounded-field p-3">
          <p className="font-mono text-caption text-ink-4 uppercase tracking-wider">RIR med.</p>
          <p className="font-display font-black text-title-m text-accent mt-2">
            {averageRir != null ? esFormat(averageRir) : '—'}
          </p>
        </div>
      </div>

      {/* No hay una acción atómica "Publicar plan" en el modelo de datos —
          el CTA lleva a donde de verdad se asignan entrenamientos. */}
      {planUnpublished && (
        <Banner tone="danger" actionLabel="Ir a Entrenamientos" onAction={onGoToEntrenamientos}>
          Esperando plan — todavía no hay entrenamientos asignados.
        </Banner>
      )}

      {pendingReviewsCount > 0 && (
        <div className="rounded-field border border-accent-line bg-accent-bg p-4 space-y-3">
          <p className="font-mono text-caption font-semibold text-accent uppercase tracking-wider">Próxima revisión</p>
          <p className="font-sans text-body-s font-semibold text-ink">
            {pendingReviewsCount === 1 ? '1 check-in por revisar' : `${pendingReviewsCount} check-ins por revisar`}
          </p>
          <Button variant="primary" size="m" fullWidth onClick={onGoToRevisiones}>
            Ver el hilo de revisiones
          </Button>
        </div>
      )}
    </div>
  );
}
