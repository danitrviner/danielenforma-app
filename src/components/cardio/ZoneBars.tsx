import React from 'react';
import { CardioZones } from '../../types';
import { ZONE_ORDER, ZONE_LABEL, ZONE_COLOR, BELOW_ZONE_LABEL, BELOW_ZONE_COLOR } from '../../utils/cardioZones';

// Tiempo por zona en vivo — página 3 del carrusel de FITIV: píldoras de
// color de rojo (Z5) a gris ("fuera de zona"), cada una con tiempo y %.

interface Props {
  timeInZone: Record<keyof CardioZones, number>;
  belowZoneSec: number;
  elapsedSec: number;
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export default function ZoneBars({ timeInZone, belowZoneSec, elapsedSec }: Props) {
  const total = Math.max(elapsedSec, 1);
  const rows = [
    ...[...ZONE_ORDER].reverse().map(z => ({ key: z, label: ZONE_LABEL[z], color: ZONE_COLOR[z], sec: timeInZone[z] })),
    { key: 'below', label: BELOW_ZONE_LABEL, color: BELOW_ZONE_COLOR, sec: belowZoneSec },
  ];

  return (
    <div className="space-y-1.5">
      {rows.map(row => {
        const pct = Math.round((row.sec / total) * 100);
        return (
          <div key={row.key} className="flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{ backgroundColor: `${row.color}1a`, border: `1px solid ${row.color}40` }}>
            <p className="flex-1 min-w-0 text-[10px] font-mono uppercase truncate" style={{ color: row.color }}>{row.label}</p>
            <p className="text-[10px] font-mono text-white tabular-nums">{fmt(row.sec)}</p>
            <p className="text-[10px] font-mono tabular-nums w-9 text-right" style={{ color: row.color }}>{pct}%</p>
          </div>
        );
      })}
    </div>
  );
}
