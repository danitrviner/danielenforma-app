import React, { useState } from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   Collapsible

   El gesto de expandir/ocultar se reimplementaba a mano en cada pantalla que
   lo necesitaba (useState + icono rotado) — ClientReviewsPanel, CorrelationPanel,
   HomeCoachScreen, MesocycleTemplateLibrary… Esta primitiva es solo eso: un
   trigger con icono que rota y un contenido que se muestra u oculta.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** Cabecera siempre visible — texto, badges, lo que sea. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export default function Collapsible({ trigger, children, defaultOpen = false, className = '' }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 py-2 text-left"
      >
        {trigger}
        <Icon
          name="expand_more"
          size="s"
          className={`text-ink-2 flex-shrink-0 transition-transform duration-(--duration-base) ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
