import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Sparkline (Fase 3, nueva)

   Las 8 barras de la tarjeta métrica y de "tu mejor serie" en la ficha de
   ejercicio: entran con `scaleY` desde la base, escalonadas 40 ms, y la
   ÚLTIMA barra siempre en oro —es el dato de hoy, las otras siete son
   contexto—. `--i` alimenta el `.stagger-child` ya declarado en index.css en
   vez de que cada barra calcule su propio `animationDelay`.

   Solo 8 valores: si llegan más, el llamador decide qué recortar (últimas 8
   sesiones, últimas 8 semanas). La primitiva no trunca por su cuenta porque
   no sabe cuál de los N-8 valores sobra.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** Hasta 8 valores, más antiguo primero. El último es "hoy". */
  values: number[];
  label: string;
  className?: string;
};

export default function Sparkline({ values, label, className = '' }: Props) {
  const max = Math.max(...values, 1);
  return (
    <div role="img" aria-label={label} className={`flex h-8 items-end gap-1 ${className}`}>
      {values.map((v, i) => {
        const esUltima = i === values.length - 1;
        const alturaPct = Math.max(6, (v / max) * 100);
        return (
          <span
            key={i}
            style={{ '--i': i, height: `${alturaPct}%`, transformOrigin: 'bottom' } as React.CSSProperties}
            className={`stagger-child w-2 animate-scale-y-in rounded-[2px] ${esUltima ? 'bg-accent' : 'bg-track'}`}
          />
        );
      })}
    </div>
  );
}
