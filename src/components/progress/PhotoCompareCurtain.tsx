import React from 'react';
import { Icon } from '../ui';

/* ═══════════════════════════════════════════════════════════════════════════
   PhotoCompareCurtain (F3.13c, "Revisiones · 06 Fotos")

   Comparativa antes/ahora con cortina arrastrable 1:1 — la primera foto de la
   vista (línea base) queda de fondo a pantalla completa; la más reciente se
   recorta por encima y se revela arrastrando la manija dorada. Sin animación
   automática en producción (el `.dc.html` la anima sola para la demo; aquí la
   mueve el dedo, como pide "cortina arrastrable" en el handoff).
   ═══════════════════════════════════════════════════════════════════════════ */

type Foto = { url: string; date: string };

type Props = {
  antes: Foto;
  ahora: Foto;
  /** Pastilla superior izquierda: "11 SEMANAS · −3,8 KG". Opcional — se omite
   * si no hay suficientes datos para calcularla. */
  badge?: string;
  height?: number;
  className?: string;
};

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase();
}

export default function PhotoCompareCurtain({ antes, ahora, badge, height = 420, className = '' }: Props) {
  const [pos, setPos] = React.useState(50);
  const arrastrando = React.useRef(false);
  const marcoRef = React.useRef<HTMLDivElement>(null);

  const posDesdeCliente = (clientX: number) => {
    const marco = marcoRef.current;
    if (!marco) return pos;
    const rect = marco.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };

  const alBajarPuntero = (e: React.PointerEvent) => {
    arrastrando.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setPos(posDesdeCliente(e.clientX));
  };
  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!arrastrando.current) return;
    setPos(posDesdeCliente(e.clientX));
  };
  const alSoltarPuntero = () => { arrastrando.current = false; };

  return (
    <div
      ref={marcoRef}
      onPointerDown={alBajarPuntero}
      onPointerMove={alMoverPuntero}
      onPointerUp={alSoltarPuntero}
      onPointerCancel={alSoltarPuntero}
      role="slider"
      aria-label="Comparar foto de antes y de ahora"
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative touch-pan-y select-none overflow-hidden rounded-surface bg-field cursor-ew-resize ${className}`}
      style={{ height }}
    >
      {/* Línea base: fondo a pantalla completa */}
      <img src={antes.url} alt="Foto de antes" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" />
      <span className="absolute bottom-3 right-3 rounded-full bg-bg/70 px-3 py-1 font-mono text-caption text-ink-2">
        {fmtDate(antes.date)}
      </span>

      {/* Más reciente: recortada al ancho de la manija */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={ahora.url} alt="Foto de ahora" draggable={false} className="h-full w-full object-cover object-top" />
        <span className="absolute bottom-3 left-3 rounded-full bg-bg/70 px-3 py-1 font-mono text-caption text-ink">
          {fmtDate(ahora.date)}
        </span>
      </div>

      {/* Manija */}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent shadow-e1">
          <Icon name="swap_horiz" size="s" className="text-on-accent" />
        </span>
      </div>

      {badge && (
        <span className="absolute left-3 top-3 rounded-full bg-bg/70 px-3 py-1 font-mono text-caption font-semibold uppercase tracking-wide text-ink">
          {badge}
        </span>
      )}
    </div>
  );
}
