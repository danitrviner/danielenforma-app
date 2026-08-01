import React from 'react';

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
export default function MetricCard({ icon, label, value, sub, accent = '#fbcb1a', onClick }: Props) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`w-full text-left bg-[#181816]/80 backdrop-blur-sm border border-white/7 rounded-2xl p-3 flex flex-col gap-1.5 ${
        onClick ? 'hover:border-white/12 transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-base w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ color: accent, backgroundColor: `${accent}1a` }}
        >
          {icon}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#a8a89e] leading-tight">{label}</span>
      </div>
      <span className="font-sans font-black text-2xl text-[#f5f5f0] leading-none tabular-nums">{value}</span>
      {sub && <span className="font-mono text-[9px] text-[#555550] uppercase tracking-wider">{sub}</span>}
    </Wrapper>
  );
}
