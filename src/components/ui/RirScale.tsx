import React from 'react';
import { haptics } from '../../services/haptics';

/* ═══════════════════════════════════════════════════════════════════════════
   RirScale (Fase 3, nueva)

   La escala de fuerza de toda la app. Decisión de Dani (2026-08-07), que
   corrige al contrato de datos original: **FALLO no es RIR 0** — son dos
   cosas distintas (RIR 0 = "no podía hacer ni una más pero paré ahí"; FALLO
   = "seguí hasta que la forma se rompió"). Por eso la escala tiene 7
   segmentos, no 6: FALLO · 0 · 1 · 2 · 3 · 4 · 5.

   El color se aplica SOLO al segmento elegido —igual que un chip: "oro solo
   en selección"—, no como un medidor que se rellena hasta el valor. Y se
   invierte respecto al viejo RPE: aquí un número BAJO es la serie dura.
     FALLO           → rojo (`danger`)
     RIR 0 · RIR 1   → oro pleno
     RIR 2 · RIR 3   → oro al 45 %
     RIR 4 · RIR 5   → oro al 25 %
   Sin elegir, los 7 segmentos son neutros — no hay un valor por defecto que
   pintar de oro sin que el atleta lo haya tocado.
   ═══════════════════════════════════════════════════════════════════════════ */

export type RirValue = 0 | 1 | 2 | 3 | 4 | 5 | 'fallo';

const SEGMENTOS: { valor: RirValue; texto: string }[] = [
  { valor: 'fallo', texto: 'FALLO' },
  { valor: 0, texto: '0' },
  { valor: 1, texto: '1' },
  { valor: 2, texto: '2' },
  { valor: 3, texto: '3' },
  { valor: 4, texto: '4' },
  { valor: 5, texto: '5' },
];

function clasesSeleccionado(valor: RirValue): string {
  if (valor === 'fallo') return 'bg-danger/16 border-danger text-danger';
  if (valor <= 1) return 'bg-accent border-accent text-on-accent';
  if (valor <= 3) return 'bg-accent/45 border-accent text-on-accent';
  return 'bg-accent/25 border-accent-line text-accent';
}

type Props = {
  value: RirValue | null;
  onChange: (valor: RirValue) => void;
  label: string;
  className?: string;
};

export default function RirScale({ value, onChange, label, className = '' }: Props) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid grid-cols-7 gap-1 ${className}`}>
      {SEGMENTOS.map((s) => {
        const activo = value === s.valor;
        return (
          <button
            key={s.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => { void haptics.light(); onChange(s.valor); }}
            className={
              'flex h-11 items-center justify-center rounded-control border font-mono font-semibold '
              + `transition-colors duration-(--duration-state) ${s.valor === 'fallo' ? 'text-caption tracking-tight' : 'text-title-s'} `
              + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
              + (activo ? clasesSeleccionado(s.valor) : 'border-hairline bg-inset text-ink-3 hover:border-strong')
            }
          >
            {s.texto}
          </button>
        );
      })}
    </div>
  );
}
