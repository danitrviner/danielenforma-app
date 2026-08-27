import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   ListRow

   La fila de una lista: un cliente en `ClientsScreen`, un ejercicio en la
   biblioteca, una receta en el picker de Nutrición. El patrón «avatar o
   icono a la izquierda, título y subtítulo en el medio, algo a la derecha» se
   repite en más de una docena de pantallas, cada una con su propio hueco entre
   elementos y su propio criterio para truncar el subtítulo.

   Objetivo táctil: la fila entera mide como mínimo 44 px de alto —el `py-3`
   de abajo, sumado a la altura de una línea de texto, ya lo garantiza— y es
   TODA la superficie pulsable cuando lleva `onClick`, no solo el texto.

   Se apoya en el mismo patrón que `Card`: `<button>` de verdad cuando es
   interactiva, `<li>` cuando no. `ListRow` no envuelve en `<ul>`/`<li>` por su
   cuenta —quien la usa decide si está dentro de una lista semántica o de un
   `div` suelto— pero si el padre es una lista, el elemento correcto es `<li>`
   y no un `<div>` más.
   ═══════════════════════════════════════════════════════════════════════════ */

type Props = {
  /** Título de la fila. Una línea; el truncado lo decide el contenedor padre. */
  title: string;
  subtitle?: string;
  /** Avatar, icono o thumbnail a la izquierda. Sin esto la fila no lleva hueco a la izquierda. */
  leading?: React.ReactNode;
  /** Badge, icono, cifra o botón a la derecha. */
  trailing?: React.ReactNode;
  /** Muestra la flecha de "entrar" a la derecha. Se ignora si hay `trailing`. */
  chevron?: boolean;
  onClick?: () => void;
  /** Convierte la fila en un enlace de verdad (`<a>`). Excluyente con `onClick`.
   *  Existe para los enlaces a páginas fuera de la SPA —las legales— donde
   *  `window.open()` no vale: los navegadores bloquean la ventana abierta por
   *  código y el usuario se queda sin ver nada, mientras que un `<a
   *  target="_blank">` pulsado a mano siempre se abre. */
  href?: string;
  target?: string;
  disabled?: boolean;
  /** Nombre accesible cuando el título no basta por sí solo. */
  label?: string;
  as?: 'div' | 'li';
  className?: string;
  /** Sin `@types/react` en el repo, TS no excluye `key` por su cuenta (ver Badge). */
  key?: React.Key;
};

export default function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron = false,
  onClick,
  href,
  target,
  disabled = false,
  label,
  as = 'div',
  className = '',
}: Props) {
  const Envoltorio = as;
  const cuerpo = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-sans text-title-s text-ink">{title}</span>
        {subtitle && <span className="truncate font-sans text-body-s text-ink-2">{subtitle}</span>}
      </div>
      {trailing ?? (chevron && <Icon name="chevron_right" size="m" className="text-ink-4" />)}
    </>
  );

  const claseInteractiva =
    'flex w-full min-h-[52px] items-center gap-3 rounded-control px-3 py-3 text-left transition-colors duration-(--duration-state) '
    + 'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
    + 'disabled:opacity-40 disabled:pointer-events-none';

  if (href) {
    return (
      <Envoltorio className={className}>
        <a
          href={href}
          target={target}
          rel={target === '_blank' ? 'noopener noreferrer' : undefined}
          aria-label={label}
          className={claseInteractiva}
        >
          {cuerpo}
        </a>
      </Envoltorio>
    );
  }

  if (onClick) {
    return (
      <Envoltorio className={className}>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={claseInteractiva}
        >
          {cuerpo}
        </button>
      </Envoltorio>
    );
  }

  return (
    <Envoltorio className={`flex min-h-[52px] items-center gap-3 px-3 py-3 ${className}`}>
      {cuerpo}
    </Envoltorio>
  );
}
