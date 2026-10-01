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

/* Píxeles que hay que mover para que deje de ser un clic y pase a ser un
   arrastre. Con ratón, un clic normal mueve el puntero 1-2 px entre pulsar y
   soltar; por debajo de esto no se toca nada. */
const UMBRAL_ARRASTRE_PX = 5;

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
  /* Si el puntero se ha movido de verdad, el `click` que el navegador dispara
     al soltar NO es un clic: es el final del deslizamiento. Sin esto, deslizar
     con el ratón abría el buscador de alimentos —el botón que hay debajo— y el
     panel de «Quitar» se quedaba detrás, inalcanzable (Dani, 24-09-2026). En
     táctil no se notaba porque el navegador ya se traga ese clic cuando ha
     habido gesto. */
  const huboArrastre = React.useRef(false);
  const puedeBorrar = !!onDelete;

  const alBajarPuntero = (e: React.PointerEvent) => {
    if (!puedeBorrar) return;
    arrastrando.current = true;
    origenX.current = e.clientX;
    origenDx.current = dx;
    huboArrastre.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!arrastrando.current) return;
    const recorrido = e.clientX - origenX.current;
    if (Math.abs(recorrido) > UMBRAL_ARRASTRE_PX) huboArrastre.current = true;
    const next = origenDx.current + recorrido;
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

  /* En CAPTURA, no en burbuja: hay que interceptar el clic ANTES de que llegue
     al botón del alimento. En burbuja el hijo ya habría abierto el buscador. */
  const alClicarEnCaptura = (e: React.MouseEvent) => {
    if (huboArrastre.current) {
      huboArrastre.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Con el panel abierto, el primer toque en la fila solo lo cierra. Abrir el
    // buscador con «Quitar» asomando dejaría el panel colgando bajo un diálogo.
    if (borrarAbierto) {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Panel izquierdo — "quitar": revelado al deslizar, se pulsa aparte */}
      {puedeBorrar && (
        <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger">
          <button
            type="button"
            onClick={() => { cerrar(); onDelete!(); }}
            aria-label="Quitar"
            className="flex h-full w-full flex-col items-center justify-center gap-1 font-sans text-caption font-bold text-on-fill"
          >
            <Icon name="close" size="m" />
            Quitar
          </button>
        </div>
      )}

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- capa de gesto: el clic solo deshace el deslizamiento. La acción de verdad es el botón que queda detrás, ya accesible por teclado */}
      <div
        onPointerDown={alBajarPuntero}
        onPointerMove={alMoverPuntero}
        onPointerUp={alSoltarPuntero}
        onPointerCancel={alSoltarPuntero}
        onClickCapture={alClicarEnCaptura}
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
