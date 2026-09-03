import React from 'react';
import Icon from '../ui/Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   MealItemSwipeRow

   Fila del plan del día con UN solo gesto: deslizar a la IZQUIERDA revela
   "Quitar" (rojo). El gesto solo revela el botón; borrar es una pulsación
   aparte, igual que ui/SwipeRow. Volver a tocar la fila con el panel abierto
   lo cierra.

   ANTES había un segundo gesto, deslizar a la DERECHA para marcar "comido", y
   se ha quitado a propósito (09-2026): lo que está en el día ya cuenta como
   comido en cuanto se añade, así que no hay nada que marcar. El gesto sobraba
   —era un paso extra para decir algo que ya se sabía— y encima competía con el
   de borrar en la misma fila.

   `onDelete` sin definir = ese lado no se arrastra (nada que quitar).
   ═══════════════════════════════════════════════════════════════════════════ */

const RECORRIDO_PX = 96;

type Props = {
  children: React.ReactNode;
  onDelete?: () => void;
  className?: string;
};

export default function MealItemSwipeRow({ children, onDelete, className = '' }: Props) {
  const [dx, setDx] = React.useState(0);
  const [borrarAbierto, setBorrarAbierto] = React.useState(false);
  const arrastrando = React.useRef(false);
  const origenX = React.useRef(0);
  const origenDx = React.useRef(0);
  const puedeBorrar = !!onDelete;

  const alBajarPuntero = (e: React.PointerEvent) => {
    if (!puedeBorrar) return;
    arrastrando.current = true;
    origenX.current = e.clientX;
    origenDx.current = dx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!arrastrando.current) return;
    const next = origenDx.current + (e.clientX - origenX.current);
    setDx(Math.max(-RECORRIDO_PX, Math.min(0, next)));
  };
  const alSoltarPuntero = () => {
    if (!arrastrando.current) return;
    arrastrando.current = false;
    const quedaAbierto = dx < -RECORRIDO_PX / 2;
    setBorrarAbierto(quedaAbierto);
    setDx(quedaAbierto ? -RECORRIDO_PX : 0);
  };
  const cerrar = () => { setBorrarAbierto(false); setDx(0); };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Panel izquierdo — "quitar": revelado al deslizar, se pulsa aparte */}
      {puedeBorrar && (
        <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger">
          <button
            type="button"
            onClick={() => { cerrar(); onDelete!(); }}
            aria-label="Quitar"
            className="flex h-full w-full flex-col items-center justify-center gap-1 font-sans text-caption font-bold text-on-accent"
          >
            <Icon name="close" size="m" />
            Quitar
          </button>
        </div>
      )}

      <div
        onPointerDown={alBajarPuntero}
        onPointerMove={alMoverPuntero}
        onPointerUp={alSoltarPuntero}
        onPointerCancel={alSoltarPuntero}
        onClick={() => { if (borrarAbierto) cerrar(); }}
        style={{ transform: `translateX(${dx}px)` }}
        className={
          'relative touch-pan-y bg-bg '
          + (arrastrando.current ? '' : 'transition-transform duration-(--duration-slide) ease-brand')
        }
      >
        {children}
      </div>
    </div>
  );
}
