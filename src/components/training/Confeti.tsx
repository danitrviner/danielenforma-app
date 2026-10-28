import { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Confeti corto para un logro en plena sesión (28-10-2026)

   Dani lo pidió así: que se note, pero que no sea tosco ni incómodo. Por eso
   son pocas piezas, salen desde arriba de la tarjeta, caen poco más de un
   segundo y desaparecen solas; no tapan nada ni hay que cerrarlas. Con
   `prefers-reduced-motion` no se pinta (el sello de la tarjeta ya lo dice).
   Web Animations API y no @keyframes: cada pieza lleva su propia trayectoria.
   ═══════════════════════════════════════════════════════════════════════════ */

const COLORES = ['var(--color-accent)', 'var(--color-success)', 'var(--color-data)', 'var(--color-ink)'];
const PIEZAS = 26;

export default function Confeti() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caja = ref.current;
    if (!caja || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const animaciones: Animation[] = [];
    for (let i = 0; i < PIEZAS; i++) {
      const pieza = document.createElement('span');
      const ancho = 4 + Math.random() * 4;
      Object.assign(pieza.style, {
        position: 'absolute',
        top: '0',
        left: `${10 + Math.random() * 80}%`,
        width: `${ancho}px`,
        height: `${ancho * (Math.random() < 0.5 ? 1 : 2.2)}px`,
        borderRadius: Math.random() < 0.35 ? '999px' : '1px',
        background: COLORES[i % COLORES.length],
        opacity: '0',
      });
      caja.appendChild(pieza);
      const dx = (Math.random() - 0.5) * 140;
      const alto = 140 + Math.random() * 120;
      const giro = (Math.random() - 0.5) * 720;
      animaciones.push(pieza.animate(
        [
          { transform: 'translate(0, -8px) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${alto * 0.55}px) rotate(${giro * 0.6}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${dx}px, ${alto}px) rotate(${giro}deg)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 600, delay: Math.random() * 180, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
      ));
    }
    return () => {
      animaciones.forEach(a => a.cancel());
      caja.replaceChildren();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden" />;
}
