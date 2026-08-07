import React from 'react';
import Icon from './Icon';

/* ═══════════════════════════════════════════════════════════════════════════
   Tabs

   La píldora segmentada que la app repite por todas partes: el hub de cliente,
   Nutrición, Entrenamiento, Academia, Cardio, el CRM. Cada una se escribió a
   mano, y por eso F2 tuvo que arreglar CUATRO barras de pestañas que
   desbordaban a lo ancho — el desbordamiento horizontal de la app no lo
   causaba la barra inferior, como decía la auditoría, sino estas.

   Lo que la primitiva trae de serie:

     · **Nunca desborda.** Scroll horizontal con anclaje y la barra oculta. Con
       seis pestañas en 375 px no hay reparto de anchos que valga: se desliza.
     · **Teclado.** Flechas para moverse, Inicio y Fin para los extremos. Es lo
       que un `tablist` promete en cuanto declara ese papel; declararlo sin
       implementarlo es peor que no declararlo.
     · **El indicador no es solo color.** La pestaña activa cambia de peso
       tipográfico y de opacidad Y lleva un subrayado propio: distinguir la
       activa no puede depender de percibir un tono de oro sobre un fondo
       casi negro.

   La primitiva NO guarda el estado ni pinta el contenido: recibe `value` y
   avisa con `onChange`. Quién pinta qué es de la pantalla.

   Fase 3: el indicador pasa de "fondo de superficie" a "subrayado oro de
   2 px que entra por opacidad" — es el patrón que el handoff llama
   "Pestañas" (Navegación, no Componentes: ese nombre es del segmentado de
   pastilla deslizante, la primitiva nueva `SegmentedControl`). Las inactivas
   bajan al 40 % de opacidad en vez de a un gris de texto distinto, así el
   subrayado sigue siendo lo único que compite con el oro por atención.
   ═══════════════════════════════════════════════════════════════════════════ */

export type TabItem = {
  id: string;
  label: string;
  icon?: string;
  /** Cifra a la derecha: pendientes, sin leer. Se oculta sola cuando es 0. */
  count?: number;
};

type Props = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Nombre del grupo para el lector de pantalla: «Secciones del cliente». */
  label: string;
  className?: string;
};

export default function Tabs({ items, value, onChange, label, className = '' }: Props) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const alPulsarTecla = (e: React.KeyboardEvent, indice: number) => {
    const salto = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    let destino = -1;

    if (salto !== 0) destino = (indice + salto + items.length) % items.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = items.length - 1;
    else return;

    e.preventDefault();
    onChange(items[destino].id);
    // El foco sigue a la selección: si se queda atrás, la siguiente flecha
    // salta desde donde estaba el foco y no desde lo que se ve seleccionado.
    refs.current[destino]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-5 overflow-x-auto hide-scrollbar border-b border-hairline ${className}`}
      style={{ scrollSnapType: 'x proximity' }}
    >
      {items.map((item, i) => {
        const activa = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={activa}
            tabIndex={activa ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => alPulsarTecla(e, i)}
            style={{ scrollSnapAlign: 'start' }}
            className={
              'relative inline-flex shrink-0 items-center gap-2 px-1 py-3 '
              + 'font-sans text-body-s transition-[color,opacity] duration-(--duration-state) '
              + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:rounded-control '
              + (activa ? 'font-bold text-ink opacity-100' : 'font-medium text-ink-2 opacity-40 hover:opacity-70')
            }
          >
            {item.icon && <Icon name={item.icon} size="s" filled={activa} />}
            {item.label}
            {item.count != null && item.count > 0 && (
              <span className="rounded-full bg-accent/15 px-2 font-sans text-caption font-bold text-accent">
                {item.count}
              </span>
            )}
            {/* Subrayado propio, no compartido: entra/sale por opacidad
                (240 ms), nunca por ancho — así no "recorre" la barra al
                cambiar de pestaña lejana. */}
            <span
              aria-hidden
              className={
                'absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent transition-opacity duration-(--duration-state) '
                + (activa ? 'opacity-100' : 'opacity-0')
              }
            />
          </button>
        );
      })}
    </div>
  );
}
