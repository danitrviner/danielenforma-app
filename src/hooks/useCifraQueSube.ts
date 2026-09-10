import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../components/ui/internal/useReducedMotion';

/**
 * Una cifra que sube contando hasta su valor.
 *
 * Va en JavaScript y no en CSS a propósito: `@property` + `counter-reset` es
 * el truco que permite animar un número desde una hoja de estilos, pero no
 * sabe formatear (ni el separador de miles ni el decimal español), así que la
 * cifra saldría «6240» en vez de «6.240». Y el CSS de este repo es explícito
 * en que el motion dirigido por JS decide con `useReducedMotion` (ver la nota
 * de PREFERS-REDUCED-MOTION en index.css), que es justo lo que hace esto.
 *
 * Con «reducir movimiento» activado no cuenta: sale el valor final desde el
 * primer fotograma.
 */
export function useCifraQueSube(objetivo: number, duracionMs = 900): number {
  const reducido = useReducedMotion();
  const [valor, setValor] = useState(reducido ? objetivo : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducido || !Number.isFinite(objetivo)) { setValor(objetivo); return; }
    const desde = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracionMs);
      // Misma curva de salida que `--ease-brand`: arranca rápido y frena.
      const suave = 1 - Math.pow(1 - t, 3);
      setValor(desde + (objetivo - desde) * suave);
      if (t < 1) rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [objetivo, duracionMs, reducido]);

  return valor;
}
