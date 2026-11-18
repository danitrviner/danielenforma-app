import { useLayoutEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   El tamaño de letra con el que un título cabe en UNA línea (18-11-2026)

   Dani: «que el título del ejercicio se ajuste al espacio: si es muy largo que
   ocupe más, pero si es corto, como elevaciones laterales, que sea más
   pequeño». Antes el tamaño iba por escalones de número de letras, y un nombre
   corto salía al máximo (24 px) y se partía en dos líneas igualmente.

   Ahora se mide: el texto se pinta a 100 px en un hueco invisible, y como el
   ancho crece en proporción al tamaño (el interletrado va en em), se sabe a
   qué tamaño llena justo el ancho disponible. Si ese tamaño queda entre el
   mínimo y el máximo, va en una línea. Si ni al mínimo cabe, se deja partir en
   varias líneas a `largo`, y entonces sí ocupa más.

   `ref` va en el contenedor que marca el ancho; `medida` en el texto (con sus
   mismas clases de fuente). Se recalcula al cambiar el ancho y al cargar las
   fuentes.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Escala {
  /** Tamaño máximo, px. */
  max: number;
  /** Por debajo de este, mejor partir en líneas que encoger más. */
  min: number;
  /** Tamaño cuando no cabe en una línea ni al mínimo. */
  largo: number;
}

/** Puro: el tamaño que toca para un texto que mide `anchoA100` px a 100 px de
 *  letra, en un hueco de `disponible` px. `unaLinea` dice si cabe en una. */
export function tamanoQueCabe(anchoA100: number, disponible: number, { max, min, largo }: Escala): { px: number; unaLinea: boolean } {
  if (!(anchoA100 > 0) || !(disponible > 0)) return { px: max, unaLinea: false };
  // 1 px de holgura: el redondeo del navegador no debe partir la línea.
  const cabe = Math.floor(((disponible - 1) / anchoA100) * 100 * 2) / 2;
  if (cabe >= min) return { px: Math.min(max, cabe), unaLinea: true };
  return { px: largo, unaLinea: false };
}

export function useTamanoQueCabe<C extends HTMLElement, T extends HTMLElement>(texto: string, escala: Escala) {
  const ref = useRef<C>(null);
  const medida = useRef<T>(null);
  const [resultado, setResultado] = useState<{ px: number; unaLinea: boolean } | null>(null);
  const { max, min, largo } = escala;

  useLayoutEffect(() => {
    const cont = ref.current;
    const txt = medida.current;
    if (!cont || !txt) return;
    const sonda = document.createElement('span');
    const calcular = () => {
      const estilo = getComputedStyle(txt);
      sonda.textContent = texto;
      Object.assign(sonda.style, {
        position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', left: '-9999px', top: '0',
        fontFamily: estilo.fontFamily, fontWeight: estilo.fontWeight, textTransform: estilo.textTransform,
        letterSpacing: estilo.letterSpacing.endsWith('em') ? estilo.letterSpacing : `${parseFloat(estilo.letterSpacing) / parseFloat(estilo.fontSize) || 0}em`,
        fontSize: '100px',
      });
      if (!sonda.isConnected) document.body.appendChild(sonda);
      const r = tamanoQueCabe(sonda.getBoundingClientRect().width, cont.clientWidth, { max, min, largo });
      setResultado(prev => (prev && prev.px === r.px && prev.unaLinea === r.unaLinea ? prev : r));
    };
    calcular();
    const obs = new ResizeObserver(calcular);
    obs.observe(cont);
    let vivo = true;
    document.fonts?.ready.then(() => { if (vivo) calcular(); });
    return () => { vivo = false; obs.disconnect(); sonda.remove(); };
  }, [texto, max, min, largo]);

  return { ref, medida, resultado };
}
