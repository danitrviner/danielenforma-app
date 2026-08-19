import React from 'react';
import Icon from './Icon';
import Button from './Button';

/* ═══════════════════════════════════════════════════════════════════════════
   Banner (Fase 3, nueva)

   El aviso de línea completa: "Dani está montando tu dieta", "Sin conexión,
   seguimos guardando en el móvil", "No se pudo enviar la rutina". El handoff
   fija la fórmula exacta —radio 18 (`surface`), color al 7 % de fondo y al
   22-24 % de borde— y solo dos tonos: oro para informativo, rojo para error.
   No hay un tercero: un aviso "de éxito" es un `Toast`, no un `Banner` fijo
   en la pantalla.
   ═══════════════════════════════════════════════════════════════════════════ */

export type BannerTone = 'info' | 'danger';

const TONO: Record<BannerTone, { icono: string; clases: string }> = {
  info:   { icono: 'info',    clases: 'bg-accent/7 border-accent/22 text-ink' },
  danger: { icono: 'error',   clases: 'bg-danger/7 border-danger/24 text-ink' },
};

type Props = {
  tone?: BannerTone;
  children: React.ReactNode;
  /** Texto del botón de acción, en contorno — típicamente "Reintentar". */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export default function Banner({ tone = 'info', children, actionLabel, onAction, className = '' }: Props) {
  const t = TONO[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-surface border p-4 ${t.clases} ${className}`}
    >
      <Icon name={t.icono} size="m" className={tone === 'danger' ? 'text-danger' : 'text-accent'} />
      <p className="min-w-0 flex-1 font-sans text-body-s text-ink-2">{children}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="s" onClick={onAction} className="shrink-0">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
