import React from 'react';

interface ProgressRingProps {
  pct: number;
  color?: string;
  label?: string;
  size?: number; // px, default 104 (existing dashboard usage stays unchanged)
}

// Circular progress ring — plain SVG, no charting lib needed for a single value.
export default function ProgressRing({ pct, color = 'var(--color-accent)', label = 'Semana', size = 104 }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const compact = size < 80;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-raised)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-sans font-bold text-white leading-none ${compact ? 'text-label' : 'text-title-l'}`}>{Math.round(clamped)}%</span>
        {!compact && <span className="font-sans text-caption text-ink-2 uppercase tracking-widest mt-1">{label}</span>}
      </div>
    </div>
  );
}
