import React from 'react';

interface ProgressRingProps {
  pct: number;
  color?: string;
  label?: string;
  size?: number; // px, default 104 (existing dashboard usage stays unchanged)
}

// Circular progress ring — plain SVG, no charting lib needed for a single value.
export default function ProgressRing({ pct, color = '#fbcb1a', label = 'Semana', size = 104 }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const compact = size < 80;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e1e1b" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
          style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-sans font-extrabold text-white leading-none ${compact ? 'text-xs' : 'text-2xl'}`}>{Math.round(clamped)}%</span>
        {!compact && <span className="font-mono text-[8px] text-[#c6c9ab] uppercase tracking-widest mt-1">{label}</span>}
      </div>
    </div>
  );
}
