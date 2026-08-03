import React, { useEffect, useRef } from 'react';

interface Props {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// Modal base del CRM. Copia el patrón visual ya usado en ExerciseLibraryScreen
// y ClientWorkoutsPanel (`fixed inset-0 bg-black/70 backdrop-blur-sm`) y le
// añade lo que a aquellos les falta: cierre con Escape, foco inicial dentro del
// diálogo y bloqueo del scroll de fondo.
export default function Modal({ titulo, onCerrar, children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', onKey);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full sm:max-w-[480px] max-h-[90vh] flex flex-col bg-surface border border-white/12 rounded-t-2xl sm:rounded-2xl overflow-hidden"
      >
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/7 shrink-0">
          <h2 className="font-sans font-black text-sm text-ink">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#a8a89e] hover:bg-white/6 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/7 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ── Piezas de formulario compartidas ─────────────────────────────────────────

export function Campo({ label, children, hint, error }: {
  label: string; children: React.ReactNode; hint?: string; error?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#a8a89e]">{label}</span>
      {children}
      {error
        ? <span className="block font-sans text-[10px] text-danger">{error}</span>
        : hint ? <span className="block font-sans text-[10px] text-[#555550]">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full px-2.5 py-1.5 rounded-lg bg-field border border-white/7 text-[11px] text-ink placeholder:text-[#555550] focus:outline-none focus:border-accent/40';

export function BotonPrimario({ children, disabled, onClick, type = 'button' }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg bg-accent text-black font-sans font-bold text-[11px] hover:bg-accent-press disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

export function BotonSecundario({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg bg-white/6 text-ink font-sans font-bold text-[11px] hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}
