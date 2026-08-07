import React from 'react';
import Button from './Button';

/* ═══════════════════════════════════════════════════════════════════════════
   CollapsingHeader (Fase 3, nueva)

   La cabecera de pantalla del atleta: título grande en reposo (Archivo 900,
   46 px, dos líneas), que al pasar 30 px de scroll sube 8 px y se desvanece
   mientras aparece un título compacto de 15,5 px con una línea de 1 px
   debajo — 300 ms en los dos sentidos. La barra siempre lleva blur, esté o
   no desplazada: es lo que deja que el contenido pase por debajo sin que el
   título quede ilegible sobre él.

   Escucha el scroll de `window` porque así es como scrollean hoy las
   pantallas del atleta (`<main>` no tiene su propio contenedor con scroll
   propio) — si una pantalla concreta necesitara otro contenedor, la prop
   `scrollRef` lo permite sin cambiar el resto de la API.
   ═══════════════════════════════════════════════════════════════════════════ */

const UMBRAL_PX = 30;

type Props = {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
  /** Contenedor alternativo a `window` si la pantalla scrollea dentro de un div. */
  scrollRef?: React.RefObject<HTMLElement | null>;
  className?: string;
};

export default function CollapsingHeader({ title, onBack, action, scrollRef, className = '' }: Props) {
  const [desplazado, setDesplazado] = React.useState(false);

  React.useEffect(() => {
    const objetivo: (Window & typeof globalThis) | HTMLElement = scrollRef?.current ?? window;
    const leer = () => {
      const y = objetivo === window ? window.scrollY : (objetivo as HTMLElement).scrollTop;
      setDesplazado(y > UMBRAL_PX);
    };
    leer();
    objetivo.addEventListener('scroll', leer, { passive: true });
    return () => objetivo.removeEventListener('scroll', leer);
  }, [scrollRef]);

  return (
    <header
      className={
        `sticky top-0 z-[var(--z-header)] flex flex-col gap-1 bg-bg/92 px-5 pt-4 backdrop-blur-md transition-[padding] duration-(--duration-base) ease-brand ${className}`
      }
    >
      <div className="flex items-center gap-2">
        {onBack && <Button variant="ghost" size="s" icon="arrow_back" onClick={onBack} label="Volver" className="-ml-1 shrink-0" />}
        <div className="min-w-0 flex-1">
          {/* Título compacto: solo visible desplazado, con su línea propia. */}
          <div
            className={
              'flex items-center justify-between border-b border-hairline pb-3 transition-[opacity,transform] duration-(--duration-base) ease-brand '
              + (desplazado ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0 absolute')
            }
          >
            {/* El handoff pide 15,5 px; `title-s` (16) es el paso de la
                escala tipográfica más cercano — 0,5 px no se percibe y
                evita abrir un escalón nuevo solo para este caso. */}
            <h1 className="truncate font-sans text-title-s font-bold text-ink">{title}</h1>
            {action}
          </div>
        </div>
      </div>
      {/* Título grande: visible en reposo, sube y se desvanece al desplazar. */}
      <div
        className={
          'flex items-end justify-between gap-3 pb-4 transition-[opacity,transform] duration-(--duration-base) ease-brand '
          + (desplazado ? 'pointer-events-none -translate-y-2 opacity-0 absolute' : 'translate-y-0 opacity-100')
        }
      >
        <h1 className="font-display text-hero font-black uppercase leading-[1.05] tracking-tight text-ink">
          {title}
        </h1>
        {action}
      </div>
    </header>
  );
}
