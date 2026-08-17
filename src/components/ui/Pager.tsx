import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from './internal/useReducedMotion';

/* ═══════════════════════════════════════════════════════════════════════════
   Pager — carrusel de páginas con puntos, sin ninguna dependencia nueva (F3
   del plan de réplica FITIV). El proyecto no tenía nada de paginación: sin
   swiper/embla/framer-motion, sin un solo `snap-x` en todo `src`. No hacía
   falta — Tailwind v4 trae `snap-x`/`snap-mandatory` en el core.

   Nace aquí, en `ui/`, no en `cardio/`: el inventario del Design System
   excluye `ui/` a propósito ("son el destino, no la deuda"); crearlo dentro
   de `cardio/` habría subido la métrica de overlays artesanales.

   Mecánica: `overflow-x-auto` + `scroll-snap-type: x mandatory`, y el índice
   de página activa se DERIVA de `scrollLeft` en el `onScroll` — nunca de
   `scrollend`, que en el WKWebView de iOS no siempre dispara.

   Dos trampas que se documentan aquí para que quien las pise después no
   tenga que volver a encontrarlas:

   1. Con `snap-mandatory`, cambiar el número de páginas en caliente
      reposiciona el scroll (el navegador reancla al snap point más cercano,
      que ya no es el mismo índice). El `useLayoutEffect` de más abajo
      reancla explícitamente por índice cuando cambia `children.length` —
      relevante en cardio cuando el atleta cambia de layout de métricas a
      mitad de sesión (F8 del plan).
   2. Un gesto de arrastre horizontal (como el de `SlideAction`) DENTRO de
      una página se pelea con el scroll horizontal del propio Pager. Por eso
      en la pantalla en vivo de cardio los `SlideAction` viven en el cajón
      inferior, fuera del carrusel — igual que en FITIV, así que respetar esa
      estructura evita el conflicto por diseño, no por parche.
   ═══════════════════════════════════════════════════════════════════════════ */

interface PagerProps {
  /** Una página por hijo directo — cada una ocupa el ancho completo. */
  children: React.ReactNode[];
  value: number;
  onChange: (index: number) => void;
  /** Nombre del grupo para el lector de pantalla: «Métricas de la sesión». */
  label: string;
  /** 'inside' los superpone al contenido (pantallas oscuras a pantalla completa); 'outside' los deja en su propia fila; 'none' los oculta (por ejemplo si ya hay otro indicador). */
  dots?: 'inside' | 'outside' | 'none';
  className?: string;
}

export default function Pager({ children, value, onChange, label, dots = 'outside', className = '' }: PagerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCount = React.Children.count(children);
  const reducedMotion = useReducedMotion();

  // Evita que el propio `onScroll` reinterprete como "el usuario deslizó" el
  // scroll que acabamos de disparar nosotros mismos con `scrollTo`.
  const programmaticRef = useRef(false);

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const target = index * el.clientWidth;
    programmaticRef.current = true;
    el.scrollTo({ left: target, behavior: smooth && !reducedMotion ? 'smooth' : 'auto' });
    // No hay evento fiable de "scrollTo terminado" entre navegadores (ver
    // trampa de `scrollend` en la cabecera) — se suelta el flag tras un
    // margen prudente; si el usuario interviene con un gesto real durante
    // ese margen, `onScroll` simplemente recalcula bien igualmente, el flag
    // solo evita un `onChange` de eco inmediato con el valor que ya tenía.
    window.setTimeout(() => {
      programmaticRef.current = false;
      // Red de seguridad: un WKWebView que pasa a segundo plano un instante
      // (p. ej. al abrir una hoja del sistema) pausa el scroll suave sin
      // avisar y sin retomarlo — el navegador nunca llega al destino. Si tras
      // el margen previsto seguimos lejos, se corrige de golpe en vez de
      // dejar el carrusel descolocado para siempre.
      if (Math.abs(el.scrollLeft - target) > 2) el.scrollTo({ left: target, behavior: 'auto' });
    }, smooth && !reducedMotion ? 400 : 50);
  }, [reducedMotion]);

  // Reancla por índice cuando cambia el número de páginas (trampa 1) — p.ej.
  // al cambiar de layout de métricas a mitad de sesión en vivo.
  const prevCountRef = useRef(pageCount);
  useLayoutEffect(() => {
    if (prevCountRef.current !== pageCount) {
      prevCountRef.current = pageCount;
      scrollToIndex(Math.min(value, pageCount - 1), false);
    }
  }, [pageCount, value, scrollToIndex]);

  // Sincroniza el scroll cuando `value` cambia desde fuera (puntos, flechas).
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      scrollToIndex(value, true);
    }
  }, [value, scrollToIndex]);

  const rafRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (programmaticRef.current) return;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollRef.current;
      if (!el || el.clientWidth === 0) return;
      const index = Math.round(el.scrollLeft / el.clientWidth);
      const clamped = Math.max(0, Math.min(index, pageCount - 1));
      if (clamped !== prevValueRef.current) {
        prevValueRef.current = clamped;
        onChange(clamped);
      }
    });
  }, [pageCount, onChange]);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  const goTo = (index: number) => onChange(Math.max(0, Math.min(index, pageCount - 1)));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(value + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(value - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(pageCount - 1); }
  };

  const dotsRow = dots !== 'none' && pageCount > 1 && (
    <div className={dots === 'inside' ? 'absolute inset-x-0 bottom-2 flex justify-center gap-2 pointer-events-none' : 'flex justify-center gap-2 pt-2'}>
      {Array.from({ length: pageCount }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => goTo(i)}
          aria-label={`Página ${i + 1} de ${pageCount}`}
          aria-current={i === value}
          className={
            'h-1.5 rounded-full transition-[width,opacity] duration-(--duration-state) pointer-events-auto '
            + (i === value ? 'w-4 bg-ink opacity-90' : 'w-1.5 bg-ink opacity-30 hover:opacity-50')
          }
        />
      ))}
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollRef}
        role="group"
        aria-label={label}
        aria-roledescription="carrusel"
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain hide-scrollbar focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
      >
        {React.Children.map(children, (child, i) => (
          <div key={i} className="w-full shrink-0 snap-center" aria-hidden={i !== value}>
            {child}
          </div>
        ))}
      </div>
      {dotsRow}
    </div>
  );
}
