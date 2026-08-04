import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts';
import { CardioZones } from '../../types';
import { ZONE_ORDER, ZONE_COLOR, pctOfMaxHR } from '../../utils/cardioZones';
import { MARGEN_GRAFICA, ANCHO_EJE_Y, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA } from '../ui';

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
        <LineChart data={data} margin={MARGEN_GRAFICA}>
          {/* Sin CartesianGrid a propósito: las bandas de zona SON la referencia
              de esta gráfica. Añadirle una rejilla encima sería rediseñarla. */}
          {ZONE_ORDER.map(z => (
            <ReferenceAreaAny key={z} yAxisId="bpm" y1={zones[z].min} y2={zones[z].max} fill={ZONE_COLOR[z]} fillOpacity={0.12} strokeWidth={0} />
          ))}
          <XAxis dataKey="t" hide />
          <YAxis yAxisId="bpm" domain={['dataMin - 10', 'dataMax + 10']} ticks={boundaryTicks}
            tick={TICK_GRAFICA} width={ANCHO_EJE_Y} {...EJE_GRAFICA} />
          {maxHR && (
            <YAxis yAxisId="pct" orientation="right" domain={['dataMin - 10', 'dataMax + 10']} ticks={boundaryTicks}
              tickFormatter={v => `${pctOfMaxHR(v, maxHR)}%`} tick={TICK_GRAFICA} width={ANCHO_EJE_Y} {...EJE_GRAFICA} />
          )}
          <Tooltip {...TOOLTIP_GRAFICA} />
          <Line yAxisId="bpm" type="monotone" dataKey="bpm" stroke="var(--color-ink)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
