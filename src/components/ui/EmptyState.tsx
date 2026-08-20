import React from 'react';
import Button from './Button';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   EmptyState

   «Aún no tienes rutinas», «Ningún cliente coincide con la búsqueda», «Sin
   resultados». La última primitiva de F7, y la más simple: un icono grande,
   un título, una explicación corta y un botón opcional.

   El relleno vertical es 40 px (`py-10`), no un número nuevo: F6 ya lo decidió
   al migrar el espaciado —los `py-12/16/20/24` que convivían en la app eran
   TODOS estados vacíos o cargadores, y el DS le asigna a ese paso concreto 40
   px—. Esta primitiva no inventa el valor, aplica la decisión que ya estaba
   tomada.

   El icono usa `text-icon-xl` (32 px) en `ink-3` por defecto, nunca `accent`:
   un estado vacío no es una llamada a la acción dorada por sí solo — si tiene
   acción, es el botón quien la lleva, no el icono decorativo de arriba.

   `iconTone="accent"` es la única excepción, y a propósito estrecha: un
   "todo al día" (Home Coach, Home Atleta) es un estado positivo de cero
   pendientes, no una lista vacía — el handoff de Fase 3 lo trata como el
   único acento de esa pantalla, no como decoración de un hueco sin datos.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** Nombre de icono de Material Symbols. */
  icon: string;
  title: string;
  description?: string;
  /** Texto del botón. Sin esto no hay acción — un estado vacío no la necesita siempre. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Segunda acción, en `secondary` mientras la primera pasa a `primary` —
   * "biblioteca vacía" (Ejercicios) necesita "Cargar los base" y "Crear uno
   * desde cero" a la vez; sin esto, esos sitios no podían usar la primitiva.
   */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** 'accent' solo para un cero-pendientes positivo — ver nota arriba. */
  iconTone?: 'neutral' | 'accent';
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  iconTone = 'neutral',
  className = '',
}: Props) {
  return (
    <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${className}`}>
      {iconTone === 'accent' ? (
        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-field bg-accent/14">
          <Icon name={icon} size="l" className="text-accent" />
        </span>
      ) : (
        <Icon name={icon} size="xl" className="text-ink-3" />
      )}
      <div className="flex flex-col gap-1">
        <p className="font-sans text-title-s font-bold text-ink">{title}</p>
        {description && <p className="font-sans text-body-s text-ink-2">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Button variant={secondaryActionLabel ? 'primary' : 'secondary'} onClick={onAction}>
            {actionLabel}
          </Button>
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
