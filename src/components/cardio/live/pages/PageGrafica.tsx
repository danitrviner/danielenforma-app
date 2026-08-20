import React from 'react';
import { CardioZones } from '../../../../types';
import { ZONE_ORDER, ZONE_LABEL, ZONE_COLOR, BELOW_ZONE_LABEL, BELOW_ZONE_COLOR, getZoneForBpm } from '../../../../utils/cardioZones';

/* Página 4 del carrusel — calco 1:1 del panel 05 "Zonas de Frecuencia" de
   Graficas - Experiencia.dc.html (a petición de Dani, 2026-08-20): bandas de
   zona macizas con la línea en vivo dibujada DENTRO de ellas (ya no aparte,
   como con HrChart/Recharts), lista de zonas en orden ascendente Z1→Z5 con
   la fila actual resaltada, y el reparto de la sesión como barra segmentada
   al final — las cuatro piezas que trae ese panel. Encargo acotado a esta
   página: los colores de zona siguen siendo los del Design System (Z2 cian,
   no verde) y la cabecera con el ppm grande vive fuera, en LiveSession. */

interface Props {
  chartData: { t: number; bpm: number }[];
  zones: CardioZones;
  maxHR?: number;
  timeInZone: Record<keyof CardioZones, number>;
  belowZoneSec: number;
  elapsedSec: number;
  currentZone?: keyof CardioZones | null;
}

const ZONE_RANK: Record<keyof CardioZones, number> = { z1: 0, z2: 1, z3: 2, z4: 3, z5: 4 };
const WINDOW_SEC = 90; // "ÚLTIMOS 90 S" del mockup
const CHART_H = 180;
const CHART_W = 350;

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

/** Posición vertical dentro de la gráfica (0 = suelo de Z1, 1 = techo de Z5),
 * banda a banda de igual alto — así se reproduce el efecto del mockup (5
 * franjas iguales) sin que la línea dependa de lo ancho que sea cada zona
 * en PPM reales; el mock tampoco lo hace, son franjas parejas a propósito. */
function bandFraction(bpm: number, zones: CardioZones): number {
  const zone = getZoneForBpm(bpm, zones);
  if (!zone) return bpm < zones.z1.min ? 0 : 1;
  const { min, max } = zones[zone];
  const within = max > min ? Math.min(1, Math.max(0, (bpm - min) / (max - min))) : 0.5;
  return (ZONE_RANK[zone] + within) / 5;
}

export default function PageGrafica({ chartData, zones, timeInZone, belowZoneSec, elapsedSec, currentZone }: Props) {
  if (chartData.length < 2) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="text-caption font-sans uppercase text-white/50 text-center">Reuniendo datos de la sesión…</p>
      </div>
    );
  }

  const windowStart = chartData[chartData.length - 1].t - WINDOW_SEC;
  const windowed = chartData.filter(p => p.t >= windowStart);
  const t0 = windowed[0].t;
  const tSpan = Math.max(1, windowed[windowed.length - 1].t - t0);
  const points = windowed.map(p => ({
    x: ((p.t - t0) / tSpan) * CHART_W,
    y: CHART_H - bandFraction(p.bpm, zones) * CHART_H,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const lastBpm = windowed[windowed.length - 1].bpm;
  const lastColor = currentZone ? ZONE_COLOR[currentZone] : BELOW_ZONE_COLOR;

  const total = Math.max(elapsedSec, 1);

  return (
    <div className="flex h-full flex-col gap-4 justify-center px-3 overflow-y-auto hide-scrollbar">
      {/* Bandas de zona + línea en vivo */}
      <div className="relative rounded-2xl overflow-hidden" style={{ height: CHART_H, background: 'rgba(0,0,0,.35)' }}>
        <div className="absolute inset-0 flex flex-col">
          {[...ZONE_ORDER].reverse().map(z => (
            <div
              key={z}
              className="flex-1 flex items-center justify-end pr-2.5 border-b border-white/5 last:border-b-0"
              style={{ background: `${ZONE_COLOR[z]}22` }}
            >
              <span className="font-mono text-[9.5px]" style={{ color: `${ZONE_COLOR[z]}c0` }}>{z.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="absolute left-0 top-0" preserveAspectRatio="none">
          <path d={pathD} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={last.x} cy={last.y} r={7} fill="none" stroke={lastColor} strokeWidth={2} className="animate-ghost-tap" style={{ transformOrigin: `${last.x}px ${last.y}px` }} />
          <circle cx={last.x} cy={last.y} r={4.5} fill={lastColor} stroke="rgba(0,0,0,.35)" strokeWidth={2} />
        </svg>
        <span
          className="absolute font-mono font-bold text-[15px]"
          style={{ color: lastColor, left: Math.min(last.x, CHART_W - 34), top: Math.max(last.y - 26, 4) }}
        >
          {lastBpm}
        </span>
        <div className="absolute left-3.5 bottom-2.5 font-mono text-[9.5px] text-white/25">ÚLTIMOS {WINDOW_SEC} S</div>
      </div>

      {/* Lista de zonas, Z1 → Z5 ascendente, fila actual resaltada */}
      <div className="flex flex-col">
        {ZONE_ORDER.map(z => {
          const isNow = z === currentZone;
          return (
            <div
              key={z}
              className="h-[50px] flex items-center justify-between border-t border-white/5"
              style={isNow ? { borderTopColor: `${ZONE_COLOR[z]}4d`, background: `${ZONE_COLOR[z]}0f`, margin: '0 -10px', padding: '0 10px', borderRadius: 8 } : undefined}
            >
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: ZONE_COLOR[z] }} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13.5px]" style={{ color: isNow ? ZONE_COLOR[z] : 'rgba(255,255,255,.8)' }}>{ZONE_LABEL[z]}</span>
                  <span className="font-mono text-[10.5px]" style={{ color: isNow ? ZONE_COLOR[z] : 'rgba(255,255,255,.3)' }}>
                    {zones[z].min}-{zones[z].max} PPM{isNow ? ' · AHORA' : ''}
                  </span>
                </div>
              </div>
              <span className="font-mono text-[13px]" style={{ color: isNow ? ZONE_COLOR[z] : 'rgba(255,255,255,.5)', fontWeight: isNow ? 700 : 600 }}>
                {fmt(timeInZone[z])}
              </span>
            </div>
          );
        })}
        <div className="h-[50px] flex items-center justify-between border-t border-white/5 opacity-60">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: BELOW_ZONE_COLOR }} />
            <span className="text-[13.5px] text-white/80">{BELOW_ZONE_LABEL}</span>
          </div>
          <span className="font-mono text-[13px] font-semibold text-white/50">{fmt(belowZoneSec)}</span>
        </div>
      </div>

      {/* Reparto de la sesión */}
      <div className="bg-black/25 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] tracking-wide text-white/40 uppercase">Reparto de la sesión</span>
          <span className="font-mono text-[10.5px] text-white/35">{fmt(elapsedSec)}</span>
        </div>
        <div className="h-3.5 rounded-md overflow-hidden flex gap-0.5">
          {ZONE_ORDER.map(z => (
            <div key={z} style={{ width: `${Math.max((timeInZone[z] / total) * 100, 0)}%`, background: ZONE_COLOR[z] }} />
          ))}
        </div>
        <span className="text-[12.5px] leading-relaxed text-white/50">
          {currentZone
            ? `Llevas ${fmt(timeInZone[currentZone])} en ${ZONE_LABEL[currentZone].toLowerCase()}.`
            : 'Aún no has entrado en zona.'}
        </span>
      </div>
    </div>
  );
}
