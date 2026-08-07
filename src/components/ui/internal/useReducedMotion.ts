import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   El bloque `@media (prefers-reduced-motion: reduce)` de index.css ya anula
   duración de CSS transitions/animations en toda la app — cubre el motion
   declarativo (entradas escalonadas, barras, toasts). Lo que ese bloque NO
   puede tocar es el motion dirigido por JavaScript: el foco recortado del
   tutorial calculando su propio recorrido de scroll, el anillo de progreso
   animando `stroke-dashoffset` con un `requestAnimationFrame`, una cuenta
   atrás que interpola. Ese código necesita saber en tiempo de ejecución si
   debe saltar directo al estado final en vez de interpolar.
   ═══════════════════════════════════════════════════════════════════════════ */

const CONSULTA = '(prefers-reduced-motion: reduce)';

function leerPreferencia(): boolean {
  return typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia(CONSULTA).matches
    : false;
}

export function useReducedMotion(): boolean {
  const [reducido, setReducido] = React.useState(leerPreferencia);

  React.useEffect(() => {
    const media = window.matchMedia(CONSULTA);
    const alCambiar = () => setReducido(media.matches);
    media.addEventListener('change', alCambiar);
    return () => media.removeEventListener('change', alCambiar);
  }, []);

  return reducido;
}
