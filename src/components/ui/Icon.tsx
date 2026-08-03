import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Icon — Material Symbols Outlined
   Primera primitiva de `ui/`, y la primera por una razón: todas las demás la
   consumen.

   Qué corrige. La app dibuja 590 iconos como `<span className="material-
   symbols-outlined text-body-s">`, es decir dimensionados con la escala
   TIPOGRÁFICA. Eso ata el tamaño del icono al escalón del texto que tiene al
   lado y no a su peso óptico, y la escala de icono pasa a ser un grupo de
   tokens aparte (`--text-icon-*` en index.css).

   Y hay algo peor, medido en el navegador al construir esta primitiva: esos
   tokens de texto sobre un icono NO HACEN NADA. La clase de Google trae
   `font-size: 24px` y llega sin capa; las utilidades de Tailwind v4 viven en
   `@layer utilities`, y sin capa gana. Los 590 iconos de la app se renderizan
   hoy a 24 px, `text-caption` o `text-display` incluidos. Por eso la primitiva
   no usa la clase de Google sino `.ui-icon`, que es la misma base sin el
   tamaño dentro (ver el bloque en index.css).

   Tres cosas que esta primitiva deja de dejar al criterio de cada pantalla:

     · El tamaño sale de una escala de 4 pasos, no de la tipográfica.
     · El eje FILL se pide con un booleano, no con un `fontVariationSettings`
       escrito a mano en cada uso (hoy hay 48 repartidos).
     · El icono es invisible para un lector de pantalla salvo que se le dé un
       nombre. Sin esto, el lector lee la ligadura: «fitness underscore
       center». Es el motivo de que los 7 botones de la barra inferior
       aparezcan sin nombre en el árbol de accesibilidad.

   No se adopta en ninguna pantalla en F7: eso es F8. La tabla de equivalencia
   que esa fase tendrá que aplicar es esta —los tamaños de hoy, agrupados por
   el texto al que acompañan:

     text-caption · text-label · text-body-s   11-13 px  →  s    16
     text-title-s                                 16 px  →  m    20
     text-title-m · text-title-l               19-24 px  →  l    24
     text-display                                 32 px  →  xl   32
   ═══════════════════════════════════════════════════════════════════════════ */

export type IconSize = 's' | 'm' | 'l' | 'xl';

/**
 * Clases literales, nunca compuestas. Tailwind v4 genera el CSS leyendo
 * cadenas literales del código: `text-icon-${size}` no falla el build, no
 * avisa en consola y deja el icono con el tamaño heredado. TypeScript elige
 * QUÉ token; el valor vive en el bloque @theme.
 */
const TAMANO: Record<IconSize, string> = {
  s:  'text-icon-s',
  m:  'text-icon-m',
  l:  'text-icon-l',
  xl: 'text-icon-xl',
};

/**
 * El eje FILL de Material Symbols. Va en estilo en línea y no en una clase
 * porque `font-variation-settings` no tiene utilidad en Tailwind, y declararla
 * como token de tema no la generaría: no es una propiedad que Tailwind sepa
 * emitir. Son dos constantes congeladas, no una plantilla.
 */
const RELLENO = { si: "'FILL' 1", no: "'FILL' 0" } as const;

type Props = Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** Nombre de la ligadura de Material Symbols, p. ej. `fitness_center`. */
  name: string;
  size?: IconSize;
  /** Eje FILL. El icono relleno señala estado activo, no jerarquía. */
  filled?: boolean;
  /**
   * Nombre accesible. Darlo convierte el icono en imagen con nombre; omitirlo
   * lo deja como decoración, que es lo correcto cuando al lado hay un texto
   * que ya dice lo mismo. Un icono SIN texto visible al lado necesita `label`
   * casi siempre.
   */
  label?: string;
};

export default function Icon({
  name,
  size = 'm',
  filled = false,
  label,
  className = '',
  style,
  ...resto
}: Props) {
  return (
    <span
      {...resto}
      className={`ui-icon leading-none select-none ${TAMANO[size]} ${className}`}
      style={{ fontVariationSettings: filled ? RELLENO.si : RELLENO.no, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {name}
    </span>
  );
}
