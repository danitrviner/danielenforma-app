import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ReferenceDot, ResponsiveContainer } from 'recharts';
import { CardioZones } from '../../types';
import { ZONE_ORDER, ZONE_LABEL, ZONE_COLOR, BELOW_ZONE_COLOR, getZoneForBpm, pctOfMaxHR } from '../../utils/cardioZones';
import { MARGEN_GRAFICA, ANCHO_EJE_Y, TICK_GRAFICA, EJE_GRAFICA, TOOLTIP_GRAFICA } from '../ui';

// Gráfica de FC con bandas de zona de fondo + BPM a la izquierda y % de
// FCmax a la derecha — página 4 del carrusel en vivo y bloque 7 del informe
// post-entreno de FITIV (§4bis.1 / §4bis.4 del análisis).

// recharts' ReferenceArea prop types don't declare `key`, even though React
// needs it for the list below (mismo patrón que NutritionPerformanceDashboard.tsx).
const ReferenceAreaAny = ReferenceArea as unknown as React.FC<Record<string, unknown>>;

/**
 * Punto "en directo" del último dato — panel 05 (Zonas de Frecuencia) de
 * Graficas - Experiencia.dc.html: un halo que respira alrededor del punto
 * actual, no solo la línea llegando hasta el borde. `cx`/`cy` los calcula
 * Recharts a partir de `x`/`y` en coordenadas de dato; sin ellos (primer
 * render, antes de que el eje tenga escala) no se dibuja nada.
 */
function LiveDot({ cx, cy, fill }: { cx?: number; cy?: number; fill: string }) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={fill} strokeWidth={2} className="animate-ghost-tap" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="var(--color-bg)" strokeWidth={2} />
    </g>
  );
}

interface Props {
  data: { t: number; bpm: number }[];
  zones: CardioZones;
  maxHR?: number;
  height?: number;
}

export default function HrChart({ data, zones, maxHR, height = 140 }: Props) {
  if (data.length < 2) return null;

  const boundaryTicks = [zones.z2.min, zones.z3.min, zones.z4.min, zones.z5.min];
  const last = data[data.length - 1];
  const liveZone = getZoneForBpm(last.bpm, zones);
  const liveColor = liveZone ? ZONE_COLOR[liveZone] : BELOW_ZONE_COLOR;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={MARGEN_GRAFICA}>
          {/* Sin CartesianGrid a propósito: las bandas de zona SON la referencia
              de esta gráfica. Añadirle una rejilla encima sería rediseñarla. */}
          {ZONE_ORDER.map(z => (
            <ReferenceAreaAny
              key={z}
              yAxisId="bpm"
              y1={zones[z].min}
              y2={zones[z].max}
              fill={ZONE_COLOR[z]}
              fillOpacity={0.28}
              strokeWidth={0}
              // Texto neutro, no del color de la propia zona: verificado en el
              // navegador, cuando la zona ACTUAL de la sesión coincide con la
              // de una banda (p. ej. Z2 sobre fondo Z2), el texto se vuelve
              // ilegible sobre sí mismo. FITIV además rotula así de verdad —
              // negro plano sobre cada banda (§4bis.1 del análisis), no del
              // color de la banda.
              label={{ value: ZONE_LABEL[z].replace(/^Z\d\s/, ''), position: 'insideLeft', fill: 'var(--color-ink)', fontSize: 11, fontFamily: 'monospace', opacity: 0.85 }}
            />
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
          <ReferenceDot
            yAxisId="bpm"
            x={last.t}
            y={last.bpm}
            r={4.5}
            shape={p => <LiveDot cx={p.cx} cy={p.cy} fill={liveColor} />}
            label={{ value: `${last.bpm}`, position: 'top', fill: 'var(--color-ink)', fontSize: 13, fontFamily: 'monospace', fontWeight: 700 }}
            isFront
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
