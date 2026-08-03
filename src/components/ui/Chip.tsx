import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   Chip

   Lo que `Badge` deja fuera a propósito: se pulsa. Un filtro de categoría en
   Ejercicios, un alimento seleccionable en el picker de Nutrición, un tag que
   se puede quitar en Preferencias. `Badge` informa; `Chip` decide.

   El botón de seleccionar y el de quitar son HERMANOS, no uno dentro del otro.
   Un `<button>` dentro de otro `<button>` es HTML inválido —el navegador lo
   repara moviendo el interior fuera, en un sitio impredecible del árbol— y es
   el error exacto que se comete al añadir una "X" a un chip sin pensarlo dos
   veces. Aquí ambos viven dentro del mismo envoltorio, uno junto al otro.

   `selected` no es lo mismo que `active` en Tabs: aquí puede haber CERO, UNO o
   VARIOS chips seleccionados a la vez —un conjunto de filtros, no una pestaña
   única— así que el estado vive fuera y la primitiva solo lo pinta.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  children: React.ReactNode;
  selected?: boolean;
  icon?: string;
  /** Aparece a la derecha; al pulsarla quita el chip sin activar la selección. */
  onRemove?: () => void;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Badge). */
  key?: React.Key;
};

export default function Chip({
  children,
  selected = false,
  icon,
  onRemove,
  disabled = false,
  onClick,
  className = '',
}: Props) {
  const tonoBorde = selected ? 'border-accent-line bg-accent-bg text-accent' : 'border-hairline bg-raised text-ink-2';
  const contenido = (
    <>
      {icon && <Icon name={icon} size="s" filled={selected} />}
      {children}
    </>
  );

  return (
    <span
      className={
        `inline-flex items-center gap-1 rounded-full border pl-3 ${onRemove ? 'pr-2' : 'pr-3'} py-2 `
        + `transition-colors ${tonoBorde} ${disabled ? 'opacity-40' : ''} ${className}`
      }
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-pressed={selected}
          className={
            'inline-flex items-center gap-2 font-sans text-body-s font-medium select-none '
            + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:rounded-full '
            + (disabled ? 'pointer-events-none' : 'hover:opacity-80')
          }
        >
          {contenido}
        </button>
      ) : (
        <span className="inline-flex items-center gap-2 font-sans text-body-s font-medium select-none">
          {contenido}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Quitar"
          className={
            'flex h-5 w-5 items-center justify-center rounded-full '
            + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
            + (disabled ? 'pointer-events-none' : 'hover:bg-white/10')
          }
        >
          <Icon name="close" size="s" />
        </button>
      )}
    </span>
  );
}
