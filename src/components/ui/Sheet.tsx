import React from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useEscape, useFocusTrap, useScrollLock } from './internal/overlayHooks';

/* ═══════════════════════════════════════════════════════════════════════════
   Sheet

   El panel que sube desde abajo: un picker, un filtro, un formulario corto. Es
   el gesto nativo de móvil para "una tarea a la vez sin dejar la pantalla".

   Cierra la deuda «overlays fixed inset-0» que persigue F9, pero SOLO como
   plantilla: los 39 overlays artesanales de la app no se tocan en F7 —eso es
   adopción, y le toca a F9—. Lo que hay aquí es lo que a esos 39 les falta hoy,
   verificado uno por uno:

     · **Foco atrapado.** Ninguno de los 39 lo tiene: el tabulador se escapa al
       fondo de la pantalla mientras el overlay sigue abierto.
     · **Escape cierra.** Tampoco.
     · **Scroll de fondo bloqueado sin el bug clásico de la migración (R4).**
       Ver `internal/overlayHooks.ts` — un contador compartido, no un
       overflow capturado por overlay.
     · **Retrato de foco.** Al cerrar, el foco vuelve a quien abrió el Sheet,
       no se queda flotando en el documento.

   Se monta en un portal a `document.body`: así el `z-index` de la escala
   declarada en F2 (`--z-overlay`, `--z-modal`) es la autoridad real, y no
   compite con el `overflow: hidden`/`position: relative` de un contenedor
   intermedio en la pantalla que lo abre — que es exactamente el tipo de fallo
   silencioso que hace que un overlay "funcione" en una pantalla y se corte en
   otra.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Nombre accesible cuando no hay `title` visible. */
  label?: string;
};

export default function Sheet({ open, onClose, title, children, footer, label }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const idTitulo = React.useId();

  useScrollLock(open);
  useFocusTrap(ref, open);
  useEscape(onClose, open);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center">
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
          'relative z-[var(--z-modal)] flex max-h-[85vh] w-full max-w-lg flex-col '
          + 'rounded-t-canvas border-t border-x border-strong bg-surface shadow-e2 '
          + 'focus:outline-none sm:mb-6 sm:rounded-canvas sm:border'
        }
      >
        {/* Asa visual: el gesto de "esto se puede arrastrar" en móvil. No es
            interactiva por su cuenta — arrastrar para cerrar no es objetivo
            de F7, solo tocar fuera o Escape. */}
        <div className="flex shrink-0 justify-center pt-3" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-2">
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

        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>

        {footer && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 pt-3"
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
