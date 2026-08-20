import React from 'react';
import { Icon } from '../ui';

interface Props {
  totalSeconds: number;
  secondsLeft: number;
  onSkip: () => void;
  onAddSeconds: (seconds: number) => void;
}

/**
 * Descanso — versión anillo del mockup "Serie en curso v2" (frame 04), pero
 * INLINE dentro de la tarjeta del ejercicio, no a pantalla completa (decisión
 * de Dani: el descanso no puede tapar el contenido). Sustituye al pill de
 * texto que vivía en la cabecera sticky del player por el mismo dato con más
 * lectura de un vistazo — el anillo se vacía, el arco dorado es cuánto queda.
 */
export default function RestRing({ totalSeconds, secondsLeft, onSkip, onAddSeconds }: Props) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const listo = secondsLeft <= 0;

  return (
    <div className="flex items-center gap-3 rounded-surface border border-accent-line bg-surface px-3 py-2.5">
      <span className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center" aria-hidden>
        <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="4" />
          <circle
            cx="24" cy="24" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="4"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
            style={{ transition: listo ? undefined : 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="absolute font-mono text-caption font-bold tabular-nums text-ink">
          {Math.floor(Math.max(0, secondsLeft) / 60)}:{String(Math.max(0, secondsLeft) % 60).padStart(2, '0')}
        </span>
      </span>
      <div className="min-w-0 flex-1 leading-none">
        <p className="font-mono text-label font-bold uppercase tracking-wide text-ink">
          {listo ? '¡Listo!' : 'Descanso'}
        </p>
        <p className="font-mono text-caption text-ink-2">de {Math.floor(totalSeconds / 60)}:{String(totalSeconds % 60).padStart(2, '0')}</p>
      </div>
      {!listo && (
        <button
          type="button"
          onClick={() => onAddSeconds(15)}
          className="flex-shrink-0 rounded-control border border-hairline bg-raised px-2.5 py-1.5 font-mono text-caption font-bold text-ink-2 hover:text-ink"
        >
          +15s
        </button>
      )}
      <button
        type="button"
        onClick={onSkip}
        aria-label="Saltar descanso"
        className="flex-shrink-0 rounded-control p-1.5 text-ink-3 hover:text-ink"
      >
        <Icon name="close" size="s" />
      </button>
    </div>
  );
}
