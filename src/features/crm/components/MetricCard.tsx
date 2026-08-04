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
      <div className="flex items-center gap-2">
        <Icon
          name={icon}
          size="m"
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ color: accent, backgroundColor: `${accent}1a` }}
        />
        <span className="font-sans text-caption uppercase tracking-widest text-ink-2 leading-tight">{label}</span>
      </div>
      <span className="font-sans font-bold text-title-l text-ink leading-none tabular-nums">{value}</span>
      {sub && <span className="font-mono text-caption text-ink-3 uppercase tracking-wider">{sub}</span>}
    </Wrapper>
  );
}
