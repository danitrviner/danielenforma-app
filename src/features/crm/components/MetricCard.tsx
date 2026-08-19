import React from 'react';
import { Icon } from '../../../components/ui';

interface Props {
  icon: string;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  onClick?: () => void;
}

// Tarjeta de métrica del dashboard y de las cabeceras de sección. Densidad tipo
// Whoop/Oura: etiqueta mono en versalitas, número grande con `tabular-nums`
// para que las cifras no bailen al actualizarse.
export default function MetricCard({ icon, label, value, sub, accent = 'var(--color-accent)', onClick }: Props) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`w-full text-left bg-surface/80 backdrop-blur-sm border border-hairline rounded-surface p-3 flex flex-col gap-2 ${
        onClick ? 'hover:border-strong transition-colors cursor-pointer' : ''
      }`}
    >
      {/* `flex-wrap`: en el grid de tres columnas del dashboard la tarjeta mide
          ~120 pt, y descontando padding, icono y hueco le quedan ~60 pt de
          texto. Con las versalitas y el `tracking-widest` ahí no cabe ni una
          palabra como «CONTINUIDAD», que se recortaba contra el borde. Al
          permitir el salto, la etiqueta baja a una línea propia y dispone del
          ancho entero de la tarjeta. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon
          name={icon}
          size="m"
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ color: accent, backgroundColor: `${accent}1a` }}
        />
        {/* `min-w-0` porque un hijo de flex no baja de su ancho de contenido sin
            él: «Conversión continuidad» se salía de su tarjeta y se leía
            «CONVERSIÓ CONTINUIDA» recortado contra el borde. Con esto parte la
            línea en vez de desbordar. Sin `break-words`, para que corte entre
            palabras y no por la mitad de una: las etiquetas que ni así quepan
            en una tarjeta a un tercio de pantalla hay que acortarlas, que es
            lo que se hizo con esa. */}
        <span className="font-sans text-caption uppercase tracking-widest text-ink-2 leading-tight min-w-0 break-words">{label}</span>
      </div>
      <span className="font-sans font-bold text-title-l text-ink leading-none tabular-nums">{value}</span>
      {sub && <span className="font-mono text-caption text-ink-3 uppercase tracking-wider">{sub}</span>}
    </Wrapper>
  );
}
