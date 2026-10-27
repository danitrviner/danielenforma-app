import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   useRecienHecho — «acaba de pasar a hecho», durante unos milisegundos.

   Para el sello de una serie, el latido del día cerrado, el destello de una
   fila: animaciones que celebran UNA transición (de no hecho a hecho) y no un
   estado. Si el componente monta ya con `hecho = true` (vuelves a la pantalla
   con el día cerrado de ayer) no hay nada que celebrar y devuelve `false`.
   Devuelve `true` solo en los `ms` siguientes al cambio a `true`.
   ═══════════════════════════════════════════════════════════════════════════ */
export function useRecienHecho(hecho: boolean, ms = 700): boolean {
  const anterior = React.useRef(hecho);
  const [reciente, setReciente] = React.useState(false);

  React.useEffect(() => {
    const pasaAHecho = hecho && !anterior.current;
    anterior.current = hecho;
    if (!pasaAHecho) return;
    setReciente(true);
    const t = setTimeout(() => setReciente(false), ms);
    return () => clearTimeout(t);
  }, [hecho, ms]);

  return reciente;
}
