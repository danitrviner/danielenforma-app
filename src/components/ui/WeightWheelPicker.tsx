import React, { useEffect, useMemo, useRef } from 'react';
import Icon from './Icon';
import { haptics } from '../../services/haptics';

/* ═══════════════════════════════════════════════════════════════════════════
   WeightWheelPicker

   Dos columnas que se deslizan como una rueda de fecha nativa: kilos enteros
   a la izquierda, décima a la derecha. No hay control nativo equivalente con
   dos columnas sincronizadas (a diferencia de <input type="date">), así que
   esto es CSS scroll-snap + un poco de matemática de scroll, sin dependencia
   nueva — mismo criterio que Select.tsx de apoyarse en el navegador antes que
   fabricar un widget, llevado al límite de lo que el navegador ya no cubre.

   El deslizar no es la única vía: cada columna tiene flechas arriba/abajo
   para quien no puede o no quiere gesto táctil.
   ═══════════════════════════════════════════════════════════════════════════ */

const ROW_H = 44;
const VISIBLE_ROWS = 3;
const COL_H = ROW_H * VISIBLE_ROWS;
const PAD = (COL_H - ROW_H) / 2;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type ColumnProps = {
  options: number[];
  value: number;
  onChange: (value: number) => void;
  label: string;
};

function WheelColumn({ options, value, onChange, label }: ColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(value);
  const programmatic = useRef(false);

  const scrollToValue = (v: number, smooth: boolean) => {
    const idx = options.indexOf(v);
    const el = containerRef.current;
    if (idx < 0 || !el) return;
    programmatic.current = true;
    el.scrollTo({ top: idx * ROW_H, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => { programmatic.current = false; }, smooth ? 350 : 50);
  };

  // Solo re-centra cuando `value` cambia desde FUERA (prefill al abrir el
  // editor) — si el cambio lo emitió esta misma columna, lastEmitted ya
  // coincide y no hay que pelear con el scroll que el usuario está haciendo.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    scrollToValue(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    scrollToValue(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = () => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / ROW_H)));
    const v = options[idx];
    scrollToValue(v, true);
    if (v !== lastEmitted.current) {
      lastEmitted.current = v;
      void haptics.light();
      onChange(v);
    }
  };

  const handleScroll = () => {
    if (programmatic.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, 120);
  };

  const step = (dir: 1 | -1) => {
    const idx = options.indexOf(value);
    const nextIdx = Math.min(options.length - 1, Math.max(0, idx + dir));
    const v = options[nextIdx];
    if (v === value) return;
    void haptics.light();
    lastEmitted.current = v;
    onChange(v);
    scrollToValue(v, true);
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => step(1)}
        disabled={options.indexOf(value) >= options.length - 1}
        aria-label={`Subir ${label}`}
        className="p-1 text-ink-3 hover:text-white disabled:opacity-30 transition-colors"
      >
        <Icon name="expand_less" size="s" />
      </button>

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-11 rounded-control bg-white/5 border-y border-accent/30 z-0" />
        <div
          ref={containerRef}
          onScroll={handleScroll}
          role="listbox"
          aria-label={label}
          className="hide-scrollbar relative z-10 h-[132px] w-16 overflow-y-scroll snap-y snap-mandatory"
        >
          <div style={{ height: PAD }} />
          {options.map(opt => (
            <div
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={`h-11 flex items-center justify-center snap-center font-mono tabular-nums transition-colors ${
                opt === value ? 'text-white text-title-s font-bold' : 'text-ink-3 text-body-s'
              }`}
            >
              {opt.toString().padStart(label === 'décima' ? 1 : 2, '0')}
            </div>
          ))}
          <div style={{ height: PAD }} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => step(-1)}
        disabled={options.indexOf(value) <= 0}
        aria-label={`Bajar ${label}`}
        className="p-1 text-ink-3 hover:text-white disabled:opacity-30 transition-colors"
      >
        <Icon name="expand_more" size="s" />
      </button>
    </div>
  );
}

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

export default function WeightWheelPicker({ value, onChange, min = 20, max = 300 }: Props) {
  const kg = Math.min(max, Math.max(min, Math.floor(value)));
  const tenths = Math.round((value - Math.floor(value)) * 10) % 10;

  const kgOptions = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const tenthOptions = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Selector de peso">
      <WheelColumn options={kgOptions} value={kg} onChange={v => onChange(round1(v + tenths / 10))} label="kilos" />
      <span className="font-mono text-title-m text-ink-3 font-bold">,</span>
      <WheelColumn options={tenthOptions} value={tenths} onChange={v => onChange(round1(kg + v / 10))} label="décima" />
      <span className="font-mono text-label text-ink-3 ml-1">kg</span>
    </div>
  );
}
