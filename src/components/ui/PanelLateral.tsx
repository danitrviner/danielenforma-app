import React from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { useEscape } from './internal/overlayHooks';

/* ═══════════════════════════════════════════════════════════════════════════
   PanelLateral

   Panel fijo a la derecha, para escritorio: consultar algo (la ficha de un
   ejercicio) sin perder la pantalla de debajo. A diferencia de Sheet NO es
   modal: no hay velo, no se bloquea el scroll ni se atrapa el foco, y lo de
   debajo sigue funcionando (tocar otra «Ficha» cambia el contenido). Se cierra
   con la ✕ o con Escape. Tapa la franja derecha; no encoge la pantalla.
   En móvil se usa Sheet: quien lo pinta elige con `useAnchoMinimo`.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function PanelLateral({ open, onClose, title, children }: Props) {
  const ref = React.useRef<HTMLElement>(null);
  const idTitulo = React.useId();
  useEscape(onClose, open);
  // Al abrir, el foco entra en el panel para que el teclado llegue a él.
  React.useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;

  return createPortal(
    <aside
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      className="fixed inset-y-0 right-0 z-[var(--z-modal)] flex w-[420px] max-w-full flex-col border-l border-strong bg-raised pt-[var(--safe-top)] shadow-e2 focus:outline-none animate-sheet-in"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4">
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
      <div className="flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </aside>,
    document.body,
  );
}
