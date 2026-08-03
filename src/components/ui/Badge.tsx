import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   Badge

   La etiqueta de estado: «Revisado», «Pendiente», «Al día», «Atrasado». Es
   información, no acción — no se pulsa. Lo que se pulsa es `Chip`.

   Por qué existe. La app tiene decenas repartidas por `ClientsScreen`,
   `ReviewsScreen`, `ClientHub` y el CRM, cada una con su propio par de clases
   de color y su propio radio. El rebranding ya tuvo que pasarlas todas de
   monoespaciada a `font-sans` una por una, y el CRM se construyó su propio
   `StatusPill` porque no había dónde reutilizarlas.

   El color sale de la fórmula del DS para estado —texto al 100 %, fondo al
   10 %, borde al 25 %— y no de una elección por tarjeta. El tono `accent` está
   a propósito fuera: el oro es «lo siguiente que tienes que hacer», y un estado
   no es una acción. Marcar «Pendiente» en oro es lo que hace que el oro deje de
   significar algo.
   ═══════════════════════════════════════════════════════════════════════════ */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'data';

/** Clases literales, una por tono. Tailwind no compone cadenas. */
const TONO: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-2 border-hairline',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger:  'bg-danger/10 text-danger border-danger/25',
  info:    'bg-info/10 text-info border-info/25',
  data:    'bg-data/10 text-data border-data/25',
};

type Props = {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Icono a la izquierda: un check en «Completado», un reloj en «Pendiente». */
  icon?: string;
  /**
   * Punto de color en vez de icono. Para listas largas donde ocho iconos
   * distintos son ruido y lo único que importa es distinguir el estado.
   */
  dot?: boolean;
  className?: string;
};

export default function Badge({ children, tone = 'neutral', icon, dot, className = '' }: Props) {
  return (
    <span
      className={
        'inline-flex items-center gap-2 rounded-full border px-2 py-1 '
        + `font-sans text-caption font-bold uppercase tracking-widest ${TONO[tone]} ${className}`
      }
    >
      {dot && <span className="h-2 w-2 rounded-full bg-current" aria-hidden />}
      {icon && !dot && <Icon name={icon} size="s" />}
      {children}
    </span>
  );
}
