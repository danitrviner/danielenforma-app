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
  /** Color del punto activo (p.ej. el color de zona en Cardio en vivo).
   *  Sin especificar, usa el neutro `bg-ink` de siempre. */
  activeDotColor?: string;
  /** 'content' (por defecto) da al carrusel el alto de la página activa —
   *  lo correcto cuando vive en el flujo normal y debajo viene más contenido.
   *  'fill' le hace ocupar TODO el alto que le dé su contenedor (requiere que
   *  el `className` ya sea `h-full` o similar) y hace scrollear en vertical
   *  cada página por dentro. Sin esto, un Pager dentro de un `flex-1` a
   *  pantalla completa se encoge al alto de su página más corta y deja una
   *  franja de pocos píxeles como única zona deslizable: el resto del hueco
   *  negro no pertenece al carrusel y el gesto no llega — el fallo que Dani
   *  vio en la sesión de cardio en vivo (21-08). */
  height?: 'content' | 'fill';
}

export default function Pager({ children, value, onChange, label, dots = 'outside', className = '', activeDotColor, height = 'content' }: PagerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCount = React.Children.count(children);
  const reducedMotion = useReducedMotion();
  const fill = height === 'fill';

  // Alto de la página activa, no el de la más alta de todas — `flex` mide su
  // propio alto por el hijo más grande aunque el resto no se estiren
  // (`items-start` de más abajo solo evita que SE ESTIREN, no reduce el alto
  // del contenedor). Sin esto, una página corta (p.ej. el último ejercicio de
  // la sesión) deja un hueco vacío del tamaño de la página más alta antes de
  // lo que venga después en el flujo normal.
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeHeight, setActiveHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (fill) return;
    const el = pageRefs.current[value];
    if (el) setActiveHeight(el.offsetHeight);
  }, [value, pageCount, fill]);
  useEffect(() => {
    if (fill) return;
    const el = pageRefs.current[value];
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setActiveHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, fill]);

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

  // Trampa 3 (Dani, 26-08): con un gesto FUERTE el carrusel se quedaba a
  // medio camino entre dos ejercicios. `snap-mandatory` promete anclar, pero
  // el WKWebView de iOS abandona el anclado si el contenido del carrusel se
  // re-maqueta mientras aún hay inercia — y aquí se re-maqueta siempre: cada
  // `onChange` re-renderiza el player entero (barra de progreso, temporizador
  // que salta de tarjeta, alto de la página activa). No se puede evitar el
  // re-render, así que se corrige el destino: cuando el scroll se queda
  // quieto, si no estamos clavados en un múltiplo del ancho, se ancla a mano.
  // Se comprueba SIEMPRE al asentarse, no solo cuando cambia el índice: el
  // caso roto es justo el de quedarse descuadrado dentro de la misma página.
  const settleRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const anclarAlAsentarse = useCallback(() => {
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      setDragging(false);
      const el = scrollRef.current;
      if (!el || el.clientWidth === 0) return;
      const index = Math.max(0, Math.min(Math.round(el.scrollLeft / el.clientWidth), pageCount - 1));
      const target = index * el.clientWidth;
      // 1px de tolerancia: en pantallas con escala fraccionaria el propio
      // anclado nativo deja décimas de píxel, y corregir eso sería un bucle.
      if (Math.abs(el.scrollLeft - target) <= 1) return;
      programmaticRef.current = true;
      el.scrollTo({ left: target, behavior: reducedMotion ? 'auto' : 'smooth' });
      window.setTimeout(() => {
        programmaticRef.current = false;
        if (Math.abs(el.scrollLeft - target) > 2) el.scrollTo({ left: target, behavior: 'auto' });
      }, reducedMotion ? 50 : 400);
    }, 160);
  }, [pageCount, reducedMotion]);

  const rafRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (programmaticRef.current) return;
    setDragging(true);
    anclarAlAsentarse();
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
  }, [pageCount, onChange, anclarAlAsentarse]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
  }, []);

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
            + (i === value ? `w-4 opacity-90 ${activeDotColor ? '' : 'bg-ink'}` : 'w-1.5 bg-ink opacity-30 hover:opacity-50')
          }
          style={i === value && activeDotColor ? { background: activeDotColor } : undefined}
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
        className={
          'flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain hide-scrollbar focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
          + (fill ? 'h-full items-stretch' : 'items-start')
        }
        /* Mientras el dedo (o la inercia) manda, el alto cambia de golpe y sin
           animar: una transición de alto en marcha es re-maquetación continua
           dentro del contenedor que está scrolleando, justo lo que hace que
           iOS suelte el anclado (trampa 3). */
        style={!fill && activeHeight != null ? { height: activeHeight, transition: reducedMotion || dragging ? undefined : 'height 200ms ease' } : undefined}
      >
        {React.Children.map(children, (child, i) => (
          <div
            key={i}
            ref={el => { pageRefs.current[i] = el; }}
            className={
              'w-full shrink-0 snap-center'
              + (fill ? ' h-full overflow-y-auto overscroll-y-contain' : '')
              // Los puntos 'inside' flotan sobre el contenido: en modo 'fill'
              // una página que scrollea por dentro se les metería debajo.
              + (fill && dots === 'inside' ? ' pb-7' : '')
            }
            aria-hidden={i !== value}
          >
            {child}
          </div>
        ))}
      </div>
      {dotsRow}
    </div>
  );
}
