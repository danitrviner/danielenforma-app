import React from 'react';
import { haptics } from '../../services/haptics';

/* ═══════════════════════════════════════════════════════════════════════════
   EffortScale (Fase 3, nueva)

   La única escala 1-10 que sobrevive al cambio global a RIR, y solo en un
   sitio: cardio sin pulsómetro. El campo se llama ESFUERZO, no RPE — el
   contrato de datos lo trata como un campo distinto, no intercambiable con
   `rir`. Misma lógica visual que RirScale (color solo en el segmento
   elegido, nunca un medidor que se rellena), con la escala del RPE original
   sin invertir: 1-7 oro al 45 %, 8-10 oro pleno — aquí un número ALTO sí es
   el esfuerzo duro.

   La frase que traduce el número (handoff, Cardio 04: "una frase que
   traduce el número") es lo que hace que un atleta sin banda de FC pueda
   registrar sin adivinar qué significa un 6 frente a un 7.
   ═══════════════════════════════════════════════════════════════════════════ */

const FRASE: Record<number, string> = {
  1: 'Muy suave, casi en reposo',
  2: 'Suave, respiración tranquila',
  3: 'Cómodo, hablo sin problema',
  4: 'Cómodo, empiezo a notarlo',
  5: 'Moderado, hablo con alguna pausa',
  6: 'Moderado-alto, cuesta mantener la charla',
  7: 'Duro, frases cortas',
  8: 'Muy duro, apenas hablo',
  9: 'Casi al límite',
  10: 'Al límite, no podría más',
};

function clasesSeleccionado(valor: number): string {
  if (valor >= 8) return 'bg-accent border-accent text-on-accent';
  return 'bg-accent/45 border-accent text-on-accent';
}

type Props = {
  value: number | null;
  onChange: (valor: number) => void;
  label: string;
  className?: string;
};

export default function EffortScale({ value, onChange, label, className = '' }: Props) {
  return (
    <div className={className}>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1 sm:grid-cols-10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const activo = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => { void haptics.light(); onChange(n); }}
              className={
                'flex h-11 items-center justify-center rounded-control border font-mono text-title-s font-semibold '
                + 'transition-colors duration-(--duration-state) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
                + (activo ? clasesSeleccionado(n) : 'border-hairline bg-inset text-ink-3 hover:border-strong')
              }
            >
              {n}
            </button>
          );
        })}
      </div>
      {value != null && (
        <p className="mt-2 font-sans text-body-s text-ink-2">{FRASE[value]}</p>
      )}
    </div>
  );
}
