import React from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useEscape, useFocusTrap, useScrollLock } from './internal/overlayHooks';

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

export type DialogSize = 's' | 'm' | 'l' | 'xl';

/**
 * Clases literales: Tailwind lee cadenas del código, no las compone.
 *
 * `xl` lo añade F9, no F7. Al censar los 38 overlays artesanales antes de
 * migrarlos, los anchos reales salieron `sm` 11, `md` 9, `lg` 9 y **`2xl` 5** —
 * y esos 5 son justo los que muestran prosa larga o dos columnas (el visor de
 * reportes del atleta, el editor de cuestionarios, el análisis semanal de IA,
 * el constructor de recetas, la vista previa de rutinas). Sin este escalón,
 * adoptar la primitiva los estrecharía de 672 a 512 px, que es una regresión
 * de legibilidad, no un cambio de estilo. Es aditivo: ningún uso previo cambia.
 */
const ANCHO: Record<DialogSize, string> = {
  s: 'max-w-sm',
  m: 'max-w-md',
  l: 'max-w-lg',
  xl: 'max-w-2xl',
};

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
          `relative z-[var(--z-modal)] flex max-h-[85vh] w-full ${ANCHO[size]} flex-col `
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
