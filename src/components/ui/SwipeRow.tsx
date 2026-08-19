import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   SwipeRow (Fase 3, nueva)

   Deslizar para revelar una acción destructiva: 96 px de recorrido, fondo
   rojo con icono y etiqueta en negro. La primitiva SOLO revela el botón —
   ejecutarlo es una pulsación aparte, no el propio gesto de deslizar. Es a
   propósito: el handoff no pide confirmar con un diálogo ("toda acción
   destructiva se deshace con un toast de 3,2 s, no con un diálogo"), así que
   quien use `SwipeRow` debe borrar al pulsar el botón revelado y ofrecer
   "Deshacer" en un `Toast` — esta pieza no sabe nada de eso, solo del gesto.

   Arrastrar por debajo de la mitad del recorrido vuelve a cerrarse sola al
   soltar; por encima, se queda abierta. Volver a tocar la fila (no el botón)
   la cierra, para que quien cambia de idea no tenga que deslizar de vuelta.
   ═══════════════════════════════════════════════════════════════════════════ */

const RECORRIDO_PX = 96;

type Props = {
  children: React.ReactNode;
  actionLabel: string;
  actionIcon?: string;
  onAction: () => void;
  className?: string;
};

export default function SwipeRow({ children, actionLabel, actionIcon = 'delete', onAction, className = '' }: Props) {
  const [arrastreX, setArrastreX] = React.useState(0);
  const [abierta, setAbierta] = React.useState(false);
  const arrastrando = React.useRef(false);
  const origenX = React.useRef(0);
  const origenArrastre = React.useRef(0);

  const alBajarPuntero = (e: React.PointerEvent) => {
    arrastrando.current = true;
    origenX.current = e.clientX;
    origenArrastre.current = arrastreX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!arrastrando.current) return;
    const delta = e.clientX - origenX.current;
    setArrastreX(Math.max(-RECORRIDO_PX, Math.min(0, origenArrastre.current + delta)));
  };
  const alSoltarPuntero = () => {
    if (!arrastrando.current) return;
    arrastrando.current = false;
    const seQueda = arrastreX < -RECORRIDO_PX / 2;
    setAbierta(seQueda);
    setArrastreX(seQueda ? -RECORRIDO_PX : 0);
  };
  const cerrar = () => { setAbierta(false); setArrastreX(0); };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger">
        <button
          type="button"
          onClick={() => { cerrar(); onAction(); }}
          aria-label={actionLabel}
          className="flex h-full w-full flex-col items-center justify-center gap-1 font-sans text-caption font-bold text-on-accent"
        >
          <Icon name={actionIcon} size="m" />
          {actionLabel}
        </button>
      </div>
      <div
        onPointerDown={alBajarPuntero}
        onPointerMove={alMoverPuntero}
        onPointerUp={alSoltarPuntero}
        onPointerCancel={alSoltarPuntero}
        onClick={() => { if (abierta) cerrar(); }}
        style={{ transform: `translateX(${arrastreX}px)` }}
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
