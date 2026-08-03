import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Input · Campo

   Dos deudas abiertas del panel de estado se juntan en esta primitiva, y las
   dos son de accesibilidad real, no de estética:

     · **238 campos por debajo de 16 px.** Safari en iOS hace zoom al enfocar
       un campo con letra menor de 16 px, y NO revierte al salir: el usuario se
       queda con la página ampliada y tiene que despinzarla a mano. La
       auditoría contó 5; eran 238. Aquí el tamaño no es un parámetro: un
       campo mide 16 px y punto.
     · **116 `<label>` sin `htmlFor`.** Una etiqueta que no apunta a su campo
       no es una etiqueta: no la anuncia el lector de pantalla y no enfoca el
       campo al tocarla, que en móvil es un objetivo táctil regalado. El
       contador de `htmlFor` está en 0 en toda la app. La primitiva enlaza
       etiqueta, ayuda y error con `useId`, así que no hay forma de olvidarlo.

   `Campo` va aparte y se exporta porque `Select` necesita exactamente el mismo
   envoltorio —etiqueta arriba, ayuda o error debajo, enlazados por id— y
   duplicarlo sería empezar a divergir en la segunda pieza.
   ═══════════════════════════════════════════════════════════════════════════ */

type CampoProps = {
  /** Id del control que esta etiqueta describe. */
  id: string;
  label?: string;
  /** Texto de ayuda permanente. Lo tapa el error mientras haya error. */
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function Campo({ id, label, hint, error, required, children, className = '' }: CampoProps) {
  const ayuda = error || hint;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label htmlFor={id} className="font-sans text-label font-bold text-ink-2">
          {label}
          {required && <span className="text-accent"> *</span>}
        </label>
      )}
      {children}
      {ayuda && (
        <p
          id={`${id}-ayuda`}
          className={`font-sans text-body-s ${error ? 'text-danger' : 'text-ink-3'}`}
        >
          {ayuda}
        </p>
      )}
    </div>
  );
}

/**
 * Los tipos que un campo de texto admite. `number` queda fuera a propósito: en
 * móvil da una rueda que se dispara al hacer scroll y acepta `e` y `+` como
 * texto válido. Para cifras, `inputMode="decimal"` sobre un campo de texto.
 */
export type InputType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'date' | 'time';

type Props = {
  label?: string;
  value: string;
  onChange: (valor: string) => void;
  type?: InputType;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Icono decorativo a la izquierda: lupa en un buscador, sobre en un email. */
  icon?: string;
  /** Teclado que pide el móvil. `decimal` para pesos, repeticiones, calorías. */
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'tel' | 'search' | 'url';
  autoComplete?: string;
  name?: string;
  className?: string;
};

export default function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  error,
  required,
  disabled,
  icon,
  inputMode,
  autoComplete,
  name,
  className = '',
}: Props) {
  const id = React.useId();

  return (
    <Campo id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative flex items-center">
        {icon && (
          // Decorativo: lo que nombra el campo es la etiqueta, no el icono.
          <span className="ui-icon text-icon-m pointer-events-none absolute left-3 text-ink-3" aria-hidden>
            {icon}
          </span>
        )}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-ayuda` : undefined}
          className={
            // 16 px (`title-s`) no es una elección de estilo: por debajo, iOS
            // hace zoom al enfocar y no lo deshace.
            'h-11 w-full rounded-control border bg-field font-sans text-title-s text-ink '
            + 'placeholder:text-ink-3 transition-colors '
            + 'focus:outline-none focus:ring-2 focus:ring-accent-line '
            + 'disabled:opacity-40 disabled:cursor-not-allowed '
            + `${icon ? 'pl-10 pr-3' : 'px-3'} `
            + `${error ? 'border-danger/40 focus:border-danger' : 'border-hairline focus:border-accent-line'}`
          }
        />
      </div>
    </Campo>
  );
}
