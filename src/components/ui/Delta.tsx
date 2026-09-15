import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Delta — la variación porcentual de una métrica frente a su comparación.

   Existía por triplicado antes de extraerla: `Delta` en MesocycleReviewPanel,
   otra versión en MesocycleManager y `DeltaBadge` en ReportView, las tres con
   el mismo criterio de color y tres triángulos distintos. Esta es la de
   MesocycleReviewPanel, que es la que más sitios tenía que alimentar (cierre
   de mesociclo y, ahora, la pestaña de Revisión del coach).

   `invertido` es para las métricas en las que bajar es la buena noticia
   (grasa corporal, peso en un déficit, tiempo por repetición).

   Las otras dos copias siguen en su sitio a propósito: unificarlas en la misma
   tanda que extraer esta significaba tocar tres pantallas en producción por un
   cambio puramente cosmético. Cuando alguna de ellas se toque por otro motivo,
   que migre entonces.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  /** Variación en porcentaje, ya redondeada. `null` = no hay con qué comparar. */
  pct: number | null;
  /** Cuando bajar es lo bueno. */
  invertido?: boolean;
}

export default function Delta({ pct, invertido = false }: Props) {
  if (pct == null) return <span className="font-mono text-caption text-ink-3">—</span>;
  const bueno = invertido ? pct < 0 : pct > 0;
  const color = pct === 0 ? 'var(--color-ink-3)' : bueno ? 'var(--color-success)' : 'var(--color-danger)';
  return (
    <span className="font-mono text-caption tabular-nums" style={{ color }}>
      {pct > 0 ? '▲+' : pct < 0 ? '▼' : '='}{pct !== 0 ? `${pct}%` : ''}
    </span>
  );
}
