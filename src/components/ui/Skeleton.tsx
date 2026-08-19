import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Skeleton (Fase 3: se muda a `ui/`)

   Bloque base para estados de carga: sustituye el texto "Cargando..." por una
   silueta del contenido real — se percibe más rápido y evita el parpadeo de
   "aquí no hay nada" un instante antes de que lleguen los datos.

   El handoff pide un barrido de luz, no un parpadeo genérico: gradiente que
   se desliza de un extremo a otro en 1,4 s lineal (`--animate-skeleton-sweep`,
   declarado en index.css), con la superficie de fondo entre `inset` y
   `track` —el gradiente necesita un tercer punto intermedio más claro para
   que el barrido se note, que es justo lo que `animate-pulse` (opacidad, sin
   textura) no podía dar—. `background-size` al 200 % es lo que deja sitio
   para que la franje clara recorra la silueta entera sin repetirse.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = { className?: string; style?: React.CSSProperties };

export default function Skeleton({ className = '', style }: Props) {
  return (
    <div
      className={`animate-skeleton-sweep rounded-surface bg-inset ${className}`}
      style={{
        backgroundImage: 'linear-gradient(90deg, var(--color-inset) 0%, var(--color-track) 50%, var(--color-inset) 100%)',
        backgroundSize: '200% 100%',
        ...style,
      }}
    />
  );
}

// Silueta genérica de pantalla: usada como fallback de Suspense al cambiar de
// pestaña (App.tsx) — no conoce la forma real de cada pantalla (son muy
// distintas entre sí), así que aproxima lo común a todas: un título y unas
// tarjetas. El stagger (150 ms por línea, handoff) usa `.stagger-child`.
export function ScreenSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="stagger-child h-8 w-48" style={{ '--i': 0 } as React.CSSProperties} />
        <Skeleton className="stagger-child h-4 w-72" style={{ '--i': 1 } as React.CSSProperties} />
      </div>
      <Skeleton className="stagger-child h-32 w-full" style={{ '--i': 2 } as React.CSSProperties} />
      <Skeleton className="stagger-child h-20 w-full" style={{ '--i': 3 } as React.CSSProperties} />
      <Skeleton className="stagger-child h-20 w-full" style={{ '--i': 4 } as React.CSSProperties} />
    </div>
  );
}
