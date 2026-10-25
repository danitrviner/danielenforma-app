import React from 'react';

/** `true` mientras la ventana mide al menos `px` de ancho (y se actualiza al
 *  cambiar). Sin `matchMedia` (tests, SSR) devuelve `false`: se pinta lo de móvil. */
export function useAnchoMinimo(px: number): boolean {
  const consulta = `(min-width: ${px}px)`;
  const [cumple, setCumple] = React.useState(() => typeof matchMedia === 'function' && matchMedia(consulta).matches);
  React.useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(consulta);
    const alCambiar = () => setCumple(mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);
  return cumple;
}
