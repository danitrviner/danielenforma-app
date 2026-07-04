import React from 'react';

interface StatTileProps {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: string;
}

// Small reusable stat tile: icon badge + uppercase mono label + bold value.
export default function StatTile({ icon, label, value, accent = '#fbcb1a' }: StatTileProps) {
  return (
    <div className="bg-[#1e1e1e] border border-white/7 rounded-2xl p-3 flex flex-col items-center text-center gap-1.5">
      <span
        className="material-symbols-outlined text-lg w-8 h-8 rounded-full flex items-center justify-center"
        style={{ color: accent, backgroundColor: `${accent}1a` }}
      >
        {icon}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#c6c9ab]">{label}</span>
      <span className="font-sans font-black text-lg text-white leading-none">{value}</span>
    </div>
  );
}
