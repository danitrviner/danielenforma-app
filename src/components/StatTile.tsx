import React from 'react';
import { Icon } from './ui';

interface StatTileProps {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: string;
  key?: React.Key;
}

// Small reusable stat tile: icon badge + uppercase mono label + bold value.
export default function StatTile({ icon, label, value, accent = 'var(--color-accent)' }: StatTileProps) {
  return (
    <div className="bg-raised border border-hairline rounded-surface p-3 flex flex-col items-center text-center gap-2">
      <Icon
        name={icon}
        size="l"
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ color: accent, backgroundColor: `${accent}1a` }}
      />
      <span className="font-sans text-caption uppercase tracking-widest text-ink-2">{label}</span>
      <span className="font-sans font-bold text-title-m text-white leading-none">{value}</span>
    </div>
  );
}
