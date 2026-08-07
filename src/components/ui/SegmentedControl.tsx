import React from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   SegmentedControl (Fase 3, nueva)

   El "Segmentado" del handoff (Componentes 04, distinto de "Pestañas" de
   Navegación, que es `Tabs`): 46 px, fondo `surface`, una pastilla de oro
   que se DESLIZA entre opciones en vez de que cada opción lleve su propio
   resaltado. Pensado para 2-4 opciones fijas que no necesitan scroll ni
   `role="tablist"` semántico —un modo de vista, un tipo de dieta, LISS/HIIT/
   Pasos— no para navegación con muchos items (eso sigue siendo `Tabs`).

   La pastilla se mide del DOM real (`getBoundingClientRect` del botón
   activo relativo al contenedor), no de un cálculo de "ancho / nº opciones":
   las opciones no miden lo mismo (un icono, una palabra corta, una larga), y
   una pastilla de ancho fijo se saldría de la que sea más ancha.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SegmentedOption = { value: string; label: string };

type Props = {
  options: SegmentedOption[];
  value: string;
  onChange: (valor: string) => void;
  label: string;
  className?: string;
};

export default function SegmentedControl({ options, value, onChange, label, className = '' }: Props) {
  const contenedorRef = React.useRef<HTMLDivElement>(null);
  const botonesRef = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [pastilla, setPastilla] = React.useState<{ left: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    const contenedor = contenedorRef.current;
    const boton = botonesRef.current[value];
    if (!contenedor || !boton) return;
    const rectContenedor = contenedor.getBoundingClientRect();
    const rectBoton = boton.getBoundingClientRect();
    setPastilla({ left: rectBoton.left - rectContenedor.left, width: rectBoton.width });
  }, [value, options]);

  return (
    <div
      ref={contenedorRef}
      role="radiogroup"
      aria-label={label}
      className={`relative flex h-[46px] items-center gap-1 rounded-control bg-surface p-1 ${className}`}
    >
      {pastilla && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-control bg-accent transition-[transform,width] duration-(--duration-slide) ease-brand"
          style={{ width: pastilla.width, transform: `translateX(${pastilla.left}px)` }}
        />
      )}
      {options.map((o) => {
        const activo = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { botonesRef.current[o.value] = el; }}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(o.value)}
            className={
              'relative z-10 flex-1 rounded-control px-3 py-2 font-sans text-body-s font-bold transition-colors duration-(--duration-state) '
              + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line '
              + (activo ? 'text-on-accent' : 'text-ink-2 hover:text-ink')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
