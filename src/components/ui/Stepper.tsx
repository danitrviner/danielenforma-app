import React from 'react';
import Icon from './Icon';
import { haptics } from '../../services/haptics';

/* ═══════════════════════════════════════════════════════════════════════════
   Stepper (Fase 3, nueva)

   Dos botones y una cifra: la carga de una serie, los gramos de un macro en
   la hoja de ajuste, los minutos de un registro de cardio. El handoff es
   consistente en los tres sitios donde aparece: botón de "menos" neutro,
   botón de "más" en oro, cifra central en mono, haptic light por toque —
   nunca medium, ni siquiera para "más": es un ajuste fino, no una decisión.

   `value`/`onChange` en vez de estado interno: el llamador decide el
   redondeo (2,5 kg en carga, 1 en reps) y el límite (0 no puede bajar de
   cero); el stepper solo suma o resta `step` y avisa.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  value: number;
  onChange: (valor: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Cómo se lee la cifra: "72,5" en vez de "72.5" para pesos en kg. */
  format?: (valor: number) => string;
  /** Etiqueta bajo la cifra, ya traducida: "kg", "min". */
  unit?: string;
  label: string;
  /** El botón "menos" pierde su fondo neutro cuando `dense` — filas de tabla
   * apretadas (editor de serie) no tienen sitio para dos botones de 52 px. */
  dense?: boolean;
  className?: string;
};

const FORMATO_POR_DEFECTO = (v: number) => v.toLocaleString('es-ES');

export default function Stepper({
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  format = FORMATO_POR_DEFECTO,
  unit,
  label,
  dense = false,
  className = '',
}: Props) {
  const alTocar = (delta: number) => {
    const siguiente = Math.min(max, Math.max(min, value + delta));
    if (siguiente === value) return;
    void haptics.light();
    onChange(siguiente);
  };

  const tamanoBoton = dense ? 'h-11 w-11' : 'h-13 w-13';

  return (
    <div className={`inline-flex items-center gap-3 ${className}`} role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => alTocar(-step)}
        disabled={value <= min}
        aria-label={`Restar ${step}`}
        className={
          `flex ${tamanoBoton} items-center justify-center rounded-field bg-inset text-ink-2 `
          + 'transition-colors duration-(--duration-state) hover:bg-white/5 '
          + 'disabled:opacity-30 disabled:pointer-events-none '
          + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line'
        }
      >
        <Icon name="remove" size="m" />
      </button>

      <div className="flex min-w-[64px] flex-col items-center">
        <span className="font-mono text-feature font-semibold tabular-nums text-ink">{format(value)}</span>
        {unit && <span className="font-mono text-caption uppercase tracking-[.1em] text-ink-3">{unit}</span>}
      </div>

      <button
        type="button"
        onClick={() => alTocar(step)}
        disabled={value >= max}
        aria-label={`Sumar ${step}`}
        className={
          `flex ${tamanoBoton} items-center justify-center rounded-field bg-accent text-on-accent `
          + 'transition-colors duration-(--duration-state) hover:bg-accent-press '
          + 'disabled:opacity-30 disabled:pointer-events-none disabled:bg-inset disabled:text-ink-5 '
          + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
        }
      >
        <Icon name="add" size="m" />
      </button>
    </div>
  );
}
