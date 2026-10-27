import React from 'react';
import { useReducedMotion } from '../components/ui/internal/useReducedMotion';

/* ═══════════════════════════════════════════════════════════════════════════
   useCuentaAlMontar — una cifra protagonista «cuenta» hasta su valor.

   Para las kcal que quedan, el peso de hoy, la racha, las sesiones del bloque:
   cifras ESTÁTICAS que el usuario mira al llegar a la pantalla. Al montar,
   sube de 0 al valor en `--duration-ring` (1.100 ms, el mismo tiempo que
   tarda el anillo en dibujarse a su lado) con una curva de salida suave; si
   después el valor cambia (añades una comida), va del valor anterior al
   nuevo en `--duration-bar` (450 ms), sin volver a cero.

   NUNCA para lo que se lee mientras cambia —cronómetro, reps, FC en vivo—:
   ahí el número tiene que ser el número. Con `prefers-reduced-motion` devuelve
   el valor final directamente. El redondeo lo decide quien pinta (`fmt`).
   ═══════════════════════════════════════════════════════════════════════════ */

const MONTAR_MS = 1100;
const CAMBIO_MS = 450;
const salidaSuave = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCuentaAlMontar(valor: number): number {
  const sinMovimiento = useReducedMotion();
  const [mostrado, setMostrado] = React.useState(() => (sinMovimiento ? valor : 0));
  const desde = React.useRef(sinMovimiento ? valor : 0);
  const primera = React.useRef(true);
  const raf = React.useRef(0);

  React.useEffect(() => {
    if (sinMovimiento || !Number.isFinite(valor)) { setMostrado(valor); desde.current = valor; return; }
    const inicio = desde.current;
    const duracion = primera.current ? MONTAR_MS : CAMBIO_MS;
    primera.current = false;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const paso = (ahora: number) => {
      const p = Math.min(1, (ahora - t0) / duracion);
      const v = inicio + (valor - inicio) * salidaSuave(p);
      setMostrado(v);
      desde.current = v;
      if (p < 1) raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf.current);
  }, [valor, sinMovimiento]);

  return mostrado;
}
