import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Card

   La superficie por defecto de la app. Lo que fija, porque es lo que estaba
   suelto:

     · **Sin sombra.** F6 retiró 67 sombras: sobre un fondo casi negro la
       elevación no se percibe proyectando sombra sino CAMBIANDO DE SUPERFICIE,
       y el borde `hairline` ya define el contorno. Aquí no hay prop de
       elevación — una tarjeta no flota. Lo que flota es la barra de navegación
       (`e1`) y los overlays (`e2`), y ninguno de los dos es una tarjeta.
     · **Radio 16, y los hijos 10.** La regla de anidamiento del DS: un hijo
       baja un escalón respecto a su padre. Un botón dentro de una tarjeta es
       `control`; si iguala el radio del padre, las esquinas se ven
       descuadradas.
     · **Cabecera con sitio para una acción.** El patrón «título a la izquierda,
       botón o dato a la derecha» está repetido por toda la app con márgenes
       distintos cada vez.

   `interactive` convierte la tarjeta en un botón de verdad —`<button>`, no un
   `<div>` con `onClick`— para que la enfoque el tabulador y la anuncie el
   lector de pantalla. Una tarjeta que se pulsa y no es un botón es invisible
   para quien no usa el ratón.
   ═══════════════════════════════════════════════════════════════════════════ */

export type CardVariant = 'surface' | 'raised';
export type CardPadding = 'none' | 's' | 'm';

/** Clases literales: Tailwind lee cadenas del código, no las compone. */
const VARIANTE: Record<CardVariant, string> = {
  surface: 'bg-surface border-hairline',
  raised:  'bg-raised border-hairline',
};

/** Fase 3: el handoff acota el padding a 16-18 px. 18 no cae en la escala de
 * 4 px del DS (0/4/8/12/16/20/24/32/40/56) y forzarlo como valor arbitrario
 * reabriría exactamente la deuda que F6 cerró; `m` se queda en el escalón
 * de la escala más cercano por arriba, 20, dentro del margen que la propia
 * migración ya acepta ("a 375 px la diferencia no se percibe"). */
const RELLENO: Record<CardPadding, string> = {
  none: '',
  s:    'p-4',
  m:    'p-5',
};

type Props = {
  children?: React.ReactNode;
  /** Título de la tarjeta. Sale como `h3`, que es el nivel que usa la app. */
  title?: string;
  subtitle?: string;
  /** Zona derecha de la cabecera: un botón, un dato, una insignia. */
  action?: React.ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  /** Al pulsarla navega o abre algo. Renderiza un `<button>`, no un `<div>`. */
  onClick?: () => void;
  /** Nombre accesible cuando la tarjeta se pulsa y su título no basta. */
  label?: string;
  className?: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Badge). */
  key?: React.Key;
};

export default function Card({
  children,
  title,
  subtitle,
  action,
  variant = 'surface',
  padding = 'm',
  onClick,
  label,
  className = '',
}: Props) {
  const cabecera = (title || action) && (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {title && <h3 className="font-sans text-title-s font-bold text-ink">{title}</h3>}
        {subtitle && <p className="font-sans text-body-s text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );

  const base = `rounded-surface border ${VARIANTE[variant]} ${RELLENO[padding]}`;
  const contenido = (
    <>
      {cabecera}
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={
          `${base} flex w-full flex-col gap-3 text-left transition-colors hover:border-strong `
          + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
          + `focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${className}`
        }
      >
        {contenido}
      </button>
    );
  }

  return <div className={`${base} flex flex-col gap-3 ${className}`}>{contenido}</div>;
}
