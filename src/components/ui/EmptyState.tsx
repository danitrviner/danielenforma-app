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

   El icono usa `text-icon-xl` (32 px) en `ink-3`, nunca `accent`: un estado
   vacío no es una llamada a la acción dorada por sí solo — si tiene acción, es
   el botón quien la lleva, no el icono decorativo de arriba.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** Nombre de icono de Material Symbols. */
  icon: string;
  title: string;
  description?: string;
  /** Texto del botón. Sin esto no hay acción — un estado vacío no la necesita siempre. */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: Props) {
  return (
    <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${className}`}>
      <Icon name={icon} size="xl" className="text-ink-3" />
      <div className="flex flex-col gap-1">
        <p className="font-sans text-title-s font-bold text-ink">{title}</p>
        {description && <p className="font-sans text-body-s text-ink-2">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
