import React from 'react';
import Icon from '../ui/Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   MealItemSwipeRow

   Fila de alimento del tracker de "Mi plan" con dos gestos, uno por lado, para
   dejar el ancho libre al nombre del alimento (que antes se truncaba entre el
   check, la etiqueta de categoría y el stepper):

   · Deslizar a la DERECHA  → marcar / desmarcar "comido". Es reversible y ya
     tiene su propio deshacer en el tracker, así que la acción salta al soltar
     por encima del umbral, sin botón intermedio.
   · Deslizar a la IZQUIERDA → revela "Quitar" (rojo). Igual que ui/SwipeRow:
     el gesto solo revela el botón; borrar es una pulsación aparte. Solo si
     `onDelete` viene definido (dietas propias, o alimentos añadidos sobre la
     del coach); si no, ese lado no se arrastra.

   Volver a tocar la fila con el panel de borrar abierto lo cierra.
   ═══════════════════════════════════════════════════════════════════════════ */

const RECORRIDO_PX = 96;
const UMBRAL_COMER_PX = 64;

type Props = {
  children: React.ReactNode;
  eaten: boolean;
  onToggleEaten: () => void;
  onDelete?: () => void;
  className?: string;
};

export default function MealItemSwipeRow({ children, eaten, onToggleEaten, onDelete, className = '' }: Props) {
  const [dx, setDx] = React.useState(0);
  const [borrarAbierto, setBorrarAbierto] = React.useState(false);
  const arrastrando = React.useRef(false);
  const origenX = React.useRef(0);
  const origenDx = React.useRef(0);
  const puedeBorrar = !!onDelete;

  const alBajarPuntero = (e: React.PointerEvent) => {
    arrastrando.current = true;
    origenX.current = e.clientX;
    origenDx.current = dx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!arrastrando.current) return;
    const next = origenDx.current + (e.clientX - origenX.current);
    const min = puedeBorrar ? -RECORRIDO_PX : 0;
    setDx(Math.max(min, Math.min(RECORRIDO_PX, next)));
  };
  const alSoltarPuntero = () => {
    if (!arrastrando.current) return;
    arrastrando.current = false;
    if (dx > UMBRAL_COMER_PX) {
      onToggleEaten();
      setDx(0);
      setBorrarAbierto(false);
      return;
    }
    const quedaAbierto = puedeBorrar && dx < -RECORRIDO_PX / 2;
    setBorrarAbierto(quedaAbierto);
    setDx(quedaAbierto ? -RECORRIDO_PX : 0);
  };
  const cerrar = () => { setBorrarAbierto(false); setDx(0); };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Pista derecha — "comido": solo indicador, la acción salta al soltar */}
      <div className={`absolute inset-y-0 left-0 flex w-24 items-center justify-center ${eaten ? 'bg-inset' : 'bg-success'}`}>
        <span className={`flex flex-col items-center gap-1 font-sans text-caption font-bold ${eaten ? 'text-ink-2' : 'text-on-accent'}`}>
          <Icon name={eaten ? 'undo' : 'check'} size="m" />
          {eaten ? 'Deshacer' : 'Comido'}
        </span>
      </div>

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
