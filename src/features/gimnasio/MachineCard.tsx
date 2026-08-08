import React, { useCallback, useRef, useState } from 'react';
import type { Maquina } from '../../types';
import { MARCA_LABELS } from '../../types';
import { haptics } from '../../services/haptics';

/* ═══════════════════════════════════════════════════════════════════════════
   Tarjeta de máquina con arrastre real.

   El gesto sigue al dedo con una rotación proporcional al desplazamiento; al
   soltar más allá del umbral la tarjeta sale volando y entra la siguiente. Es
   pointer events puros y `transform`, sin librería de animación: el proyecto no
   tiene ninguna y no vale la pena traerla para un componente.

   Accesibilidad: la tarjeta NO es el único camino. Los dos botones de abajo
   (en CatalogoSwipe) hacen lo mismo y son alcanzables por teclado y por lector
   de pantalla; con `prefers-reduced-motion` la salida es un desvanecido y no un
   vuelo lateral.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Distancia en px a partir de la cual soltar cuenta como decisión. */
const UMBRAL = 110;
/** Cuánto se aleja la tarjeta al salir; suficiente para desaparecer en cualquier móvil. */
const VUELO = 620;
const SALIDA_MS = 260;

type Props = {
  maquina: Maquina;
  /** 0 = la de arriba (arrastrable), 1 y 2 = las del fondo de la pila. */
  profundidad: number;
  onDecidir: (tengo: boolean) => void;
  /** Dirección impuesta desde los botones, para que la tarjeta salga igual que al arrastrar. */
  salidaForzada?: 'izquierda' | 'derecha' | null;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Chip). */
  key?: React.Key;
};

function reduceMovimiento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export default function MachineCard({ maquina, profundidad, onDecidir, salidaForzada }: Props) {
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef(0);
  const saliendo = useRef(false);

  const esArriba = profundidad === 0;

  const salir = useCallback(
    (tengo: boolean) => {
      if (saliendo.current) return;
      saliendo.current = true;
      haptics.light();
      setArrastrando(false);
      setDx(tengo ? VUELO : -VUELO);
      window.setTimeout(() => onDecidir(tengo), reduceMovimiento() ? 0 : SALIDA_MS);
    },
    [onDecidir]
  );

  // Los botones de abajo reutilizan la misma animación de salida.
  React.useEffect(() => {
    if (salidaForzada && esArriba) salir(salidaForzada === 'derecha');
  }, [salidaForzada, esArriba, salir]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!esArriba || saliendo.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    inicio.current = e.clientX;
    setArrastrando(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!arrastrando) return;
    setDx(e.clientX - inicio.current);
  };

  const onPointerUp = () => {
    if (!arrastrando) return;
    if (Math.abs(dx) > UMBRAL) salir(dx > 0);
    else { setArrastrando(false); setDx(0); }
  };

  // Las del fondo se escalan y bajan un poco para que se vea que hay pila.
  const escala = 1 - profundidad * 0.04;
  const desplazamientoY = profundidad * 14;
  const rotacion = esArriba ? dx / 18 : 0;

  const intensidad = Math.min(Math.abs(dx) / UMBRAL, 1);
  const suave = reduceMovimiento();

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute inset-0 rounded-canvas bg-surface border border-hairline p-4 select-none"
      style={{
        transform: `translate3d(${suave && saliendo.current ? 0 : dx}px, ${desplazamientoY}px, 0) rotate(${rotacion}deg) scale(${escala})`,
        opacity: suave && saliendo.current ? 0 : 1,
        transition: arrastrando ? 'none' : `transform ${SALIDA_MS}ms cubic-bezier(.2,.9,.2,1), opacity ${SALIDA_MS}ms linear`,
        touchAction: 'pan-y',
        zIndex: 10 - profundidad,
        cursor: esArriba ? 'grab' : 'default',
      }}
      aria-hidden={!esArriba}
    >
      <div className="relative h-[72%] rounded-control overflow-hidden bg-white">
        <img
          src={maquina.fotoUrl}
          alt={maquina.nombreMostrado}
          className="w-full h-full object-contain"
          draggable={false}
          loading={profundidad === 0 ? 'eager' : 'lazy'}
        />

        {/* Los sellos aparecen con el arrastre: confirman la dirección antes de soltar. */}
        <div
          className="absolute top-4 left-4 px-3 py-1 rounded-control border-2 border-success text-success font-mono text-caption font-semibold uppercase tracking-widest"
          style={{ opacity: dx > 0 ? intensidad : 0, transform: 'rotate(-8deg)' }}
        >
          Sí, la tengo
        </div>
        <div
          className="absolute top-4 right-4 px-3 py-1 rounded-control border-2 border-danger text-danger font-mono text-caption font-semibold uppercase tracking-widest"
          style={{ opacity: dx < 0 ? intensidad : 0, transform: 'rotate(8deg)' }}
        >
          No la tengo
        </div>
      </div>

      <div className="pt-4">
        <h2 className="font-display font-black text-feature uppercase text-ink">{maquina.nombreMostrado}</h2>
        <div className="flex gap-2 mt-2">
          <span className="px-2 py-1 rounded-control bg-accent-bg font-mono text-caption font-semibold uppercase tracking-wider text-accent">
            {MARCA_LABELS[maquina.marca] ?? maquina.marca}
          </span>
          <span className="px-2 py-1 rounded-control bg-raised font-mono text-caption font-semibold uppercase tracking-wider text-ink-3">
            {maquina.familia}
          </span>
        </div>
      </div>
    </div>
  );
}
