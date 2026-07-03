import React from 'react';

interface ProgressRingProps {
  pct: number;
  color?: string;
  label?: string;
}

// Circular progress ring — plain SVG, no charting lib needed for a single value.
export default function ProgressRing({ pct, color = '#fbcb1a', label = 'Semana' }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="relative w-[104px] h-[104px] flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e1e1b" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans font-extrabold text-2xl text-white leading-none">{Math.round(clamped)}%</span>
        <span className="font-mono text-[8px] text-[#c6c9ab] uppercase tracking-widest mt-1">{label}</span>
      </div>
    </div>
  );
}
