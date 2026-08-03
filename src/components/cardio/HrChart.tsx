import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts';
import { CardioZones } from '../../types';
import { ZONE_ORDER, ZONE_COLOR, pctOfMaxHR } from '../../utils/cardioZones';

// Gráfica de FC con bandas de zona de fondo + BPM a la izquierda y % de
// FCmax a la derecha — página 4 del carrusel en vivo y bloque 7 del informe
// post-entreno de FITIV (§4bis.1 / §4bis.4 del análisis).

// recharts' ReferenceArea prop types don't declare `key`, even though React
// needs it for the list below (mismo patrón que NutritionPerformanceDashboard.tsx).
const ReferenceAreaAny = ReferenceArea as unknown as React.FC<Record<string, unknown>>;

interface Props {
  data: { t: number; bpm: number }[];
  zones: CardioZones;
  maxHR?: number;
  height?: number;
}

export default function HrChart({ data, zones, maxHR, height = 140 }: Props) {
  if (data.length < 2) return null;

  const boundaryTicks = [zones.z2.min, zones.z3.min, zones.z4.min, zones.z5.min];

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: maxHR ? 4 : 12, left: 0, bottom: 0 }}>
          {ZONE_ORDER.map(z => (
            <ReferenceAreaAny key={z} yAxisId="bpm" y1={zones[z].min} y2={zones[z].max} fill={ZONE_COLOR[z]} fillOpacity={0.12} strokeWidth={0} />
          ))}
          <XAxis dataKey="t" hide />
          <YAxis yAxisId="bpm" domain={['dataMin - 10', 'dataMax + 10']} ticks={boundaryTicks}
            tick={{ fontSize: 9, fill: 'var(--color-ink-2)' }} width={28} axisLine={false} tickLine={false} />
          {maxHR && (
            <YAxis yAxisId="pct" orientation="right" domain={['dataMin - 10', 'dataMax + 10']} ticks={boundaryTicks}
              tickFormatter={v => `${pctOfMaxHR(v, maxHR)}%`} tick={{ fontSize: 9, fill: 'var(--color-ink-2)' }} width={28} axisLine={false} tickLine={false} />
          )}
          <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }} />
          <Line yAxisId="bpm" type="monotone" dataKey="bpm" stroke="#ffffff" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
