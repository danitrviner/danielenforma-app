import React from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useEscape, useFocusTrap, useScrollLock } from './internal/overlayHooks';
import { ANCHO_OVERLAY, type OverlaySize } from './internal/overlaySizes';

/* ═══════════════════════════════════════════════════════════════════════════
   Dialog

   La caja centrada: confirmar una acción destructiva, un formulario corto que
   no necesita el gesto de "panel que sube" de `Sheet`. Comparte toda la
   infraestructura de `internal/overlayHooks.ts` —foco atrapado, Escape,
   bloqueo de scroll con contador compartido— así que lo único que cambia
   respecto a `Sheet` es la posición y que no lleva asa de arrastre.

   `danger` en la acción de confirmar de un diálogo destructivo no es una
   prop de `Dialog`: es simplemente pasar `<Button variant="danger">` como
   `footer`. El diálogo no conoce el dominio de lo que confirma.
   ═══════════════════════════════════════════════════════════════════════════ */

/** La escala de anchos es común con `Sheet`; vive en `internal/overlaySizes`. */
export type DialogSize = OverlaySize;

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  /** Nombre accesible cuando no hay `title` visible. */
  label?: string;
};

export default function Dialog({ open, onClose, title, children, footer, size = 'm', label }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const idTitulo = React.useId();

  useScrollLock(open);
  useFocusTrap(ref, open);
  useEscape(onClose, open);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 z-[var(--z-overlay)] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? idTitulo : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        className={
          `relative z-[var(--z-modal)] flex max-h-[85vh] w-full ${ANCHO_OVERLAY[size]} flex-col `
          + 'rounded-canvas border border-strong bg-surface shadow-e2 focus:outline-none'
        }
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <h2 id={idTitulo} className="font-sans text-title-s font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
            >
              <Icon name="close" size="m" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
