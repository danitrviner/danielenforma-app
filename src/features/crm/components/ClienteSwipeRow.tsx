import React from 'react';
import { Icon } from '../../../components/ui';

/**
 * Variante de `ui/SwipeRow` con DOS acciones reveladas al deslizar (Mensaje +
 * Renovar/Asignar), ninguna destructiva. Vive aquí, no en `ui/`, porque
 * `SwipeRow` está construido específicamente para una acción destructiva con
 * fondo rojo fijo — generalizarla habría afectado a todo lo que ya la usa
 * (F3.3). Misma física de arrastre, dos botones en vez de uno.
 */

const ANCHO_BOTON_PX = 84;
const RECORRIDO_PX = ANCHO_BOTON_PX * 2;

interface Accion {
  label: string;
  icon: string;
  onClick: () => void;
}

interface Props {
  children: React.ReactNode;
  mensaje: Accion;
  principal: Accion;
  className?: string;
  key?: React.Key;
}

export default function ClienteSwipeRow({ children, mensaje, principal, className = '' }: Props) {
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
      <div className="absolute inset-y-0 right-0 flex" style={{ width: RECORRIDO_PX }}>
        <button
          type="button"
          onClick={() => { cerrar(); mensaje.onClick(); }}
          aria-label={mensaje.label}
          style={{ width: ANCHO_BOTON_PX }}
          className="flex h-full flex-col items-center justify-center gap-1 bg-white/10 font-sans text-caption font-bold text-ink"
        >
          <Icon name={mensaje.icon} size="m" />
          {mensaje.label}
        </button>
        <button
          type="button"
          onClick={() => { cerrar(); principal.onClick(); }}
          aria-label={principal.label}
          style={{ width: ANCHO_BOTON_PX }}
          className="flex h-full flex-col items-center justify-center gap-1 bg-accent font-sans text-caption font-bold text-black"
        >
          <Icon name={principal.icon} size="m" />
          {principal.label}
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
