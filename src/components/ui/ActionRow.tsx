import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   ActionRow

   La fila de "esto necesita algo de ti": un check-in por revisar, un pago
   vencido, un plan sin publicar. Nace en Home Coach (F3.13a) pero el propio
   handoff de Fase 3 pide reutilizarla en CRM en vez de inventar un tratamiento
   nuevo ahí — de ahí que viva en `ui/` y no junto a `HomeCoachScreen`.

   Distinta de `ListRow` en dos cosas que si no se saldría del molde: el
   avatar es siempre un círculo de iniciales (nunca un icono suelto), y el
   texto secundario va en mono (`meta`), no en `font-sans` — es un dato
   (fecha, importe, estado), no una descripción.

   `urgent` decide el tono del avatar (oro vs gris) y si el punto pulsante
   aparece; no hay un tercer estado propio aquí — quien renderiza la lista
   decide cuántas filas urgentes muestra.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  initials: string;
  title: string;
  meta: string;
  urgent?: boolean;
  onClick?: () => void;
  className?: string;
  key?: React.Key;
};

export default function ActionRow({ initials, title, meta, urgent = true, onClick, className = '' }: Props) {
  const cuerpo = (
    <>
      <span className="relative flex-none">
        <span
          className={
            'flex h-9 w-9 items-center justify-center rounded-full font-sans text-body-s font-bold '
            + (urgent ? 'bg-accent/16 text-accent' : 'bg-white/6 text-ink-4')
          }
        >
          {initials}
        </span>
        {urgent && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent animate-pulse" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block truncate font-sans text-body-s font-bold ${urgent ? 'text-ink' : 'text-ink-2'}`}>{title}</span>
        <span className="mt-0.5 block truncate font-mono text-caption text-ink-3">{meta}</span>
      </span>
      {urgent && <Icon name="chevron_right" size="m" className="shrink-0 text-ink-4" />}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--duration-state) hover:bg-raised ${className}`}
      >
        {cuerpo}
      </button>
    );
  }
  return <div className={`flex items-center gap-3 px-4 py-3 ${className}`}>{cuerpo}</div>;
}
