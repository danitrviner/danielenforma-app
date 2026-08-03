import React, { useRef, useState } from 'react';

// "Deslizar para guardar/descartar" en vez de un botón — el patrón exacto
// observado en FITIV (§4bis.1 del análisis). Con las manos sudadas o en
// marcha, un botón "Terminar" se pulsa sin querer; un deslizador no.
const CONFIRM_THRESHOLD = 0.8; // % del recorrido para disparar la acción

interface Props {
  label: string;
  icon: string; // nombre de Material Symbols
  color: string;
  onConfirm: () => void;
  disabled?: boolean;
}

export default function SlideAction({ label, icon, color, onConfirm, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const maxTravelRef = useRef(0);
  const startXRef = useRef(0);
  const startDragXRef = useRef(0);

  const THUMB_SIZE = 44;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const track = trackRef.current;
    if (!track) return;
    maxTravelRef.current = track.getBoundingClientRect().width - THUMB_SIZE;
    startXRef.current = e.clientX;
    startDragXRef.current = dragX;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.min(Math.max(startDragXRef.current + delta, 0), maxTravelRef.current);
    setDragX(next);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (maxTravelRef.current > 0 && dragX / maxTravelRef.current >= CONFIRM_THRESHOLD) {
      setDragX(maxTravelRef.current);
      onConfirm();
    } else {
      setDragX(0);
    }
  };

  return (
    <div
      ref={trackRef}
      className="relative h-14 rounded-full overflow-hidden select-none"
      style={{ backgroundColor: `${color}1f`, border: `1px solid ${color}40`, opacity: disabled ? 0.4 : 1 }}
    >
      <p className="absolute inset-0 flex items-center justify-center text-label font-sans uppercase pointer-events-none" style={{ color }}>
        {label}
      </p>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute top-1 left-1 flex items-center justify-center rounded-full active:scale-95"
        style={{
          width: THUMB_SIZE, height: THUMB_SIZE, backgroundColor: color,
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
        }}
      >
        <span className="material-symbols-outlined text-black text-title-m">{icon}</span>
      </div>
    </div>
  );
}
