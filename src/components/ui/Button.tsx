import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   Button

   Lo que unifica. La app tiene botones dorados, botones de superficie, botones
   sin fondo y botones de borrar, cada uno reinventado en la pantalla donde
   hacía falta: mismo papel, distinto relleno, distinta altura y distinto
   estado de foco. Aquí hay cuatro variantes y tres tamaños, y nada más.

   Reglas del DS que la primitiva hace cumplir sin que nadie tenga que
   acordarse:

     · El oro significa una cosa —«lo siguiente que tienes que hacer»— y como
       máximo un botón `primary` por pantalla visible. La primitiva no puede
       contarlos, pero al no dejar el color abierto, elegir oro pasa a ser una
       decisión consciente y no el resultado de copiar la tarjeta de al lado.
     · 44 px de altura mínima en el tamaño por defecto. Es el objetivo táctil
       que la auditoría móvil fija, y el que se pierde en cuanto un botón se
       construye a mano con `py-2`.
     · Foco visible. Hoy no hay un solo `focus-visible` en toda la app: quien
       navega con teclado no ve dónde está. Es deuda de F14, pero una primitiva
       nueva no puede nacer con ella.
     · Transición solo de color. Lo que cambia al pulsar es el color, y animar
       «todo» arrastra geometría que nadie pidió — la utilidad comodín tiene
       372 usos pendientes de retirar en F13, y el inventario los cuenta hasta
       cuando aparecen dentro de un comentario como este.

   Fuera de alcance a propósito: el botón no navega, no envía formularios por
   su cuenta ni conoce el dominio. Recibe `onClick` y ya.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 's' | 'm' | 'l';

/**
 * Clases literales. Tailwind v4 lee cadenas del código fuente para generar el
 * CSS: `bg-${color}` no falla el build, no avisa en consola y deja el botón
 * sin fondo. TypeScript elige QUÉ variante; el valor vive en el @theme.
 */
const VARIANTE: Record<ButtonVariant, string> = {
  primary:   'bg-accent text-on-accent hover:bg-accent-press active:bg-accent-press border border-transparent',
  secondary: 'bg-raised text-ink hover:bg-surface border border-hairline hover:border-strong',
  ghost:     'bg-transparent text-ink-2 hover:text-ink hover:bg-raised border border-transparent',
  danger:    'bg-danger/12 text-danger hover:bg-danger/20 border border-danger/25',
};

/**
 * `m` es el tamaño por defecto y mide 44 px: el mínimo táctil. `s` existe para
 * barras de herramientas y tablas densas del lado entrenador, donde el dedo no
 * es el dispositivo principal; no es el tamaño que debe usar una pantalla de
 * atleta.
 */
const TAMANO: Record<ButtonSize, string> = {
  s: 'h-9 px-3 gap-2 text-body-s',
  m: 'h-11 px-4 gap-2 text-body-s',
  l: 'h-12 px-5 gap-2 text-title-s',
};

/** El icono acompaña al texto: un escalón por debajo del control. */
const TAMANO_ICONO = { s: 's', m: 's', l: 'm' } as const;

/** Cuadrado perfecto cuando no hay texto, para que el objetivo táctil no encoja. */
const SOLO_ICONO: Record<ButtonSize, string> = {
  s: 'w-9 px-0',
  m: 'w-11 px-0',
  l: 'w-12 px-0',
};

type Props = {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Nombre de icono de Material Symbols, antes del texto. */
  icon?: string;
  /** Icono después del texto: para «siguiente», «desplegar», «abrir fuera». */
  iconTrailing?: string;
  /** Ocupa todo el ancho. En móvil es lo normal; en escritorio casi nunca. */
  fullWidth?: boolean;
  /**
   * Muestra un indicador y bloquea la pulsación. El ancho no cambia: el texto
   * sigue ahí y el icono se sustituye, para que el botón no salte ni arrastre
   * el layout de al lado mientras se guarda.
   */
  loading?: boolean;
  disabled?: boolean;
  /**
   * Obligatorio cuando no hay texto: un botón de solo icono sin nombre es un
   * botón mudo para un lector de pantalla — que es exactamente lo que pasa hoy
   * con los 7 de la barra inferior.
   */
  label?: string;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
};

export default function Button({
  children,
  variant = 'secondary',
  size = 'm',
  icon,
  iconTrailing,
  fullWidth = false,
  loading = false,
  disabled = false,
  label,
  type = 'button',
  onClick,
  className = '',
  title,
}: Props) {
  const soloIcono = !children;
  const bloqueado = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={bloqueado}
      title={title}
      aria-label={label}
      aria-busy={loading || undefined}
      className={
        'inline-flex items-center justify-center rounded-control font-sans font-bold '
        + 'transition-colors select-none '
        + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-bg '
        + 'disabled:opacity-40 disabled:pointer-events-none '
        + `${VARIANTE[variant]} ${TAMANO[size]} `
        + `${soloIcono ? SOLO_ICONO[size] : ''} ${fullWidth ? 'w-full' : ''} ${className}`
      }
    >
      {loading
        ? <Icon name="progress_activity" size={TAMANO_ICONO[size]} className="animate-spin" />
        : icon && <Icon name={icon} size={TAMANO_ICONO[size]} />}
      {children}
      {iconTrailing && !loading && <Icon name={iconTrailing} size={TAMANO_ICONO[size]} />}
    </button>
  );
}
