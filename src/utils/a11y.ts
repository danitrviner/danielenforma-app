import type { KeyboardEvent } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Accesibilidad — piezas compartidas

   Toda la app está llena de superficies que se pulsan pero no son `<button>`:
   filas que se despliegan, tarjetas de receta, la barra del reproductor de
   cardio, cabeceras plegables. No se pueden convertir en `<button>` sin más
   (varias llevan dentro otro control, y un botón dentro de un botón es HTML
   inválido), así que llevan el trío `role="button"` + `tabIndex` +
   `onKeyDown`, que es el patrón que ya usaba `CeldaDia` del calendario del
   coach antes de que existiera este fichero.

   Repetir ese `onKeyDown` a mano en veintitantos sitios es justo como se
   desincronizan las cosas: uno se queda solo con Enter, otro se olvida del
   `preventDefault` y la barra espaciadora hace scroll de la página debajo del
   overlay. De ahí este ayudante.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `onKeyDown` que activa un elemento no nativo con Enter o barra espaciadora,
 * igual que haría un `<button>` de verdad.
 *
 * El `preventDefault` de la barra es imprescindible: sin él, el navegador
 * hace scroll de la página además de activar el elemento.
 *
 * Ignora las pulsaciones que vengan de un control anidado (un `<input>`, un
 * `<select>`, un botón real dentro de la fila): ahí el espacio y el Enter
 * significan otra cosa —escribir un espacio, abrir el desplegable— y robarlos
 * dejaría el campo inservible.
 */
export function alPulsarTecla(accion: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const origen = e.target as HTMLElement | null;
    if (origen && origen !== e.currentTarget && origen.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    e.preventDefault();
    accion();
  };
}

/**
 * Los tres atributos de golpe, para que a ninguna superficie se le olvide uno.
 * Se esparce en el JSX: `<div {...pulsable(abrir)} className="…">`.
 */
export function pulsable(accion: () => void, etiqueta?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: accion,
    onKeyDown: alPulsarTecla(accion),
    ...(etiqueta ? { 'aria-label': etiqueta } : {}),
  };
}
