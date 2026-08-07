import React from 'react';
import Icon from './Icon';

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

   Fase 3: el campo crece a 54 px (radio 16) y la etiqueta pasa a mono
   versalitas con tracking .16em —el handoff trata toda etiqueta de campo como
   un dato, no como prosa—. El foco ya no es un anillo genérico: es la
   etiqueta y el borde poniéndose en oro a la vez, y eso se resuelve con
   `group`/`focus-within` en `Campo` en vez de que cada campo tenga que llevar
   su propio estado de "¿tengo el foco ahora mismo?" — Input y Select
   comparten el mismo envoltorio, así que lo comparten gratis.
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
    <div className={`group flex flex-col gap-2 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="font-mono text-caption font-semibold uppercase tracking-[.16em] text-ink-3 transition-colors duration-(--duration-state) group-focus-within:text-accent"
        >
          {label}
          {required && <span className="text-accent"> *</span>}
        </label>
      )}
      {children}
      {ayuda && (
        <p
          id={`${id}-ayuda`}
          className={`flex items-center gap-2 font-sans text-body-s ${error ? 'text-danger' : 'text-ink-3'}`}
        >
          {error && <Icon name="error" size="s" />}
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
          <span className="ui-icon text-icon-m pointer-events-none absolute left-4 text-ink-3" aria-hidden>
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
            // hace zoom al enfocar y no lo deshace. 54 px de alto es el
            // objetivo del handoff — no hay paso limpio de 4 px que lo
            // alcance, así que va en valor arbitrario en vez de aproximar.
            // El borde no cambia de GROSOR al enfocar (eso desplazaría el
            // contenido de al lado 0,5 px); el "1,5 px oro" del handoff se
            // consigue con un anillo fino superpuesto, no ensanchando la caja.
            'h-[54px] w-full rounded-field border bg-field font-sans text-title-s text-ink '
            + 'placeholder:text-ink-3 transition-colors duration-(--duration-state) '
            + 'focus:outline-none focus:ring-1 focus:ring-inset '
            + 'disabled:opacity-40 disabled:cursor-not-allowed '
            // 44 px despejaría el icono con más margen, pero no está en la
            // escala de espaciado del DS; 40 (pl-10) es el paso más cercano
            // y deja 4 px de aire tras un icono de 20 px que arranca en 16.
            + `${icon ? 'pl-10 pr-4' : 'px-4'} `
            + `${error ? 'border-danger/55 focus:border-danger focus:ring-danger' : 'border-hairline focus:border-accent focus:ring-accent'}`
          }
        />
      </div>
    </Campo>
  );
}
