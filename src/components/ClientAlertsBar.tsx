import React from 'react';
import { Button, Banner } from './ui';
import { OPEN_AI_PANEL_EVENT } from '../ai/events';

/* ═══════════════════════════════════════════════════════════════════════════
   ClientAlertsBar

   Lo accionable y urgente de la cabecera del Hub: plan sin publicar, próxima
   revisión pendiente, acceso directo al resumen del asistente IA. Vive
   siempre visible, sea cual sea la pestaña activa — a diferencia de lo
   meramente informativo (KPIs, fase, objetivo, nota del coach, últimos
   cambios), que a partir de ahora vive en la pestaña Ficha (ver
   `ClientFichaPanel`), para que esa pestaña sea de verdad el sitio con TODO
   lo que está haciendo el atleta en una sola vista, y la cabecera no compita
   por espacio con contenido que no exige una decisión inmediata.

   Antes esto era parte de `ClientOverviewCard` (KPIs + fase + objetivo +
   estos avisos, todo junto). Se separa en dos: esta barra se queda con lo
   urgente, `ClientFichaPanel` se queda con lo descriptivo.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  planUnpublished: boolean;
  pendingReviewsCount: number;
  onGoToEntrenamientos: () => void;
  onGoToRevisiones: () => void;
}

export default function ClientAlertsBar({
  planUnpublished, pendingReviewsCount, onGoToEntrenamientos, onGoToRevisiones,
}: Props) {
  const openAiSummary = () => {
    window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT, {
      detail: { prompt: 'Resume la situación de este cliente' },
    }));
  };

  if (!planUnpublished && pendingReviewsCount === 0) {
    return (
      <Button variant="ghost" size="s" icon="smart_toy" onClick={openAiSummary}>
        Ver resumen IA
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="s" icon="smart_toy" onClick={openAiSummary}>
        Ver resumen IA
      </Button>

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
