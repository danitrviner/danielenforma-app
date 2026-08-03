import React from 'react';
import { Campo } from './Input';

/* ═══════════════════════════════════════════════════════════════════════════
   Select

   La deuda que cierra: «`<select>` con aspecto nativo junto a campos
   personalizados». La app tiene desplegables sin tocar —fondo blanco del
   sistema, flecha del sistema, altura del sistema— pegados a campos de texto
   con la piel del DS. Sobre un fondo casi negro no es un detalle: es el único
   control que parece de otra aplicación.

   Sigue siendo un `<select>` nativo, y eso es deliberado. En móvil el
   desplegable del sistema es una rueda a pantalla completa que el pulgar
   maneja mejor que cualquier lista que podamos dibujar, hereda la búsqueda por
   teclado y el lector de pantalla ya sabe leerlo. Lo que se sustituye es la
   PIEL, no el comportamiento: `appearance-none` apaga el dibujo del sistema y
   la flecha se pinta aparte.

   Lo que no se puede maquillar desde aquí: la lista desplegada la dibuja el
   sistema operativo, no el navegador. En escritorio seguirá saliendo con los
   colores del sistema. Es la razón de que un `Select` no valga para todo — un
   selector con iconos, descripciones o búsqueda pide un menú propio, y eso es
   F9, cuando exista `Sheet`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  label?: string;
  value: string;
  onChange: (valor: string) => void;
  options: SelectOption[];
  /** Opción vacía inicial: «Elige una…». Sin esto, el primer valor va elegido. */
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
};

export default function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  required,
  disabled,
  name,
  className = '',
}: Props) {
  const id = React.useId();

  return (
    <Campo id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative flex items-center">
        <select
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-ayuda` : undefined}
          className={
            // 16 px por el mismo motivo que en Input: por debajo, iOS amplía al
            // enfocar. `appearance-none` es lo que apaga la piel del sistema.
            'h-11 w-full appearance-none rounded-control border bg-field font-sans text-title-s '
            + 'text-ink pl-3 pr-10 transition-colors '
            + 'focus:outline-none focus:ring-2 focus:ring-accent-line '
            + 'disabled:opacity-40 disabled:cursor-not-allowed '
            + `${error ? 'border-danger/40 focus:border-danger' : 'border-hairline focus:border-accent-line'}`
          }
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        {/* Decorativa: quien anuncia el control es la etiqueta. Sin eventos de
            puntero para que al pulsar encima se despliegue igual. */}
        <span
          className="ui-icon text-icon-m pointer-events-none absolute right-3 text-ink-3"
          aria-hidden
        >
          expand_more
        </span>
      </div>
    </Campo>
  );
}
