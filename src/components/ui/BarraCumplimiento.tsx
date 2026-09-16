import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   BarraCumplimiento — cuánto de lo programado se ha cumplido.

   No es `ProgressBar`: aquí el color ES el dato (verde ≥90 %, ámbar ≥70 %,
   rojo por debajo) y el 100 % no es el máximo — pasarse está permitido y se
   marca con un tic en el borde derecho, porque hacer 14 series donde se
   programaron 12 no es «completado», es «se ha pasado».

   ── Cómo colocarla ─────────────────────────────────────────────────────────
   Ocupa el ancho de su contenedor (`w-full`), así que NO se pone como hijo
   directo de un flex: ahí su base es la fila entera y se come lo que tenga al
   lado —etiqueta y porcentaje se superponen, que es lo que pasó en el bloque
   de retos y nivel—. Va siempre dentro de una caja que le fije el ancho:
   `<div className="w-24 shrink-0">` cuando es una columna, o
   `<div className="flex-1 min-w-0">` cuando debe estirarse con la fila.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  /** Porcentaje de cumplimiento. `null` = no hay nada programado con que comparar. */
  pct: number | null;
}

export default function BarraCumplimiento({ pct }: Props) {
  if (pct == null) return null;
  const color = pct >= 90 ? 'var(--color-success)' : pct >= 70 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <div className="relative h-1 rounded-full bg-track w-full min-w-[48px]">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      {pct > 100 && <div className="absolute inset-y-0 right-0 w-px bg-white/40" />}
    </div>
  );
}
