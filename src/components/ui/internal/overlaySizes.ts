/* ═══════════════════════════════════════════════════════════════════════════
   Escala de anchos compartida por Sheet y Dialog.

   Vive aquí, y no dentro de una de las dos primitivas, porque el ancho es la
   misma decisión en ambas: un formulario corto mide lo mismo suba desde abajo
   o aparezca centrado. Tenerla duplicada llevaba directo a que las dos escalas
   se separasen con el tiempo.

   Los cuatro escalones salen de medir los overlays reales de la app antes de
   migrarlos en F9, no de una escala inventada: `sm` 11 usos, `md` 9, `lg` 9 y
   `2xl` 5 — este último es el de los overlays que muestran prosa larga o dos
   columnas, y sin él adoptarlos sería una regresión de legibilidad.

   Clases literales: Tailwind v4 lee cadenas del código, no las compone.
   ═══════════════════════════════════════════════════════════════════════════ */

export type OverlaySize = 's' | 'm' | 'l' | 'xl';

export const ANCHO_OVERLAY: Record<OverlaySize, string> = {
  s: 'max-w-sm',
  m: 'max-w-md',
  l: 'max-w-lg',
  xl: 'max-w-2xl',
};
