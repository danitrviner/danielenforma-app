import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

const MASK_FADE_PX = 24;

/**
 * Máscara de opacidad en los bordes cuando hay contenido oculto por scroll
 * horizontal — `mask-image` en vez de `box-shadow`, para no ensuciar el
 * inventario de sombras y no depender del color de fondo del contenedor
 * (varía según quién use la primitiva).
 */
function buildEdgeMask(left: boolean, right: boolean): string | undefined {
  if (!left && !right) return undefined;
  const stops = [
    left ? 'transparent 0' : 'black 0',
    ...(left ? [`black ${MASK_FADE_PX}px`] : []),
    right ? `black calc(100% - ${MASK_FADE_PX}px)` : 'black 100%',
    ...(right ? ['transparent 100%'] : []),
  ];
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Detecta overflow horizontal REAL de un contenedor con scroll (no si
 * "podría" desbordar por CSS, sino si ahora mismo hay contenido oculto a la
 * izquierda/derecha) y devuelve el `mask-image` a aplicarle. Compartido entre
 * `DataTable` (CRM) y `Tabs` — P1-4 y P1-5 de la auditoría visual son el
 * mismo síntoma («se puede deslizar y nada lo avisa») en dos primitivas
 * distintas.
 *
 * `deps` son las dependencias que cambian el CONTENIDO del scroll (filas,
 * columnas, items) — el `ResizeObserver` ya cubre cambios de TAMAÑO del
 * elemento y de su primer hijo, pero no un cambio de contenido que no mueva
 * ningún tamaño (p.ej. sustituir items por otros de igual ancho total).
 */
export function useScrollEdgeMask<T extends HTMLElement>(deps: DependencyList = []) {
  const ref = useRef<T>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setOverflow({
      left: scrollLeft > 1,
      right: scrollWidth - clientWidth - scrollLeft > 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recompute, ...deps]);

  return { ref, maskImage: buildEdgeMask(overflow.left, overflow.right) };
}
