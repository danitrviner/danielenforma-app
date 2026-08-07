import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   SearchField (Fase 3, nueva)

   El buscador que crece al enfocar: 48 px en reposo, 54 px con foco, borde e
   icono pasan a oro en 200 ms y aparece "Cancelar" a la derecha. Distinto de
   `Input` a propósito —no es "Input con icono de lupa"—: `Input` es 54 px
   fijo con etiqueta arriba; este campo no lleva etiqueta y su propia altura
   es el estado, no un tamaño constante.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  /** Se llama al pulsar "Cancelar": normalmente vacía el valor y quita el foco. */
  onCancel?: () => void;
  label: string;
  className?: string;
};

export default function SearchField({ value, onChange, placeholder = 'Buscar…', onCancel, label, className = '' }: Props) {
  const [enfocado, setEnfocado] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);

  const cancelar = () => {
    onChange('');
    ref.current?.blur();
    onCancel?.();
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={
          'relative flex flex-1 items-center rounded-field border bg-field transition-[height,border-color] duration-(--duration-state) ease-brand '
          + (enfocado ? 'h-[54px] border-accent' : 'h-12 border-hairline')
        }
      >
        <span className={`ui-icon text-icon-m pointer-events-none absolute left-4 transition-colors duration-(--duration-state) ${enfocado ? 'text-accent' : 'text-ink-3'}`} aria-hidden>
          search
        </span>
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          placeholder={placeholder}
          aria-label={label}
          className="h-full w-full rounded-field bg-transparent pl-10 pr-4 font-sans text-title-s text-ink placeholder:text-ink-3 focus:outline-none"
        />
      </div>
      {enfocado && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancelar}
          className="shrink-0 font-sans text-body-s font-bold text-accent"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
