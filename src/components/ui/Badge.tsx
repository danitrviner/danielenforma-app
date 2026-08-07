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
   14 %, borde al 25 %— y no de una elección por tarjeta.

   Fase 3 reabre el tono `accent`, cerrado a propósito en F7: el handoff
   pinta la insignia "EN PAUSA" del CRM en oro (verde ACTIVO, oro EN PAUSA,
   rojo IMPAGO, gris ARCHIVADO — `Decisiones-Fase3-Aprobadas.md` § Filtros y
   estado), y esa es una decisión de diseño ya aprobada, no una excepción que
   esta primitiva deba impedir. La regla de fondo sigue viva —el oro no es
   decorativo— solo que "requiere que decidas algo" (una suscripción en
   pausa) cuenta como esa acción pendiente tanto como un botón.

   Tipografía: el rebrand de julio pasó los badges de mono a sans; el handoff
   los quiere de vuelta en mono versalitas ("insignias mono 11 px") — Fase 3
   es la decisión más reciente y prevalece.
   ═══════════════════════════════════════════════════════════════════════════ */

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'data';

/** Clases literales, una por tono. Tailwind no compone cadenas. */
const TONO: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-2 border-hairline',
  accent:  'bg-accent/14 text-accent border-accent-line',
  success: 'bg-success/14 text-success border-success/25',
  warning: 'bg-warning/14 text-warning border-warning/25',
  danger:  'bg-danger/14 text-danger border-danger/25',
  info:    'bg-info/14 text-info border-info/25',
  data:    'bg-data/14 text-data border-data/25',
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
  /**
   * El repo no tiene `@types/react` instalado, así que TypeScript no sabe
   * excluir `key` de las props de un componente propio por su cuenta — el
   * mismo workaround ya vive en `CardProps` de `RecipesScreen.tsx`.
   */
  key?: React.Key;
};

export default function Badge({ children, tone = 'neutral', icon, dot, className = '' }: Props) {
  return (
    <span
      className={
        'inline-flex items-center gap-2 rounded-full border px-2 py-1 '
        + `font-mono text-caption font-semibold uppercase tracking-[.11em] ${TONO[tone]} ${className}`
      }
    >
      {dot && <span className="h-2 w-2 rounded-full bg-current" aria-hidden />}
      {icon && !dot && <Icon name={icon} size="s" />}
      {children}
    </span>
  );
}
