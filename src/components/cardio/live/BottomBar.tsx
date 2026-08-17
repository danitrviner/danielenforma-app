import React, { useEffect, useState } from 'react';
import { Icon } from '../../ui';

/* Barra inferior de la pantalla en vivo — SIEMPRE en `--color-surface`
   neutro, nunca del color de zona (§8bis del análisis: en FITIV el color de
   zona se acota al bloque de contenido central; el pie es oscuro neutro
   tanto ahí como aquí). Pausa (círculo ámbar, el único elemento oro relleno
   de toda la pantalla — regla del DS, "un oro por pantalla") + cronómetro
   grande + hora real + chevron para el cajón. El cronómetro NO se anima:
   regla dura del DS para números que se leen mientras cambian. */

function fmtClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function useClockLabel(): string {
  const [label, setLabel] = useState(() => new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit' }).format(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => {
      setLabel(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit' }).format(new Date()));
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

interface Props {
  elapsedSec: number;
  paused: boolean;
  onTogglePause: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export default function BottomBar({ elapsedSec, paused, onTogglePause, expanded, onToggleExpanded }: Props) {
  const clockLabel = useClockLabel();

  return (
    <div className="flex items-center justify-between px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3 bg-surface">
      <button
        type="button"
        onClick={onTogglePause}
        aria-label={paused ? 'Reanudar' : 'Pausar'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
      >
        <Icon name={paused ? 'play_arrow' : 'pause'} size="l" filled />
      </button>

      <div className="text-center">
        <p className="font-mono text-hero font-bold text-white tabular-nums leading-none">{fmtClock(elapsedSec)}</p>
        <p className="text-label font-sans text-white/60 mt-1">{clockLabel}</p>
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        aria-label={expanded ? 'Contraer' : 'Más opciones'}
        aria-expanded={expanded}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-black/25 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
      >
        <Icon name={expanded ? 'expand_more' : 'expand_less'} size="l" />
      </button>
    </div>
  );
}
