import React from 'react';
import Icon from './Icon';
import { haptics } from '../../services/haptics';

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
     · 44 px de altura mínima en cualquier tamaño. Es el objetivo táctil que
       la auditoría móvil fija, y el que se pierde en cuanto un botón se
       construye a mano con `py-2`.
     · Foco visible.
     · Transición solo de color/transform declarados, nunca la utilidad
       comodín que anima todas las propiedades a la vez.

   Tamaños (Fase 3): el handoff separa botón de texto de botón de icono con
   dos escalas distintas, no una sola reutilizada:
     texto   s 36 (denso, coach)  · m 52 (secundario/terciario) · l 56 (primario)
     icono   s 36                · m 48 (el "botón de icono" del handoff)  · l 56
   Por eso `SOLO_ICONO` no deriva de `TAMANO`: a tamaño `m`, un botón de solo
   icono mide 48 aunque uno con texto mida 52 — son dos objetos distintos del
   handoff, no el mismo botón sin la palabra.

   Fuera de alcance a propósito: el botón no navega, no envía formularios por
   su cuenta ni conoce el dominio. Recibe `onClick` y ya.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 's' | 'm' | 'l';

/**
 * Clases literales. Tailwind v4 lee cadenas del código fuente para generar el
 * CSS: `bg-${color}` no falla el build, no avisa en consola y deja el botón
 * sin fondo. TypeScript elige QUÉ variante; el valor vive en el @theme.
 *
 * Solo `primary` lleva `active:scale-[.97]`: es la única variante a la que el
 * handoff le pide press físico. `secondary` responde con relleno oro al 9%
 * en vez de moverse (`Decisiones-Fase3-Aprobadas.md` § Acciones).
 */
const VARIANTE: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-press active:bg-accent-press border border-transparent '
    + 'active:scale-[.97] transition-[background-color,transform]',
  secondary:
    'bg-transparent text-ink border border-accent-line hover:bg-accent/9 active:bg-accent/9 '
    + 'transition-colors',
  ghost:
    'bg-transparent text-ink-2 hover:text-ink hover:bg-raised border border-transparent transition-colors',
  danger:
    'bg-transparent text-danger hover:bg-danger/10 border border-transparent transition-colors',
};

/** Botón de texto: s denso (coach) · m secundario/terciario · l primario. */
const TAMANO: Record<ButtonSize, string> = {
  s: 'h-9 px-3 gap-2 text-body-s',
  m: 'h-13 px-4 gap-2 text-body-s',
  l: 'h-14 px-5 gap-2 text-title-s',
};

/** El icono acompaña al texto: un escalón por debajo del control. */
const TAMANO_ICONO = { s: 's', m: 's', l: 'm' } as const;

/**
 * Cuadrado perfecto cuando no hay texto. Escala propia (ver cabecera): a
 * tamaño `m` un botón de solo icono mide 48, no 52 — es la medida que el
 * handoff llama "botón de icono", una pieza distinta del botón de texto.
 */
const SOLO_ICONO: Record<ButtonSize, string> = {
  s: 'h-9 w-9 px-0',
  m: 'h-12 w-12 px-0',
  l: 'h-14 w-14 px-0',
};

/** Deshabilitado ignora la variante: un botón apagado se ve igual sea cual
 * sea su color activo — si no, "apagado" competiría visualmente con el resto
 * de estados de cada variante. */
const DESHABILITADO = 'disabled:bg-inset disabled:text-ink-5 disabled:border-transparent disabled:pointer-events-none';

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
  /** Texto en gerundio mientras `loading` está activo: "Guardando" en vez de
   * "Guardar". Si no se da, el botón conserva `children`. */
  loadingLabel?: React.ReactNode;
  /**
   * Éxito momentáneo (handoff: «pasa a "¡Listo!" 1,4 s y vuelve sola»). El
   * padre lo pone en `true` tras una escritura confirmada; el botón se
   * encarga de apagarlo solo — no hace falta que el padre lo vuelva a poner
   * en `false` a mano.
   */
  success?: boolean;
  successLabel?: React.ReactNode;
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
  loadingLabel,
  success = false,
  successLabel = '¡Listo!',
  disabled = false,
  label,
  type = 'button',
  onClick,
  className = '',
  title,
}: Props) {
  const soloIcono = !children;
  const bloqueado = disabled || loading;

  const [mostrandoExito, setMostrandoExito] = React.useState(false);
  React.useEffect(() => {
    if (!success) return;
    setMostrandoExito(true);
    const t = setTimeout(() => setMostrandoExito(false), 1400);
    return () => clearTimeout(t);
  }, [success]);

  const alPulsar = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === 'primary') void haptics.medium();
    onClick?.(e);
  };

  return (
    <button
      type={type}
      onClick={alPulsar}
      disabled={bloqueado}
      title={title}
      aria-label={label}
      aria-busy={loading || undefined}
      className={
        'inline-flex items-center justify-center rounded-field font-sans font-bold '
        + 'select-none duration-(--duration-base) ease-brand '
        + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-bg '
        + `${DESHABILITADO} ${loading ? 'opacity-[.22]' : ''} `
        + `${VARIANTE[variant]} ${TAMANO[size]} `
        + `${soloIcono ? SOLO_ICONO[size] : ''} ${fullWidth ? 'w-full' : ''} ${className}`
      }
    >
      {mostrandoExito ? (
        <>
          <Icon name="check" size={TAMANO_ICONO[size]} />
          {!soloIcono && successLabel}
        </>
      ) : loading ? (
        <>
          <Icon name="progress_activity" size={TAMANO_ICONO[size]} className="animate-spin" />
          {!soloIcono && (loadingLabel ?? children)}
        </>
      ) : (
        <>
          {icon && <Icon name={icon} size={TAMANO_ICONO[size]} />}
          {children}
          {iconTrailing && <Icon name={iconTrailing} size={TAMANO_ICONO[size]} />}
        </>
      )}
    </button>
  );
}
